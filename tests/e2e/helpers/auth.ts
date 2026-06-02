import { expect, type Page } from '@playwright/test'
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  TEST_CUSTOMER_EMAIL,
  TEST_CUSTOMER_PASSWORD,
} from '../fixtures/test-users'

type TestUserRole = 'admin' | 'customer'

export async function login(page: Page, role: TestUserRole) {
  const email = role === 'admin' ? TEST_ADMIN_EMAIL : TEST_CUSTOMER_EMAIL
  const password = role === 'admin' ? TEST_ADMIN_PASSWORD : TEST_CUSTOMER_PASSWORD

  if (!email || !password) {
    throw new Error(`Missing ${role} test credentials. Set the TEST_${role.toUpperCase()}_* environment variables.`)
  }

  await page.goto('/login')
  await page.getByLabel('Email Address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/dashboard(\/.*)?$/)
}
