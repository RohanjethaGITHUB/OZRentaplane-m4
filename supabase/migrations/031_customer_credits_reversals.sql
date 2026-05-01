-- ============================================================
-- 031_customer_credits_reversals.sql
--
-- 1. Add reversed_entry_id to customer_payment_ledger
-- 2. Update valid_entry_type constraint
-- 3. Update customer_credit_balances view
-- 4. Create atomic RPCs for reversals and refunds
-- ============================================================

-- ── 1. Update Schema ─────────────────────────────────────────────────────────

ALTER TABLE public.customer_payment_ledger
  ADD COLUMN IF NOT EXISTS reversed_entry_id uuid REFERENCES public.customer_payment_ledger(id) ON DELETE SET NULL;

-- Prevent duplicate reversals of the same original entry
CREATE UNIQUE INDEX IF NOT EXISTS prevent_duplicate_reversals 
  ON public.customer_payment_ledger (reversed_entry_id) 
  WHERE reversed_entry_id IS NOT NULL AND entry_type = 'credit_reversed';

-- Update the constraint
ALTER TABLE public.customer_payment_ledger
  DROP CONSTRAINT IF EXISTS valid_entry_type;

ALTER TABLE public.customer_payment_ledger
  ADD CONSTRAINT valid_entry_type
  CHECK (entry_type IN (
    'advance_credit', 
    'advance_applied', 
    'stripe_payment', 
    'refund', 
    'manual_adjustment',
    'credit_reversed',
    'credit_refunded'
  ));

-- ── 2. Update View ───────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.customer_credit_balances WITH (security_invoker = true) AS
SELECT
  customer_id,
  SUM(amount_cents) AS balance_cents
FROM public.customer_payment_ledger
WHERE entry_type IN ('advance_credit', 'advance_applied', 'manual_adjustment', 'credit_refunded', 'credit_reversed')
GROUP BY customer_id;

-- ── 3. RPC: Reverse Customer Credit ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_customer_credit_atomic(
  p_ledger_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_customer_id uuid;
  v_original_amount_cents integer;
  v_original_entry_type text;
  v_balance_cents integer := 0;
  v_new_ledger_id uuid;
BEGIN
  -- Validate caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Load and lock the original ledger row
  SELECT customer_id, amount_cents, entry_type
  INTO v_original_customer_id, v_original_amount_cents, v_original_entry_type
  FROM public.customer_payment_ledger
  WHERE id = p_ledger_id
  FOR UPDATE;

  IF v_original_customer_id IS NULL THEN
    RAISE EXCEPTION 'Ledger entry not found';
  END IF;

  IF v_original_entry_type != 'advance_credit' THEN
    RAISE EXCEPTION 'Only advance_credit entries can be reversed';
  END IF;

  IF v_original_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid original amount';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reversal reason is required';
  END IF;

  -- Check if already reversed
  IF EXISTS (SELECT 1 FROM public.customer_payment_ledger WHERE reversed_entry_id = p_ledger_id AND entry_type = 'credit_reversed') THEN
    RAISE EXCEPTION 'This entry has already been reversed';
  END IF;

  -- Acquire transaction-level lock for this customer
  PERFORM pg_advisory_xact_lock(hashtext(v_original_customer_id::text));

  -- Check current balance
  SELECT COALESCE(balance_cents, 0)
  INTO v_balance_cents
  FROM public.customer_credit_balances
  WHERE customer_id = v_original_customer_id;

  IF v_balance_cents < v_original_amount_cents THEN
    RAISE EXCEPTION 'Insufficient available credit to reverse this entry. The credit may have already been applied.';
  END IF;

  -- Insert reversal row
  INSERT INTO public.customer_payment_ledger (
    customer_id,
    amount_cents,
    entry_type,
    note,
    reversed_entry_id,
    created_by
  ) VALUES (
    v_original_customer_id,
    -v_original_amount_cents,
    'credit_reversed',
    p_reason,
    p_ledger_id,
    auth.uid()
  ) RETURNING id INTO v_new_ledger_id;

  RETURN v_new_ledger_id;
END;
$$;

-- ── 4. RPC: Record Customer Refund ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_customer_refund_atomic(
  p_customer_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_reference text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_cents integer := 0;
  v_new_ledger_id uuid;
BEGIN
  -- Validate caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than 0';
  END IF;

  IF (p_note IS NULL OR btrim(p_note) = '') AND (p_reference IS NULL OR btrim(p_reference) = '') THEN
    RAISE EXCEPTION 'Refund note or reference is required';
  END IF;

  -- Acquire transaction-level lock for this customer
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  -- Check current balance
  SELECT COALESCE(balance_cents, 0)
  INTO v_balance_cents
  FROM public.customer_credit_balances
  WHERE customer_id = p_customer_id;

  IF v_balance_cents < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient available credit to record this refund. Maximum available is % cents.', v_balance_cents;
  END IF;

  -- Insert refund row
  INSERT INTO public.customer_payment_ledger (
    customer_id,
    amount_cents,
    entry_type,
    payment_method,
    note,
    created_by
  ) VALUES (
    p_customer_id,
    -p_amount_cents,
    'credit_refunded',
    p_payment_method,
    COALESCE(p_note, '') || CASE WHEN p_reference IS NOT NULL AND p_reference != '' THEN ' (Ref: ' || p_reference || ')' ELSE '' END,
    auth.uid()
  ) RETURNING id INTO v_new_ledger_id;

  RETURN v_new_ledger_id;
END;
$$;
