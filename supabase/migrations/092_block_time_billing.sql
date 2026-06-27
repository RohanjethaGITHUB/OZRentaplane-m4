BEGIN;

-- ============================================================
-- 092_block_time_billing.sql
-- Block Time package catalogue, purchases, invoices, and usage
-- ============================================================

-- ------------------------------------------------------------
-- TABLE 1: block_time_packages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.block_time_packages (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text           NOT NULL,
  hours          integer        NOT NULL CHECK (hours > 0),
  rate_per_hour  numeric(10,2)  NOT NULL CHECK (rate_per_hour > 0),
  total_price    numeric(10,2)  GENERATED ALWAYS AS (hours * rate_per_hour) STORED,
  validity_days  integer        NOT NULL CHECK (validity_days > 0),
  is_active      boolean        NOT NULL DEFAULT true,
  display_order  integer        NOT NULL DEFAULT 0,
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_block_time_packages_name
  ON public.block_time_packages (name);

CREATE INDEX IF NOT EXISTS idx_block_time_packages_display_order
  ON public.block_time_packages (display_order)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trigger_block_time_packages_updated_at ON public.block_time_packages;
CREATE TRIGGER trigger_block_time_packages_updated_at
  BEFORE UPDATE ON public.block_time_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.block_time_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active block time packages" ON public.block_time_packages;
CREATE POLICY "Anyone can view active block time packages"
  ON public.block_time_packages
  FOR SELECT
  USING (is_active = true OR public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Admins can manage block time packages" ON public.block_time_packages;
CREATE POLICY "Admins can manage block time packages"
  ON public.block_time_packages
  FOR ALL
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');

INSERT INTO public.block_time_packages (name, hours, rate_per_hour, validity_days, display_order)
SELECT 'Starter Block', 10, 320.00, 30, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.block_time_packages WHERE name = 'Starter Block'
);

INSERT INTO public.block_time_packages (name, hours, rate_per_hour, validity_days, display_order)
SELECT 'Regular Block', 25, 310.00, 90, 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.block_time_packages WHERE name = 'Regular Block'
);

INSERT INTO public.block_time_packages (name, hours, rate_per_hour, validity_days, display_order)
SELECT 'Committed Block', 50, 300.00, 180, 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.block_time_packages WHERE name = 'Committed Block'
);

INSERT INTO public.block_time_packages (name, hours, rate_per_hour, validity_days, display_order)
SELECT 'Pro Block', 100, 290.00, 270, 4
WHERE NOT EXISTS (
  SELECT 1 FROM public.block_time_packages WHERE name = 'Pro Block'
);


-- ------------------------------------------------------------
-- TABLE 2: pilot_block_time_purchases
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pilot_block_time_purchases (
  id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid           NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  package_id               uuid           NOT NULL REFERENCES public.block_time_packages (id) ON DELETE RESTRICT,
  hours_purchased          numeric(8,2)   NOT NULL CHECK (hours_purchased > 0),
  hours_remaining          numeric(8,2)   NOT NULL CHECK (hours_remaining >= 0),
  rate_per_hour            numeric(10,2)  NOT NULL CHECK (rate_per_hour > 0),
  amount_paid              numeric(10,2)  NOT NULL CHECK (amount_paid > 0),
  status                   text           NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'active', 'exhausted', 'expired', 'refunded')),
  purchased_at             timestamptz    NOT NULL DEFAULT now(),
  activated_at             timestamptz,
  expires_at               timestamptz    NOT NULL,
  stripe_payment_intent_id text           UNIQUE,
  queue_position           integer,
  refund_amount            numeric(10,2),
  refunded_at              timestamptz,
  refund_stripe_id         text,
  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT bt_pilot_block_time_purchases_amount_check
    CHECK (amount_paid = ROUND(hours_purchased * rate_per_hour, 2)),
  CONSTRAINT bt_pilot_block_time_purchases_remaining_check
    CHECK (hours_remaining <= hours_purchased)
);

CREATE INDEX IF NOT EXISTS idx_bt_purchases_user_id
  ON public.pilot_block_time_purchases (user_id);

CREATE INDEX IF NOT EXISTS idx_bt_purchases_user_active
  ON public.pilot_block_time_purchases (user_id, status, expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_bt_purchases_expiry
  ON public.pilot_block_time_purchases (expires_at, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_bt_purchases_stripe
  ON public.pilot_block_time_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_bt_purchases_updated_at ON public.pilot_block_time_purchases;
CREATE TRIGGER trigger_bt_purchases_updated_at
  BEFORE UPDATE ON public.pilot_block_time_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pilot_block_time_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pilots can view own block time purchases" ON public.pilot_block_time_purchases;
CREATE POLICY "Pilots can view own block time purchases"
  ON public.pilot_block_time_purchases
  FOR SELECT
  USING (auth.uid() = user_id OR public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Pilots can create own block time purchases" ON public.pilot_block_time_purchases;
CREATE POLICY "Pilots can create own block time purchases"
  ON public.pilot_block_time_purchases
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Pilots can update own block time purchases" ON public.pilot_block_time_purchases;
CREATE POLICY "Pilots can update own block time purchases"
  ON public.pilot_block_time_purchases
  FOR UPDATE
  USING (auth.uid() = user_id OR public.get_own_role() = 'admin')
  WITH CHECK (auth.uid() = user_id OR public.get_own_role() = 'admin');


-- ------------------------------------------------------------
-- TABLE 3: invoices
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS public.invoices (
  id                     uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number         text           NOT NULL UNIQUE,
  type                   text           NOT NULL CHECK (type IN ('block_time_purchase', 'flight', 'credit_note')),
  user_id                uuid           NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  booking_id             uuid           REFERENCES public.bookings (id) ON DELETE RESTRICT,
  block_time_purchase_id uuid           REFERENCES public.pilot_block_time_purchases (id) ON DELETE RESTRICT,
  related_invoice_id     uuid           REFERENCES public.invoices (id) ON DELETE RESTRICT,
  billing_mode           text           CHECK (billing_mode IN ('pay_as_you_fly', 'block_time')),
  subtotal               numeric(10,2)  NOT NULL CHECK (subtotal >= 0),
  gst_amount             numeric(10,2)  NOT NULL CHECK (gst_amount >= 0),
  total                  numeric(10,2)  NOT NULL CHECK (total >= 0),
  status                 text           NOT NULL DEFAULT 'draft'
                                      CHECK (status IN ('draft', 'paid', 'awaiting', 'void', 'refunded')),
  payment_method         text           CHECK (payment_method IN ('stripe', 'bank_transfer')),
  stripe_payment_intent_id text,
  bank_transfer_reference text,
  bank_transfer_confirmed_at timestamptz,
  bank_transfer_confirmed_by uuid,
  pdf_url                text,
  paid_at                timestamptz,
  created_at             timestamptz    NOT NULL DEFAULT now(),
  updated_at             timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT bt_invoices_gst_check
    CHECK (gst_amount = ROUND(subtotal / 10, 2)),
  CONSTRAINT bt_invoices_total_check
    CHECK (total = subtotal + gst_amount)
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id
  ON public.invoices (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_booking_id
  ON public.invoices (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_purchase_id
  ON public.invoices (block_time_purchase_id)
  WHERE block_time_purchase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON public.invoices (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_stripe
  ON public.invoices (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_invoices_updated_at ON public.invoices;
CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_generate_invoice_number ON public.invoices;
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.invoice_number := 'OZ-' ||
    TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD(NEXTVAL('public.invoice_number_seq'::regclass)::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_generate_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION public.generate_invoice_number();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
CREATE POLICY "Users can view own invoices"
  ON public.invoices
  FOR SELECT
  USING (auth.uid() = user_id OR public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices;
CREATE POLICY "Admins can manage invoices"
  ON public.invoices
  FOR UPDATE
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');


-- ------------------------------------------------------------
-- TABLE 4: invoice_line_items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid           NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  type           text           NOT NULL CHECK (
    type IN (
      'flight_hours',
      'block_time_hours',
      'overflow_hours',
      'landing_fee',
      'overnight_parking'
    )
  ),
  description    text           NOT NULL,
  quantity       numeric(8,2)   NOT NULL CHECK (quantity > 0),
  unit_price     numeric(10,2)  NOT NULL CHECK (unit_price >= 0),
  amount         numeric(10,2)  NOT NULL CHECK (amount >= 0),
  display_order  integer        NOT NULL DEFAULT 0,
  created_at     timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT bt_invoice_line_items_amount_check
    CHECK (amount = ROUND(quantity * unit_price, 2))
);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice_id
  ON public.invoice_line_items (invoice_id, display_order);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invoice line items" ON public.invoice_line_items;
CREATE POLICY "Users can view own invoice line items"
  ON public.invoice_line_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_id
        AND (i.user_id = auth.uid() OR public.get_own_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can manage invoice line items" ON public.invoice_line_items;
CREATE POLICY "Admins can manage invoice line items"
  ON public.invoice_line_items
  FOR ALL
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');


-- ------------------------------------------------------------
-- TABLE 5: pilot_block_time_usage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pilot_block_time_usage (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     uuid           NOT NULL REFERENCES public.pilot_block_time_purchases (id) ON DELETE RESTRICT,
  user_id         uuid           NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  booking_id      uuid           NOT NULL REFERENCES public.bookings (id) ON DELETE RESTRICT,
  invoice_id      uuid           REFERENCES public.invoices (id) ON DELETE RESTRICT,
  hours_deducted  numeric(8,2)   NOT NULL CHECK (hours_deducted > 0),
  overflow_hours  numeric(8,2)   NOT NULL DEFAULT 0 CHECK (overflow_hours >= 0),
  overflow_amount numeric(10,2)  NOT NULL DEFAULT 0 CHECK (overflow_amount >= 0),
  hours_before    numeric(8,2)   NOT NULL CHECK (hours_before >= 0),
  hours_after     numeric(8,2)   NOT NULL CHECK (hours_after >= 0),
  deducted_at     timestamptz    NOT NULL DEFAULT now(),
  created_at      timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bt_usage_purchase_id
  ON public.pilot_block_time_usage (purchase_id, deducted_at DESC);

CREATE INDEX IF NOT EXISTS idx_bt_usage_user_id
  ON public.pilot_block_time_usage (user_id, deducted_at DESC);

CREATE INDEX IF NOT EXISTS idx_bt_usage_booking_id
  ON public.pilot_block_time_usage (booking_id);

ALTER TABLE public.pilot_block_time_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own block time usage" ON public.pilot_block_time_usage;
CREATE POLICY "Users can view own block time usage"
  ON public.pilot_block_time_usage
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.get_own_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.pilot_block_time_purchases p
      WHERE p.id = purchase_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage block time usage" ON public.pilot_block_time_usage;
CREATE POLICY "Admins can manage block time usage"
  ON public.pilot_block_time_usage
  FOR ALL
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');

COMMIT;
