BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS default_payment_method_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS
  'Stripe Customer ID for the pilot (used for checkout and block time purchases).';

COMMENT ON COLUMN public.profiles.default_payment_method_id IS
  'Stripe PaymentMethod ID to reuse for off-session charges when available.';

COMMIT;
