import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

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

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3002'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase env')
const admin = createClient(url, key)

const ts = Date.now()
const pw = 'TestPass!23456'

const users = {
  admin: `admin-e2e-${ts}@example.com`,
  normal: `normal-checkout-e2e-${ts}@example.com`,
  // Keep this pattern reserved for precheck-only disposable users so cleanup
  // scripts include it in future sweeps.
  precheck: `historical-precheck-${ts}@example.com`,
  histMissing: `historical-checkout-missing-compliance-${ts}@example.com`,
  histComplete: `historical-checkout-complete-compliance-${ts}@example.com`,
  cancelledThenHistorical: `cancelled-then-historical-${ts}@example.com`,
  control: `optional-active-checkout-control-${ts}@example.com`,
}

const ids = {}

async function createAuthUser(email, role = 'customer', clearance = 'checkout_required', fullName = 'Test User', lastFlightDate = null) {
  const created = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: fullName } })
  if (created.error) throw created.error
  const id = created.data.user.id
  ids[email] = id
  const { error: upErr } = await admin.from('profiles').upsert({
    id, email, role, full_name: fullName, pilot_clearance_status: clearance, account_status: 'active',
    pilot_arn: '1234567', has_night_vfr_rating: false, last_flight_date: lastFlightDate,
  })
  if (upErr) throw upErr
  return id
}

const isoPlusDays = (days) => new Date(Date.now() + days * 86400000).toISOString()
const datePlusDays = (days) => isoPlusDays(days).slice(0, 10)

async function seedDocs(userId, status = 'approved') {
  const now = new Date().toISOString()
  const docs = [
    { document_type: 'pilot_licence', file_name: 'pilot.pdf', storage_path: `${userId}/pilot_licence/pilot.pdf`, status, expiry_date: null, licence_number: '1234567' },
    { document_type: 'medical_certificate', file_name: 'medical.pdf', storage_path: `${userId}/medical_certificate/medical.pdf`, status, expiry_date: datePlusDays(180) },
    { document_type: 'photo_id', file_name: 'photo.pdf', storage_path: `${userId}/photo_id/photo.pdf`, status, expiry_date: datePlusDays(365) },
  ]
  const payload = docs.map((d) => ({ user_id: userId, ...d, uploaded_at: now, created_at: now, updated_at: now }))
  const { error } = await admin.from('user_documents').insert(payload)
  if (error) throw error
}

async function seedTermsAcceptance(userId, activeTerms) {
  const { error } = await admin.from('booking_terms_acceptances').insert({
    booking_id: null, checkout_request_id: null, user_id: userId,
    terms_document_id: activeTerms.id, terms_version: activeTerms.version,
    terms_document_url: activeTerms.public_url, terms_content_hash: activeTerms.content_hash,
    acceptance_text: 'I have read and accept the booking terms and conditions.',
    accepted_ip: '127.0.0.1', user_agent: 'playwright-e2e',
  })
  if (error) throw error
}

async function loginAndCheck(email, expected) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(pw)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForTimeout(1800)
  await page.goto(`${baseUrl}/dashboard/bookings/new`, { waitUntil: 'networkidle' })
  const text = await page.locator('body').innerText()
  const hasBookingForm = (await page.locator('[data-testid=\"booking-form\"]').count()) > 0
  const hasReadinessGate = (await page.locator('[data-testid=\"booking-readiness-gate\"]').count()) > 0
  const hasCheckoutRequiredGate = (await page.locator('[data-testid=\"checkout-required-gate\"]').count()) > 0
  const hasMissingInvoiceGate = (await page.locator('[data-testid=\"missing-checkout-invoice-error\"]').count()) > 0
  const result = {
    expected,
    sawMissingInvoiceError: hasMissingInvoiceGate || text.includes('System Error: Missing Checkout Invoice'),
    sawReadiness: hasReadinessGate,
    sawCheckoutRequired: hasCheckoutRequiredGate || text.includes('Complete Your Checkout Flight First'),
    sawBookingForm: hasBookingForm,
    selectors: {
      bookingForm: hasBookingForm,
      bookingReadinessGate: hasReadinessGate,
      checkoutRequiredGate: hasCheckoutRequiredGate,
      missingCheckoutInvoiceError: hasMissingInvoiceGate,
    },
  }
  await page.screenshot({ path: `/tmp/${email.replace(/[@.]/g, '_')}.png`, fullPage: true })
  await browser.close()
  return result
}

async function adminWarningCheck(adminEmail, targetCustomerId) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').first().fill(adminEmail)
  await page.locator('input[type="password"]').first().fill(pw)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForTimeout(1500)
  await page.goto(`${baseUrl}/admin/users/${targetCustomerId}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Mark Checkout Completed/i }).first().click()
  await page.waitForTimeout(1000)
  const body = await page.locator('body').innerText()
  const hasWarning = body.includes('Customer already has an active checkout request')
  await page.screenshot({ path: `/tmp/admin_active_warning_${targetCustomerId}.png`, fullPage: true })
  await browser.close()
  return hasWarning
}

async function q(name, email) {
  const { data: p } = await admin.from('profiles').select('id,full_name,email,pilot_clearance_status,created_at').eq('email', email).maybeSingle()
  if (!p) return { name, missing: true }
  const customerId = p.id
  const [h,b,inv,led,bt,sb,docs,terms] = await Promise.all([
    admin.from('historical_checkout_completions').select('*').eq('customer_id', customerId).order('recorded_at', { ascending: false }),
    admin.from('bookings').select('id,booking_owner_user_id,status,checkout_lifecycle_status,scheduled_start,scheduled_end,created_at,updated_at').eq('booking_owner_user_id', customerId).order('created_at', { ascending: false }),
    admin.from('checkout_invoices').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    admin.from('customer_payment_ledger').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    admin.from('checkout_bank_transfer_submissions').select('*').eq('customer_id', customerId),
    admin.from('schedule_blocks').select('*').eq('created_by_user_id', customerId).order('created_at', { ascending: false }),
    admin.from('user_documents').select('id,user_id,document_type,status,expiry_date,created_at,updated_at').eq('user_id', customerId).order('created_at', { ascending: false }),
    admin.from('booking_terms_acceptances').select('*').eq('user_id', customerId).order('accepted_at', { ascending: false }),
  ])
  return { name, profile: p, historical: h.data ?? [], bookings: b.data ?? [], invoices: inv.data ?? [], ledger: led.data ?? [], bankTransfers: bt.data ?? [], scheduleBlocks: sb.data ?? [], documents: docs.data ?? [], terms: terms.data ?? [] }
}

;(async () => {
  const { data: aircraft } = await admin.from('aircraft').select('id, registration').eq('registration', 'VH-KZG').maybeSingle()
  if (!aircraft?.id) throw new Error('Aircraft VH-KZG not found')

  const { data: termsRow } = await admin.from('terms_documents').select('id,version,public_url,content_hash').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!termsRow) throw new Error('Active terms document not found')

  const adminId = await createAuthUser(users.admin, 'admin', 'checkout_required', 'E2E Admin')
  const normalId = await createAuthUser(users.normal, 'customer', 'cleared_to_fly', 'Normal E2E', datePlusDays(-30))
  const histMissingId = await createAuthUser(users.histMissing, 'customer', 'cleared_to_fly', 'Hist Missing E2E')
  const histCompleteId = await createAuthUser(users.histComplete, 'customer', 'cleared_to_fly', 'Hist Complete E2E', datePlusDays(-45))
  const cancelledThenHistoricalId = await createAuthUser(users.cancelledThenHistorical, 'customer', 'cleared_to_fly', 'Cancelled Then Historical E2E', datePlusDays(-20))
  const controlId = await createAuthUser(users.control, 'customer', 'checkout_required', 'Control E2E')

  await seedDocs(normalId, 'approved')
  await seedTermsAcceptance(normalId, termsRow)
  const start = isoPlusDays(1)
  const end = isoPlusDays(1 + (2 / 24))
  const { data: normalCheckoutBooking, error: normalBkErr } = await admin.from('bookings').insert({
    aircraft_id: aircraft.id,
    booking_owner_user_id: normalId,
    scheduled_start: start,
    scheduled_end: end,
    status: 'completed',
    booking_type: 'checkout',
    payment_status: 'paid',
    checkout_lifecycle_status: 'completed',
    booking_reference: `E2E-CHK-${ts}`,
  }).select('id').single()
  if (normalBkErr) throw normalBkErr
  const { error: invErr } = await admin.from('checkout_invoices').insert({
    customer_id: normalId,
    booking_id: normalCheckoutBooking.id,
    invoice_number: `CHK-E2E-${ts}`,
    invoice_type: 'checkout',
    status: 'paid',
    currency: 'aud',
    subtotal_cents: 20000,
    advance_applied_cents: 0,
    stripe_amount_due_cents: 0,
    total_paid_cents: 20000,
    checkout_duration_hours: 1,
    checkout_rate_cents_per_hour: 20000,
    checkout_calculated_amount_cents: 20000,
    checkout_final_amount_cents: 20000,
    checkout_completed_at: new Date().toISOString(),
    checkout_completed_by: adminId,
    checkout_outcome: 'cleared_to_fly',
    checkout_landing_subtotal_cents: 0,
    payment_method: 'bank_transfer',
    online_payment_surcharge_cents: 0,
    vdo_reading: 1,
  })
  if (invErr) throw invErr

  await admin.from('historical_checkout_completions').insert({
    customer_id: histMissingId,
    checkout_date: datePlusDays(-7),
    checkout_outcome: 'cleared_to_fly',
    admin_notes: 'E2E historical missing compliance',
    recorded_by_admin_id: adminId,
    source: 'historical_admin',
    is_active: true,
    created_flight_log: false,
  })

  await admin.from('historical_checkout_completions').insert({
    customer_id: histCompleteId,
    checkout_date: datePlusDays(-7),
    checkout_outcome: 'cleared_to_fly',
    admin_notes: 'E2E historical complete compliance',
    recorded_by_admin_id: adminId,
    source: 'historical_admin',
    is_active: true,
    created_flight_log: false,
  })
  await seedDocs(histCompleteId, 'approved')
  await seedTermsAcceptance(histCompleteId, termsRow)
  await seedDocs(cancelledThenHistoricalId, 'uploaded')
  await seedTermsAcceptance(cancelledThenHistoricalId, termsRow)
  const { data: cancelledBooking, error: cancelledBkErr } = await admin.from('bookings').insert({
    aircraft_id: aircraft.id,
    booking_owner_user_id: cancelledThenHistoricalId,
    scheduled_start: isoPlusDays(2),
    scheduled_end: isoPlusDays(2 + (2 / 24)),
    status: 'cancelled',
    booking_type: 'checkout',
    payment_status: 'not_started',
    checkout_lifecycle_status: 'cancelled_by_admin',
    booking_reference: `E2E-CXL-${ts}`,
  }).select('id').single()
  if (cancelledBkErr) throw cancelledBkErr
  await admin.from('historical_checkout_completions').insert({
    customer_id: cancelledThenHistoricalId,
    checkout_date: datePlusDays(-5),
    checkout_outcome: 'cleared_to_fly',
    admin_notes: `Cancelled booking ${cancelledBooking.id} then historical completion`,
    recorded_by_admin_id: adminId,
    source: 'historical_admin',
    is_active: true,
    created_flight_log: false,
  })

  await admin.from('bookings').insert({
    aircraft_id: aircraft.id,
    booking_owner_user_id: controlId,
    scheduled_start: isoPlusDays(3),
    scheduled_end: isoPlusDays(3 + (2 / 24)),
    status: 'checkout_requested',
    booking_type: 'checkout',
    payment_status: 'not_started',
    checkout_lifecycle_status: null,
    booking_reference: `E2E-ACK-${ts}`,
  })
  await admin.from('profiles').update({ pilot_clearance_status: 'checkout_required' }).eq('id', controlId)

  let activeCheckoutWarning = false
  let activeCheckoutWarningError = null
  try {
    activeCheckoutWarning = await adminWarningCheck(users.admin, controlId)
  } catch (e) {
    activeCheckoutWarningError = e instanceof Error ? e.message : String(e)
  }

  const ui = {
    normal: await loginAndCheck(users.normal, 'booking_form'),
    histMissing: await loginAndCheck(users.histMissing, 'readiness_gate'),
    histComplete: await loginAndCheck(users.histComplete, 'booking_form'),
    cancelledThenHistorical: await loginAndCheck(users.cancelledThenHistorical, 'readiness_gate'),
    control: await loginAndCheck(users.control, 'checkout_required_gate'),
    activeCheckoutWarning,
    activeCheckoutWarningError,
  }

  const sqlEvidence = {
    normal: await q('normal', users.normal),
    histMissing: await q('histMissing', users.histMissing),
    histComplete: await q('histComplete', users.histComplete),
    cancelledThenHistorical: await q('cancelledThenHistorical', users.cancelledThenHistorical),
    control: await q('control', users.control),
  }

  const out = { environment: { siteUrl: baseUrl, supabaseUrl: url, timestamp: new Date().toISOString() }, users, userIds: ids, ui, sqlEvidence }
  fs.writeFileSync('/tmp/e2e_booking_readiness_output.json', JSON.stringify(out, null, 2))
  console.log('WROTE /tmp/e2e_booking_readiness_output.json')
})().catch((e) => { console.error(e); process.exit(1) })
