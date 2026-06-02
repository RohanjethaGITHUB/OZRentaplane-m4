export const TEST_CUSTOMER_EMAIL = process.env.TEST_CUSTOMER_EMAIL ?? ''
export const TEST_CUSTOMER_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD ?? ''
export const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? ''
export const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? ''

export const HAS_TEST_USERS =
  Boolean(TEST_CUSTOMER_EMAIL) &&
  Boolean(TEST_CUSTOMER_PASSWORD) &&
  Boolean(TEST_ADMIN_EMAIL) &&
  Boolean(TEST_ADMIN_PASSWORD)
