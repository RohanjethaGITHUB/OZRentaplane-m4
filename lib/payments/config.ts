export const PAYMENT_CONFIG = {
  // Stripe Domestic Card Fee (Australia)
  STRIPE_DOMESTIC_FEE_BPS: 170, // 1.7%
  STRIPE_FIXED_FEE_CENTS: 30,   // $0.30 AUD
  ENABLE_SURCHARGE: process.env.ENABLE_STRIPE_SURCHARGE !== 'false',

  // Bank Transfer Details
  BANK_NAME:           process.env.BANK_NAME?.trim()           || 'National Australia Bank (NAB)',
  BANK_ACCOUNT_NAME:   process.env.BANK_ACCOUNT_NAME?.trim()   || 'JAM Aviation PTY LTD',
  BANK_BSB:            process.env.BANK_BSB?.trim()            || '085-005',
  BANK_ACCOUNT_NUMBER: process.env.BANK_ACCOUNT_NUMBER?.trim() || '388004197',
};

