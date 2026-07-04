BEGIN;

-- ============================================================
-- 101_block_time_topups.sql
-- Block Time top-ups: history table, invoice type, atomic apply
-- ============================================================

-- ------------------------------------------------------------
-- 1) Top-up history / audit table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.block_time_topups (
  id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id              uuid           NOT NULL REFERENCES public.pilot_block_time_purchases (id) ON DELETE RESTRICT,
  user_id                  uuid           NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  hours_added              numeric(8,2)   NOT NULL CHECK (hours_added > 0),
  rate_per_hour            numeric(10,2)  NOT NULL CHECK (rate_per_hour > 0),
  amount_paid              numeric(10,2)  NOT NULL,
  validity_extension_days  integer        NOT NULL CHECK (validity_extension_days >= 0),
  hours_remaining_before   numeric(8,2)   NOT NULL CHECK (hours_remaining_before >= 0),
  hours_remaining_after    numeric(8,2)   NOT NULL CHECK (hours_remaining_after >= 0),
  expires_at_before        timestamptz    NOT NULL,
  expires_at_after         timestamptz    NOT NULL,
  stripe_payment_intent_id text           UNIQUE,
  invoice_id               uuid           REFERENCES public.invoices (id) ON DELETE SET NULL,
  created_at               timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT bt_topups_amount_check
    CHECK (amount_paid = ROUND(hours_added * rate_per_hour, 2))
);

CREATE INDEX IF NOT EXISTS idx_bt_topups_purchase_id
  ON public.block_time_topups (purchase_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bt_topups_user_id
  ON public.block_time_topups (user_id, created_at DESC);

ALTER TABLE public.block_time_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own block time topups" ON public.block_time_topups;
CREATE POLICY "Users can view own block time topups"
  ON public.block_time_topups
  FOR SELECT
  USING (auth.uid() = user_id OR public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Admins can manage block time topups" ON public.block_time_topups;
CREATE POLICY "Admins can manage block time topups"
  ON public.block_time_topups
  FOR ALL
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');


-- ------------------------------------------------------------
-- 2) Distinct invoice type for top-up receipts
--    (so nothing that counts 'block_time_purchase' invoices
--    silently starts including top-ups)
-- ------------------------------------------------------------
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
  CHECK (type IN ('block_time_purchase', 'block_time_topup', 'flight', 'credit_note'));


-- ------------------------------------------------------------
-- 3) Atomic top-up application
--    Locks the purchase row (same FOR UPDATE discipline as
--    process_block_time_flight) so concurrent top-ups and
--    drawdowns serialise; idempotent per payment intent so a
--    webhook double-fire can never double-apply.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_block_time_topup(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.apply_block_time_topup(
  p_purchase_id              uuid,
  p_hours                    numeric(8,2),
  p_stripe_payment_intent_id text
)
RETURNS TABLE (
  out_topup_id                uuid,
  out_already_applied         boolean,
  out_user_id                 uuid,
  out_package_name            text,
  out_hours_added             numeric(8,2),
  out_amount_paid             numeric(10,2),
  out_rate_per_hour           numeric(10,2),
  out_validity_extension_days integer,
  out_new_hours_purchased     numeric(8,2),
  out_new_hours_remaining     numeric(8,2),
  out_new_expires_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase  public.pilot_block_time_purchases%ROWTYPE;
  v_pkg       public.block_time_packages%ROWTYPE;
  v_existing  public.block_time_topups%ROWTYPE;
  v_hours     numeric(8,2);
  v_amount    numeric(10,2);
  v_extension integer;
  v_topup_id  uuid;
BEGIN
  IF p_hours IS NULL OR p_hours <= 0 THEN
    RAISE EXCEPTION 'Top-up hours must be positive';
  END IF;

  IF p_stripe_payment_intent_id IS NULL OR p_stripe_payment_intent_id = '' THEN
    RAISE EXCEPTION 'A Stripe payment intent id is required to apply a top-up';
  END IF;

  v_hours := ROUND(p_hours, 2);

  -- Step 1: Lock the purchase row.
  SELECT *
  INTO v_purchase
  FROM public.pilot_block_time_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time purchase % not found', p_purchase_id;
  END IF;

  SELECT *
  INTO v_pkg
  FROM public.block_time_packages
  WHERE id = v_purchase.package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time package % not found', v_purchase.package_id;
  END IF;

  -- Step 2: Idempotency — one payment intent applies exactly once.
  SELECT *
  INTO v_existing
  FROM public.block_time_topups
  WHERE stripe_payment_intent_id = p_stripe_payment_intent_id;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.id,
      true,
      v_purchase.user_id,
      v_pkg.name,
      v_existing.hours_added,
      v_existing.amount_paid,
      v_existing.rate_per_hour,
      v_existing.validity_extension_days,
      v_purchase.hours_purchased,
      v_purchase.hours_remaining,
      v_purchase.expires_at;
    RETURN;
  END IF;

  -- 'exhausted' is tolerated for the payment-in-flight race (customer flies
  -- the balance to zero while the top-up payment is processing); the top-up
  -- restores hours so the row goes back to 'active'.
  IF v_purchase.status NOT IN ('active', 'exhausted') THEN
    RAISE EXCEPTION 'Block time purchase % is % — only active packages can be topped up',
      p_purchase_id, v_purchase.status;
  END IF;

  -- Step 3: Apply at the rate locked in on the purchase row, never the
  -- package's current rate. Expiry extends by half the package's validity,
  -- from the current expiry (not from today).
  v_amount    := ROUND(v_hours * v_purchase.rate_per_hour, 2);
  v_extension := CEIL(v_pkg.validity_days / 2.0)::integer;

  UPDATE public.pilot_block_time_purchases
  SET hours_purchased = ROUND(hours_purchased + v_hours, 2),
      hours_remaining = ROUND(hours_remaining + v_hours, 2),
      -- keep the amount_paid = hours_purchased * rate_per_hour check satisfied
      amount_paid     = ROUND((hours_purchased + v_hours) * rate_per_hour, 2),
      expires_at      = expires_at + make_interval(days => v_extension),
      status          = 'active',
      updated_at      = now()
  WHERE id = v_purchase.id;

  -- Step 4: Record the top-up for audit/history.
  INSERT INTO public.block_time_topups (
    purchase_id,
    user_id,
    hours_added,
    rate_per_hour,
    amount_paid,
    validity_extension_days,
    hours_remaining_before,
    hours_remaining_after,
    expires_at_before,
    expires_at_after,
    stripe_payment_intent_id
  ) VALUES (
    v_purchase.id,
    v_purchase.user_id,
    v_hours,
    v_purchase.rate_per_hour,
    v_amount,
    v_extension,
    v_purchase.hours_remaining,
    ROUND(v_purchase.hours_remaining + v_hours, 2),
    v_purchase.expires_at,
    v_purchase.expires_at + make_interval(days => v_extension),
    p_stripe_payment_intent_id
  )
  RETURNING id INTO v_topup_id;

  RETURN QUERY SELECT
    v_topup_id,
    false,
    v_purchase.user_id,
    v_pkg.name,
    v_hours,
    v_amount,
    v_purchase.rate_per_hour,
    v_extension,
    ROUND(v_purchase.hours_purchased + v_hours, 2),
    ROUND(v_purchase.hours_remaining + v_hours, 2),
    v_purchase.expires_at + make_interval(days => v_extension);
END;
$$;

COMMIT;
