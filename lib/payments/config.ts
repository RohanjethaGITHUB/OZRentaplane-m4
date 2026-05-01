export const PAYMENT_CONFIG = {
  // Stripe Domestic Card Fee (Australia)
  STRIPE_DOMESTIC_FEE_BPS: 170, // 1.7%
  STRIPE_FIXED_FEE_CENTS: 30,   // $0.30 AUD
  ENABLE_SURCHARGE: process.env.ENABLE_STRIPE_SURCHARGE !== 'false',

  // Bank Transfer Details — must be set via env vars in production.
  // Empty string means "not configured"; page.tsx hides the bank transfer
  // option when any of these is missing.
  BANK_ACCOUNT_NAME:   process.env.BANK_ACCOUNT_NAME   ?? '',
  BANK_BSB:            process.env.BANK_BSB            ?? '',
  BANK_ACCOUNT_NUMBER: process.env.BANK_ACCOUNT_NUMBER ?? '',
};
