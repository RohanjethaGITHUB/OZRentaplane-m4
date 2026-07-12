-- 111_credit_balance_allowlist.sql
--
-- Systemic fix for the recurring "phantom credit" bug class (three occurrences
-- found on 2026-07-10: checkout mark-paid, standard mark-paid, block-time
-- manual settle). Each happened because a settlement path wrote a positive
-- ledger row with an entry_type that customer_credit_balances counts toward
-- the spendable balance.
--
-- The view previously included 'manual_adjustment' as credit-bearing. Nothing
-- legitimate writes that entry_type (verified 2026-07-11: the only code writer
-- was the block-time settle bug, and the live table contains zero
-- manual_adjustment rows), so it is removed. The view now counts ONLY the
-- explicit customer-credit lifecycle:
--
--   advance_credit   (+) admin records an advance payment as spendable credit
--   advance_applied  (−) credit consumed against an invoice
--   credit_reversed  (−) admin reverses an advance_credit entry
--   credit_refunded  (−) credit refunded to the customer
--
-- Every settlement-shaped entry_type (bank_transfer, stripe_payment, refund,
-- manual_adjustment) is excluded, so a future settlement call site cannot mint
-- spendable credit no matter which entry_type it picks. All credit-consuming
-- RPCs (apply_credit_* etc.) read this view, so they inherit the fix.
--
-- security_invoker is preserved from migration 030/031.

BEGIN;

CREATE OR REPLACE VIEW public.customer_credit_balances WITH (security_invoker = true) AS
SELECT
  customer_id,
  SUM(amount_cents) AS balance_cents
FROM public.customer_payment_ledger
WHERE entry_type IN ('advance_credit', 'advance_applied', 'credit_reversed', 'credit_refunded')
GROUP BY customer_id;

COMMIT;
