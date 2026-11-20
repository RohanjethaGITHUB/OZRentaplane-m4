-- 115_black_friday_promotion.sql
--
-- Admin-controlled block time promotions (first use: Black Friday 2026).
--
--   promotions               — the sale window and switches, edited from /admin/promotions
--   promotion_package_rules  — per block time package: bonus hours + free checkout flag
--   checkout_credits         — one free checkout flight per qualifying purchase
--   block_time_bonus_grants  — audit of every bonus hour (promotion or manual admin grant)
--
-- Functions (service_role only — callers authorise in the app layer first):
--   record_block_time_promotion(purchase, promotion, bonus_hours, free_checkout)
--       Called by the Stripe webhook after a promo purchase is activated.
--       Idempotent: re-running for the same purchase never duplicates a grant or credit.
--   apply_checkout_credit_to_booking(booking_id)
--       Uses an available checkout credit to settle a checkout invoice at $0,
--       restores any account credit the invoice consumed, completes the booking
--       and promotes pilot clearance to the recorded outcome.

BEGIN;

-- ── 1. promotions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promotions (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      text        NOT NULL UNIQUE,
  name                      text        NOT NULL,
  is_enabled                boolean     NOT NULL DEFAULT false,
  starts_at                 timestamptz NOT NULL,
  ends_at                   timestamptz NOT NULL,
  allow_uncleared_purchase  boolean     NOT NULL DEFAULT true,
  headline                  text,
  marquee_text              text,
  created_by                uuid        REFERENCES auth.users(id),
  updated_by                uuid        REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_window_check CHECK (ends_at > starts_at)
);

DROP TRIGGER IF EXISTS trigger_promotions_updated_at ON public.promotions;
CREATE TRIGGER trigger_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. promotion_package_rules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promotion_package_rules (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id            uuid          NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  package_id              uuid          NOT NULL REFERENCES public.block_time_packages(id) ON DELETE CASCADE,
  bonus_hours             numeric(6,2)  NOT NULL DEFAULT 0 CHECK (bonus_hours >= 0 AND bonus_hours <= 50),
  includes_free_checkout  boolean       NOT NULL DEFAULT true,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT promotion_package_rules_unique UNIQUE (promotion_id, package_id)
);

DROP TRIGGER IF EXISTS trigger_promotion_package_rules_updated_at ON public.promotion_package_rules;
CREATE TRIGGER trigger_promotion_package_rules_updated_at
  BEFORE UPDATE ON public.promotion_package_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. purchase columns ──────────────────────────────────────────────────────
-- bonus_hours is kept separate from hours_purchased so invoices and refunds can
-- tell paid hours from free hours. hours_remaining includes the bonus.
ALTER TABLE public.pilot_block_time_purchases
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id),
  ADD COLUMN IF NOT EXISTS bonus_hours  numeric(10,2) NOT NULL DEFAULT 0;

-- ── 4. checkout_credits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checkout_credits (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id         uuid        REFERENCES public.pilot_block_time_purchases(id) ON DELETE SET NULL,
  promotion_id        uuid        REFERENCES public.promotions(id),
  status              text        NOT NULL DEFAULT 'available'
                                  CHECK (status IN ('available', 'used', 'cancelled')),
  used_on_booking_id  uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  used_on_invoice_id  uuid,
  used_at             timestamptz,
  cancelled_reason    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One credit per purchase (makes the webhook path idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_credits_purchase
  ON public.checkout_credits (purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkout_credits_user_status
  ON public.checkout_credits (user_id, status);

DROP TRIGGER IF EXISTS trigger_checkout_credits_updated_at ON public.checkout_credits;
CREATE TRIGGER trigger_checkout_credits_updated_at
  BEFORE UPDATE ON public.checkout_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. block_time_bonus_grants ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.block_time_bonus_grants (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id   uuid          NOT NULL REFERENCES public.pilot_block_time_purchases(id) ON DELETE CASCADE,
  user_id       uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hours         numeric(6,2)  NOT NULL CHECK (hours > 0),
  source        text          NOT NULL CHECK (source IN ('promotion', 'manual')),
  promotion_id  uuid          REFERENCES public.promotions(id),
  reason        text,
  granted_by    uuid          REFERENCES auth.users(id),
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- At most one promotion grant per purchase (idempotency); manual grants unlimited.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bonus_grants_promotion_per_purchase
  ON public.block_time_bonus_grants (purchase_id) WHERE source = 'promotion';
CREATE INDEX IF NOT EXISTS idx_bonus_grants_user ON public.block_time_bonus_grants (user_id);

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.promotions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_package_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_credits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.block_time_bonus_grants ENABLE ROW LEVEL SECURITY;

-- Promotions are public marketing content (banner, sale page).
DROP POLICY IF EXISTS "Anyone can view promotions" ON public.promotions;
CREATE POLICY "Anyone can view promotions" ON public.promotions
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage promotions" ON public.promotions;
CREATE POLICY "Admins manage promotions" ON public.promotions
  FOR ALL TO authenticated
  USING (public.get_own_role() = 'admin') WITH CHECK (public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Anyone can view promotion rules" ON public.promotion_package_rules;
CREATE POLICY "Anyone can view promotion rules" ON public.promotion_package_rules
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage promotion rules" ON public.promotion_package_rules;
CREATE POLICY "Admins manage promotion rules" ON public.promotion_package_rules
  FOR ALL TO authenticated
  USING (public.get_own_role() = 'admin') WITH CHECK (public.get_own_role() = 'admin');

-- Credits and grants: read-only for the owner; writes only via admin or service role.
DROP POLICY IF EXISTS "Users view own checkout credits" ON public.checkout_credits;
CREATE POLICY "Users view own checkout credits" ON public.checkout_credits
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.get_own_role() = 'admin');
DROP POLICY IF EXISTS "Admins manage checkout credits" ON public.checkout_credits;
CREATE POLICY "Admins manage checkout credits" ON public.checkout_credits
  FOR ALL TO authenticated
  USING (public.get_own_role() = 'admin') WITH CHECK (public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Users view own bonus grants" ON public.block_time_bonus_grants;
CREATE POLICY "Users view own bonus grants" ON public.block_time_bonus_grants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.get_own_role() = 'admin');
DROP POLICY IF EXISTS "Admins insert bonus grants" ON public.block_time_bonus_grants;
CREATE POLICY "Admins insert bonus grants" ON public.block_time_bonus_grants
  FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');

-- ── 7. apply_checkout_credit_to_booking ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_checkout_credit_to_booking(p_booking_id uuid)
RETURNS TABLE (
  out_credit_id        uuid,
  out_invoice_id       uuid,
  out_checkout_outcome text,
  out_restored_cents   integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice  record;
  v_credit   record;
  v_restored integer := 0;
BEGIN
  SELECT * INTO v_invoice
  FROM public.checkout_invoices
  WHERE booking_id = p_booking_id AND invoice_type = 'checkout'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Only an unpaid invoice, or one settled purely by account credit, can be
  -- covered. An invoice paid by card / bank / cash is left alone.
  IF NOT (
    v_invoice.status = 'payment_required'
    OR (v_invoice.status = 'paid'
        AND COALESCE(v_invoice.advance_applied_cents, 0) > 0
        AND COALESCE(v_invoice.total_paid_cents, 0) = 0
        AND COALESCE(v_invoice.payment_method, 'account_credit') IN ('account_credit', 'stripe'))
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_credit
  FROM public.checkout_credits
  WHERE user_id = v_invoice.customer_id AND status = 'available'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Give back any account credit the checkout invoice consumed, so the free
  -- checkout never eats the customer's own prepaid balance.
  v_restored := COALESCE(v_invoice.advance_applied_cents, 0);
  IF v_restored > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || v_invoice.customer_id::text));
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, invoice_source_type,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      v_invoice.customer_id, v_invoice.booking_id, v_invoice.id, 'checkout',
      v_restored, 'credit_reversed',
      'Account credit restored: checkout covered by promotion free checkout credit', NULL
    );
  END IF;

  UPDATE public.checkout_invoices
  SET status                  = 'paid',
      paid_at                 = COALESCE(paid_at, now()),
      payment_method          = 'waived',
      waiver_reason           = 'Promotion: free checkout flight included with block time package',
      advance_applied_cents   = 0,
      stripe_amount_due_cents = 0,
      updated_at              = now()
  WHERE id = v_invoice.id;

  UPDATE public.checkout_credits
  SET status             = 'used',
      used_on_booking_id = v_invoice.booking_id,
      used_on_invoice_id = v_invoice.id,
      used_at            = now()
  WHERE id = v_credit.id;

  UPDATE public.bookings
  SET status = 'completed', updated_at = now()
  WHERE id = v_invoice.booking_id AND status <> 'completed';

  IF v_invoice.checkout_outcome IS NOT NULL THEN
    UPDATE public.profiles
    SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
    WHERE id = v_invoice.customer_id
      AND pilot_clearance_status = 'checkout_payment_required';
  END IF;

  RETURN QUERY SELECT v_credit.id, v_invoice.id, v_invoice.checkout_outcome::text, v_restored;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_checkout_credit_to_booking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_checkout_credit_to_booking(uuid) TO service_role;

-- ── 8. record_block_time_promotion ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_block_time_promotion(
  p_purchase_id    uuid,
  p_promotion_id   uuid,
  p_bonus_hours    numeric,
  p_free_checkout  boolean
)
RETURNS TABLE (
  out_credit_id           uuid,
  out_applied_booking_id  uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_purchase     record;
  v_credit_id    uuid;
  v_open_booking uuid;
  v_applied      record;
BEGIN
  SELECT * INTO v_purchase FROM public.pilot_block_time_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time purchase not found: %', p_purchase_id;
  END IF;

  UPDATE public.pilot_block_time_purchases
  SET promotion_id = p_promotion_id,
      bonus_hours  = GREATEST(COALESCE(p_bonus_hours, 0), 0)
  WHERE id = p_purchase_id;

  IF COALESCE(p_bonus_hours, 0) > 0 THEN
    INSERT INTO public.block_time_bonus_grants (purchase_id, user_id, hours, source, promotion_id, reason)
    VALUES (p_purchase_id, v_purchase.user_id, p_bonus_hours, 'promotion', p_promotion_id, 'Promotion bonus hours')
    ON CONFLICT (purchase_id) WHERE source = 'promotion' DO NOTHING;
  END IF;

  IF p_free_checkout THEN
    INSERT INTO public.checkout_credits (user_id, purchase_id, promotion_id)
    VALUES (v_purchase.user_id, p_purchase_id, p_promotion_id)
    ON CONFLICT (purchase_id) WHERE purchase_id IS NOT NULL DO NOTHING;

    SELECT id INTO v_credit_id FROM public.checkout_credits WHERE purchase_id = p_purchase_id;

    -- A checkout already flown and waiting for payment is covered straight away.
    SELECT ci.booking_id INTO v_open_booking
    FROM public.checkout_invoices ci
    WHERE ci.customer_id = v_purchase.user_id
      AND ci.invoice_type = 'checkout'
      AND ci.status = 'payment_required'
    ORDER BY ci.created_at ASC
    LIMIT 1;

    IF v_open_booking IS NOT NULL THEN
      SELECT * INTO v_applied FROM public.apply_checkout_credit_to_booking(v_open_booking);
      IF v_applied.out_credit_id IS NULL THEN
        v_open_booking := NULL;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_credit_id, v_open_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.record_block_time_promotion(uuid, uuid, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_block_time_promotion(uuid, uuid, numeric, boolean) TO service_role;

-- ── 9. Refunds: account for bonus hours + free checkout credits ─────────────
-- Re-defines the migration-108 versions (admin guard kept). An unused package
-- now means hours_remaining = paid hours + bonus hours; without this, every
-- promotion package would be refused as "partially used". Refunding a package
-- cancels its unused free checkout credit; reverting a failed refund restores it.
-- CREATE OR REPLACE keeps the existing grants from migration 109.
CREATE OR REPLACE FUNCTION public.begin_block_time_refund(p_purchase_id uuid)
RETURNS TABLE(
  out_stripe_payment_intent_id text,
  out_refund_amount numeric,
  out_user_id uuid,
  out_hours_purchased numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_purchase    public.pilot_block_time_purchases%ROWTYPE;
  v_usage_count integer;
  v_full_hours  numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_purchase
  FROM public.pilot_block_time_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time purchase % not found', p_purchase_id;
  END IF;

  IF v_purchase.status <> 'active' THEN
    RAISE EXCEPTION 'Only active packages can be refunded (current status: %)', v_purchase.status;
  END IF;

  v_full_hours := v_purchase.hours_purchased + COALESCE(v_purchase.bonus_hours, 0);
  IF v_purchase.hours_remaining <> v_full_hours THEN
    RAISE EXCEPTION 'Package has been partially used (%.2f of %.2f hours remaining) and cannot be refunded',
      v_purchase.hours_remaining, v_full_hours;
  END IF;

  SELECT COUNT(*) INTO v_usage_count
  FROM public.pilot_block_time_usage
  WHERE purchase_id = p_purchase_id;

  IF v_usage_count > 0 THEN
    RAISE EXCEPTION 'Package has % drawdown record(s) and cannot be refunded', v_usage_count;
  END IF;

  IF v_purchase.stripe_payment_intent_id IS NULL THEN
    RAISE EXCEPTION 'Purchase has no Stripe payment intent; refund it manually via the payment provider';
  END IF;

  UPDATE public.pilot_block_time_purchases
  SET status        = 'refunded',
      refund_amount = v_purchase.amount_paid,
      refunded_at   = now(),
      updated_at    = now()
  WHERE id = p_purchase_id;

  UPDATE public.checkout_credits
  SET status = 'cancelled', cancelled_reason = 'Package refunded'
  WHERE purchase_id = p_purchase_id AND status = 'available';

  RETURN QUERY SELECT
    v_purchase.stripe_payment_intent_id,
    v_purchase.amount_paid,
    v_purchase.user_id,
    v_purchase.hours_purchased;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revert_block_time_refund(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_purchase public.pilot_block_time_purchases%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_purchase
  FROM public.pilot_block_time_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time purchase % not found', p_purchase_id;
  END IF;

  IF v_purchase.status <> 'refunded' OR v_purchase.refund_stripe_id IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase % is not in a revertable refund state', p_purchase_id;
  END IF;

  UPDATE public.pilot_block_time_purchases
  SET status        = 'active',
      refund_amount = NULL,
      refunded_at   = NULL,
      updated_at    = now()
  WHERE id = p_purchase_id;

  UPDATE public.checkout_credits
  SET status = 'available', cancelled_reason = NULL
  WHERE purchase_id = p_purchase_id AND status = 'cancelled' AND cancelled_reason = 'Package refunded';
END;
$function$;

-- ── 10. Seed: Black Friday 2026 (disabled until an admin switches it on) ─────
INSERT INTO public.promotions (slug, name, is_enabled, starts_at, ends_at, allow_uncleared_purchase, headline, marquee_text)
VALUES (
  'black-friday-2026',
  'Black Friday 2026',
  false,
  '2026-11-27 00:00:00+11',
  '2026-11-30 23:59:59+11',
  true,
  'Free checkout flight with every flight block',
  'BLACK FRIDAY SALE — Free checkout flight with every block time package · 25 hr +1 bonus hour · 50 hr +3 bonus hours · 100 hr +5 bonus hours'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.promotion_package_rules (promotion_id, package_id, bonus_hours, includes_free_checkout)
SELECT p.id, pkg.id,
       CASE pkg.hours WHEN 25 THEN 1 WHEN 50 THEN 3 WHEN 100 THEN 5 ELSE 0 END,
       true
FROM public.promotions p
JOIN public.block_time_packages pkg ON pkg.hours IN (10, 25, 50, 100)
WHERE p.slug = 'black-friday-2026'
ON CONFLICT (promotion_id, package_id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
