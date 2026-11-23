-- ============================================================
-- 123_block_time_bank_transfer.sql
--
-- Bank-transfer payment for Block Time package purchases.
--
-- The customer reserves a package (pilot_block_time_purchases, status
-- 'pending'), transfers the money, then uploads a receipt. An admin reviews
-- the receipt and either approves (package activates), asks for a clearer
-- receipt, or rejects. The purchase stays 'pending' until approval.
-- ============================================================

BEGIN;

-- How the purchase is being paid for.
ALTER TABLE public.pilot_block_time_purchases
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE public.pilot_block_time_purchases
  DROP CONSTRAINT IF EXISTS pilot_block_time_purchases_payment_method_check;

ALTER TABLE public.pilot_block_time_purchases
  ADD CONSTRAINT pilot_block_time_purchases_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('stripe', 'bank_transfer'));

-- ── Submissions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.block_time_bank_transfer_submissions (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id           uuid         NOT NULL REFERENCES public.pilot_block_time_purchases (id) ON DELETE CASCADE,
  customer_id           uuid         NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reference             text,
  receipt_storage_path  text         NOT NULL,
  status                text         NOT NULL DEFAULT 'pending_review'
                                     CHECK (status IN ('pending_review', 'approved', 'resubmission_requested', 'rejected')),
  admin_note            text,
  reviewed_by           uuid         REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  -- Promotion terms are locked in when the receipt is submitted (same rule as
  -- Stripe metadata): a sale ending while the admin reviews still applies.
  promotion_id          uuid         REFERENCES public.promotions (id) ON DELETE SET NULL,
  promo_bonus_hours     numeric(6,2) NOT NULL DEFAULT 0 CHECK (promo_bonus_hours >= 0 AND promo_bonus_hours <= 50),
  promo_free_checkout   boolean      NOT NULL DEFAULT false,
  submitted_at          timestamptz  NOT NULL DEFAULT now(),
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bt_bank_submissions_purchase
  ON public.block_time_bank_transfer_submissions (purchase_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_bt_bank_submissions_status
  ON public.block_time_bank_transfer_submissions (status, submitted_at DESC);

-- Only one receipt can be awaiting review for a purchase at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bt_bank_submissions_one_pending
  ON public.block_time_bank_transfer_submissions (purchase_id)
  WHERE status = 'pending_review';

DROP TRIGGER IF EXISTS trigger_bt_bank_submissions_updated_at ON public.block_time_bank_transfer_submissions;
CREATE TRIGGER trigger_bt_bank_submissions_updated_at
  BEFORE UPDATE ON public.block_time_bank_transfer_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.block_time_bank_transfer_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers view own block time bank transfers" ON public.block_time_bank_transfer_submissions;
CREATE POLICY "Customers view own block time bank transfers"
  ON public.block_time_bank_transfer_submissions
  FOR SELECT
  USING (auth.uid() = customer_id OR public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Customers insert own block time bank transfers" ON public.block_time_bank_transfer_submissions;
CREATE POLICY "Customers insert own block time bank transfers"
  ON public.block_time_bank_transfer_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id AND status = 'pending_review');

DROP POLICY IF EXISTS "Admins manage block time bank transfers" ON public.block_time_bank_transfer_submissions;
CREATE POLICY "Admins manage block time bank transfers"
  ON public.block_time_bank_transfer_submissions
  FOR ALL
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');

COMMIT;
