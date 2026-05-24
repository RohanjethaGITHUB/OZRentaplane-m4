/**
 * verify_terms_acceptance_flow.mjs
 *
 * Focused Playwright test for the inline booking readiness terms acceptance flow.
 * Uses a pre-seeded historical/cleared user with no docs and no terms.
 *
 * Steps tested:
 *  A. Login as historical cleared_to_fly user with no docs/terms
 *  B. /dashboard/bookings/new → readiness gate appears
 *  C. Terms section shows "Current version not accepted"
 *  D. Open Terms modal
 *  E. Accept button is disabled before scrolling
 *  F. Scroll to bottom → checkbox and accept button unlock
 *  G. Check checkbox, click Accept
 *  H. No runtime error, no 404
 *  I. Modal closes or page refreshes
 *  J. Terms section shows "Accepted current version"
 *  K. DB record has acceptance_context = 'booking_readiness'
 *
 * Usage:
 *   node scripts/verify_terms_acceptance_flow.mjs [testEmail]
 *
 * If testEmail is not provided, a fresh user is created and cleaned up at end (dry-run only).
 */

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

// Load .env.local
const envRaw = fs.readFileSync('.env.local', 'utf8')
for (const line of envRaw.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const idx = trimmed.indexOf('=')
  if (idx <= 0) continue
  const k = trimmed.slice(0, idx)
  const v = trimmed.slice(idx + 1)
  if (!(k in process.env)) process.env[k] = v
}

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase env vars')

const admin = createClient(url, key)
const pw = 'TestPass!23456'
const ts = Date.now()

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }
function pass(msg) { console.log(`  ✓ PASS: ${msg}`) }
function fail(msg) { console.error(`  ✗ FAIL: ${msg}`) }
function info(msg) { console.log(`  ℹ ${msg}`) }

async function main() {
  // ── Create test user (historical, cleared_to_fly, no docs, no terms) ─────
  const email = process.argv[2] || `terms-acceptance-e2e-${ts}@example.com`
  const isProvidedUser = !!process.argv[2]

  let userId

  if (!isProvidedUser) {
    log(`Creating test user: ${email}`)
    const { data: { user }, error: createErr } = await admin.auth.admin.createUser({
      email, password: pw, email_confirm: true, user_metadata: { full_name: 'Terms Flow E2E' },
    })
    if (createErr) throw createErr
    userId = user.id
    log(`Created auth user: ${userId}`)

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId, email, role: 'customer', full_name: 'Terms Flow E2E',
      pilot_clearance_status: 'cleared_to_fly', account_status: 'active',
      pilot_arn: '9876543', has_night_vfr_rating: false, last_flight_date: '2026-04-15',
    })
    if (profileErr) throw profileErr

    // Insert historical clearance record
    const { data: adminUser } = await admin.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
    const { error: histErr } = await admin.from('historical_checkout_completions').insert({
      customer_id: userId,
      checkout_date: '2026-05-15',
      checkout_outcome: 'cleared_to_fly',
      admin_notes: 'Terms flow e2e test',
      recorded_by_admin_id: adminUser?.id ?? userId,
      source: 'historical_admin',
      is_active: true,
      created_flight_log: false,
    })
    if (histErr) throw histErr
    log('Historical clearance seeded.')
  } else {
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
    if (!profile) throw new Error(`User ${email} not found in profiles`)
    userId = profile.id
    log(`Using provided user: ${email} (${userId})`)
  }

  // ── Playwright test ────────────────────────────────────────────────────────
  log('Launching Playwright (headless)…')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const results = {
    A_loginSuccess: false,
    B_readinessGate: false,
    C_termsNotAccepted: false,
    D_termsModalOpened: false,
    E_acceptButtonDisabledBeforeScroll: false,
    F_scrollUnlocks: false,
    G_acceptedWithoutError: false,
    H_no404: false,
    I_modalClosed: false,
    J_termsAcceptedInUI: false,
    K_dbRecordCorrect: false,
    errors: [],
  }

  try {
    // A. Login
    log('Step A: Login…')
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
    await page.locator('input[type="email"]').first().fill(email)
    await page.locator('input[type="password"]').first().fill(pw)
    await page.getByRole('button', { name: /Sign In/i }).click()
    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    results.A_loginSuccess = currentUrl.includes('/dashboard') || !currentUrl.includes('/login')
    if (results.A_loginSuccess) pass('Login succeeded')
    else fail(`Login failed — stayed on: ${currentUrl}`)

    // B. Readiness gate
    log('Step B: Navigate to /dashboard/bookings/new…')
    await page.goto(`${BASE_URL}/dashboard/bookings/new`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: '/tmp/terms_flow_B_gate.png', fullPage: true })
    results.B_readinessGate = (await page.locator('[data-testid="booking-readiness-gate"]').count()) > 0
    if (results.B_readinessGate) pass('Readiness gate visible')
    else fail('Readiness gate not found')

    // C. Terms section shows "not accepted"
    const bodyText = await page.locator('body').innerText()
    results.C_termsNotAccepted = bodyText.includes('Current version not accepted') || bodyText.includes('not accepted')
    if (results.C_termsNotAccepted) pass('Terms section shows "Current version not accepted"')
    else fail('Terms section did not show not-accepted state')

    // D. Open terms modal
    log('Step D: Open Terms modal…')
    const openTermsBtn = page.getByRole('button', { name: /Open terms/i })
    if ((await openTermsBtn.count()) === 0) {
      fail('Open terms button not found')
      results.errors.push('Open terms button not found')
    } else {
      await openTermsBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: '/tmp/terms_flow_D_modal.png', fullPage: true })
      const modalVisible = await page.locator('text=Booking Terms and Conditions').count() > 0
        || await page.locator('text=Scroll to the end').count() > 0
      results.D_termsModalOpened = modalVisible
      if (modalVisible) pass('Terms modal opened')
      else fail('Terms modal did not open')
    }

    // E. Accept button disabled before scroll
    log('Step E: Check accept button disabled before scroll…')
    const acceptBtn = page.getByRole('button', { name: /Accept terms/i })
    if ((await acceptBtn.count()) > 0) {
      const isDisabled = await acceptBtn.isDisabled()
      results.E_acceptButtonDisabledBeforeScroll = isDisabled
      if (isDisabled) pass('Accept button is disabled before scrolling')
      else fail('Accept button is NOT disabled before scrolling (expected disabled)')
    } else {
      fail('Accept terms button not found in modal')
      results.errors.push('Accept terms button not found')
    }

    // F. Scroll to bottom and verify unlock
    log('Step F: Scroll terms to bottom…')
    const scrollable = page.locator('.overflow-y-auto').filter({ has: page.locator('text=OZ Rent A Plane') }).first()
    if ((await scrollable.count()) > 0) {
      await scrollable.evaluate((el) => el.scrollTop = el.scrollHeight)
      await page.waitForTimeout(800)
      await page.screenshot({ path: '/tmp/terms_flow_F_scrolled.png', fullPage: true })

      // Check checkbox becomes enabled
      const checkbox = page.locator('input[type="checkbox"]').first()
      const checkboxEnabled = !(await checkbox.isDisabled())
      results.F_scrollUnlocks = checkboxEnabled
      if (checkboxEnabled) pass('Scroll unlocked checkbox and accept button')
      else fail('Checkbox still disabled after scroll')
    } else {
      // Try JS scroll on all overflow-y-auto divs
      const count = await page.locator('.overflow-y-auto').count()
      info(`Found ${count} scrollable element(s), trying each…`)
      for (let i = 0; i < count; i++) {
        await page.locator('.overflow-y-auto').nth(i).evaluate((el) => el.scrollTop = el.scrollHeight)
      }
      await page.waitForTimeout(800)
      const checkbox2 = page.locator('input[type="checkbox"]').first()
      results.F_scrollUnlocks = !(await checkbox2.isDisabled())
      if (results.F_scrollUnlocks) pass('Scroll unlocked via fallback')
      else fail('Checkbox still disabled after scroll (fallback)')
    }

    // G. Check checkbox and accept
    log('Step G: Check checkbox and accept…')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isDisabled())) {
      await checkbox.check()
      await page.waitForTimeout(300)
      const acceptBtnNow = page.getByRole('button', { name: /Accept terms/i })
      if ((await acceptBtnNow.count()) > 0 && !(await acceptBtnNow.isDisabled())) {
        await acceptBtnNow.click()
        await page.waitForTimeout(2500)
        await page.screenshot({ path: '/tmp/terms_flow_G_accepted.png', fullPage: true })

        const bodyAfter = await page.locator('body').innerText()
        const hasError = bodyAfter.toLowerCase().includes('could not save') || bodyAfter.toLowerCase().includes('error')
        const has404 = page.url().includes('404') || bodyAfter.includes('404') || bodyAfter.includes('not found')
        results.G_acceptedWithoutError = !hasError
        results.H_no404 = !has404

        if (!hasError) pass('No error after accepting terms')
        else { fail('Error message appeared: ' + bodyAfter.slice(0, 200)); results.errors.push('terms accept error') }
        if (!has404) pass('No 404 after accepting')
        else fail('404 detected after accepting')
      } else {
        fail('Accept button still disabled after checkbox was checked')
        results.errors.push('accept button still disabled')
      }
    } else {
      fail('Checkbox still disabled — cannot accept terms')
      results.errors.push('checkbox disabled after scroll')
    }

    // I. Modal closed
    await page.waitForTimeout(1000)
    const modalGone = (await page.locator('text=Booking Terms and Conditions').count()) === 0
      && (await page.locator('text=Scroll to the end').count()) === 0
    results.I_modalClosed = modalGone
    if (modalGone) pass('Modal closed after acceptance')
    else fail('Modal did not close after acceptance')

    // J. Terms section shows accepted
    await page.goto(`${BASE_URL}/dashboard/bookings/new`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: '/tmp/terms_flow_J_after.png', fullPage: true })
    const bodyFinal = await page.locator('body').innerText()
    results.J_termsAcceptedInUI = bodyFinal.includes('Accepted current version')
    if (results.J_termsAcceptedInUI) pass('UI shows "Accepted current version"')
    else {
      fail('UI does not show "Accepted current version"')
      info('Page text snippet: ' + bodyFinal.slice(0, 300))
    }

  } catch (e) {
    results.errors.push(e.message)
    console.error('Playwright error:', e.message)
    await page.screenshot({ path: '/tmp/terms_flow_ERROR.png', fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }

  // K. DB evidence
  log('Step K: DB evidence — querying booking_terms_acceptances…')
  const { data: dbRecords, error: dbErr } = await admin
    .from('booking_terms_acceptances')
    .select('id, user_id, booking_id, terms_document_id, terms_version, terms_content_hash, acceptance_context, accepted_at')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false })

  if (dbErr) {
    fail('DB query failed: ' + dbErr.message)
    results.errors.push('DB query error: ' + dbErr.message)
  } else if (!dbRecords?.length) {
    fail('No terms acceptance record found in DB for this user')
    results.errors.push('no DB record')
  } else {
    console.log('\nDB records for user:')
    for (const r of dbRecords) {
      console.log('  ─')
      console.log('  id                :', r.id)
      console.log('  user_id           :', r.user_id)
      console.log('  booking_id        :', r.booking_id, r.booking_id === null ? '(null ✓)' : '(UNEXPECTED non-null)')
      console.log('  terms_document_id :', r.terms_document_id)
      console.log('  terms_version     :', r.terms_version)
      console.log('  terms_content_hash:', r.terms_content_hash)
      console.log('  acceptance_context:', r.acceptance_context, r.acceptance_context === 'booking_readiness' ? '(booking_readiness ✓)' : '(expected: booking_readiness)')
      console.log('  accepted_at       :', r.accepted_at)

      if (r.acceptance_context === 'booking_readiness' && r.booking_id === null) {
        results.K_dbRecordCorrect = true
      }
    }
    if (results.K_dbRecordCorrect) pass('DB record has acceptance_context=booking_readiness and booking_id=null')
    else fail('DB record does not match expected values (acceptance_context should be booking_readiness)')
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('  TERMS ACCEPTANCE FLOW — RESULT SUMMARY')
  console.log('═'.repeat(60))
  const steps = [
    ['A', 'Login succeeded', results.A_loginSuccess],
    ['B', 'Readiness gate visible', results.B_readinessGate],
    ['C', 'Terms shows "not accepted"', results.C_termsNotAccepted],
    ['D', 'Terms modal opened', results.D_termsModalOpened],
    ['E', 'Accept button disabled before scroll', results.E_acceptButtonDisabledBeforeScroll],
    ['F', 'Scroll unlocks checkbox/accept', results.F_scrollUnlocks],
    ['G', 'Accepted without error', results.G_acceptedWithoutError],
    ['H', 'No 404', results.H_no404],
    ['I', 'Modal closed after acceptance', results.I_modalClosed],
    ['J', 'UI shows "Accepted current version"', results.J_termsAcceptedInUI],
    ['K', 'DB: acceptance_context=booking_readiness, booking_id=null', results.K_dbRecordCorrect],
  ]
  let passing = 0
  for (const [step, label, ok] of steps) {
    const icon = ok ? '✓' : '✗'
    console.log(`  ${icon} Step ${step}: ${label}`)
    if (ok) passing++
  }
  console.log(`\n  ${passing}/${steps.length} steps passed`)
  if (results.errors.length) {
    console.log('  Errors:', results.errors)
  }

  // Cleanup dry-run
  if (!isProvidedUser) {
    console.log('\n' + '─'.repeat(60))
    console.log('  CLEANUP DRY-RUN (not executed)')
    console.log('─'.repeat(60))
    const [t, d, b, h] = await Promise.all([
      admin.from('booking_terms_acceptances').select('id').eq('user_id', userId),
      admin.from('user_documents').select('id').eq('user_id', userId),
      admin.from('bookings').select('id').eq('booking_owner_user_id', userId),
      admin.from('historical_checkout_completions').select('id').eq('customer_id', userId),
    ])
    console.log(`  user email   : ${email}`)
    console.log(`  user id      : ${userId}`)
    console.log(`  terms        : ${t.data?.length ?? 0} row(s)`)
    console.log(`  documents    : ${d.data?.length ?? 0} row(s)`)
    console.log(`  bookings     : ${b.data?.length ?? 0} row(s)`)
    console.log(`  historical   : ${h.data?.length ?? 0} row(s)`)
    console.log('  profiles     : 1 row')
    console.log('  DO NOT DELETE — awaiting explicit approval.')
  }

  console.log('\nScreenshots saved to /tmp/terms_flow_*.png')
  const allPass = passing === steps.length
  if (!allPass) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
