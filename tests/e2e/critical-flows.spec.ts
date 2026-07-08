import { expect, test, type Page } from '@playwright/test'
import { HAS_TEST_USERS, TEST_CUSTOMER_EMAIL } from './fixtures/test-users'
import { login } from './helpers/auth'

test.skip(
  !HAS_TEST_USERS,
  'Set TEST_CUSTOMER_EMAIL, TEST_CUSTOMER_PASSWORD, TEST_ADMIN_EMAIL, and TEST_ADMIN_PASSWORD to run these E2E tests.',
)

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function pickCalendarDate(page: Page, targetIsoDate: string) {
  const [year, month, day] = targetIsoDate.split('-').map(Number)
  if (!year || !month || !day) throw new Error(`Invalid date: ${targetIsoDate}`)

  const dateButton = page.getByRole('button', { name: /DD\/MM\/YYYY|calendar_month/i }).first()
  await dateButton.click()

  const selects = page.locator('select')
  await expect(selects).toHaveCount(2)
  await selects.nth(0).selectOption(String(month - 1))
  await selects.nth(1).selectOption(String(year))
  await page.getByRole('button', { name: new RegExp(`^${day}$`) }).click()
}

async function setCheckoutTime(page: Page, label: string) {
  await page.getByRole('button', { name: /Select departure time/i }).click()
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await page.getByRole('button', { name: new RegExp(`^${escaped}$`) }).click()
}

test('Admin can create a new customer account', async ({ page }) => {
  await login(page, 'admin')

  const unique = Date.now()
  const fullName = `E2E Customer ${unique}`
  const email = `e2e-customer-${unique}@example.com`
  const phone = '0412345678'

  await page.goto('/admin/customers/new')
  await page.getByLabel('Full name').fill(fullName)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Phone number').fill(phone)
  await page.getByRole('button', { name: 'Create customer account' }).click()

  await expect(page).toHaveURL(/\/admin\/users\/[A-Za-z0-9-]+$/)

  await page.goto('/admin/customers')
  await expect(page.getByText(fullName).first()).toBeVisible()
  await expect(page.getByText(email).first()).toBeVisible()
})

test('Document gate blocks checkout when docs not approved', async ({ page }) => {
  await login(page, 'customer')

  await page.goto('/dashboard/checkout')

  const targetDate = toIsoDate(addDays(new Date(), 14))
  await pickCalendarDate(page, targetDate)
  await page.getByRole('button', { name: 'Yes' }).first().click()
  await setCheckoutTime(page, '9:00 AM')

  await expect(page.getByText('Checking availability…')).toBeVisible()
  await expect(page.getByTestId('checkout-step1-continue')).toBeEnabled({ timeout: 30_000 })
  await page.getByTestId('checkout-step1-continue').click()

  await expect(page.getByText('Documents required')).toBeVisible()
  await expect(page.getByText('You need approved documents and accepted terms before you can continue.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to Review' })).toHaveCount(0)
})

test('Customer documents page loads and shows correct state', async ({ page }) => {
  await login(page, 'customer')

  await page.goto('/dashboard/documents')

  await expect(page.getByRole('heading', { name: 'My Documents' })).toBeVisible()
  await expect(page.getByText('Terms & Conditions')).toBeVisible()
  await expect(page.getByText('Pilot Licence')).toBeVisible()
  await expect(page.getByText('Medical Certificate')).toBeVisible()
  await expect(page.getByText('Photo ID')).toBeVisible()
})

test('Admin document approval UI is visible', async ({ page }) => {
  await login(page, 'admin')

  await page.goto('/admin/customers')
  const customerRow = page.locator('tr').filter({ hasText: TEST_CUSTOMER_EMAIL }).first()
  if ((await customerRow.count()) === 0) {
    test.skip(true, `No customer row found for ${TEST_CUSTOMER_EMAIL}.`)
  }

  await customerRow.getByRole('link').first().click()
  await expect(page).toHaveURL(/\/admin\/users\/[A-Za-z0-9-]+$/)

  await page.getByRole('button', { name: 'Documents' }).click()
  await expect(page.getByText('Document Review')).toBeVisible()

  const approveButton = page.getByRole('button', { name: 'Approve' }).first()
  if (!(await approveButton.isVisible())) {
    test.skip(true, 'Selected customer does not currently have uploaded documents.')
  }

  await expect(approveButton).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reject' }).first()).toBeVisible()
})

test('Admin can mark a manual payment', async ({ page }) => {
  await login(page, 'admin')

  await page.goto('/admin/bookings/payments?tab=payment_required')
  const paymentRow = page.locator('tbody tr').filter({ hasText: 'payment required' }).first()
  if ((await paymentRow.count()) === 0) {
    test.skip(true, 'No payment_required booking row is available in the current test data.')
  }

  await paymentRow.getByRole('link', { name: 'View' }).click()
  await expect(page).toHaveURL(/\/admin\/bookings\/requests\/[A-Za-z0-9-]+$/)

  await expect(page.getByText('Manual Payment')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cash' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Card (in person)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bank transfer' })).toBeVisible()
})

test('Standard booking detail no longer shows the ready-for-dispatch action', async ({ page }) => {
  await login(page, 'admin')

  await page.goto('/admin/bookings')
  const firstViewLink = page.getByRole('link', { name: 'View' }).first()
  if ((await firstViewLink.count()) === 0) {
    test.skip(true, 'No booking rows are available in the current test data.')
  }

  await firstViewLink.click()
  await expect(page).toHaveURL(/\/admin\/bookings\/requests\/[A-Za-z0-9-]+$/)
  await expect(page.getByRole('button', { name: 'Mark Ready for Dispatch' })).toHaveCount(0)
})

test('Standard booking billing panel exposes total-only readings and payment options', async ({ page }) => {
  await login(page, 'admin')

  await page.goto('/admin/bookings')
  const firstViewLink = page.getByRole('link', { name: 'View' }).first()
  if ((await firstViewLink.count()) === 0) {
    test.skip(true, 'No booking rows are available in the current test data.')
  }

  await firstViewLink.click()
  await expect(page).toHaveURL(/\/admin\/bookings\/requests\/[A-Za-z0-9-]+$/)

  const billingHeading = page.getByText('Flight Billing').first()
  if ((await billingHeading.count()) === 0) {
    test.skip(true, 'Selected booking is not in pending_post_flight_review.')
  }

  await expect(page.getByText('VDO total')).toBeVisible()
  await expect(page.getByText('Tacho total')).toBeVisible()
  await expect(page.getByText('Airswitch total')).toBeVisible()
  await expect(page.getByText('MR total')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stripe' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bank transfer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invoice' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark paid' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Waived' })).toBeVisible()
})
