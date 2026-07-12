// Post-flight billing test suite (task: block-time-aware branching, admin
// submission, overage gate).
//
// Runs against the linked Supabase project with the service-role key, using
// disposable test users that are removed at the end. The overage-payment
// webhook tests start a local Next.js dev server (port 3035) and POST real
// signed Stripe events at the actual /api/stripe/webhook route. The shared
// flight-record submission core (lib/booking/flight-record-submission.ts) is
// compiled from TypeScript and driven directly against the database — the
// same code both the customer and admin server actions call.
//
// Prerequisites: migration 104_block_time_overage_gate.sql applied (the suite
// verifies this first and aborts with instructions if missing).
//
// Usage: node scripts/test_post_flight_billing_suite.mjs

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

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

// Suppress real emails everywhere in this process (email_events rows are
// still written with status 'skipped', which is what the email assertions use).
process.env.RESEND_API_KEY = ''

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
if (!url || !key) throw new Error('Missing Supabase env')
if (!anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!webhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET')

const admin = createClient(url, key)
let authenticatedAdminClientPromise = null
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2023-10-16' })

const PORT = 3035
const BASE = `http://localhost:${PORT}`
const ts = Date.now()
const DAY_MS = 24 * 60 * 60 * 1000

const results = []
let failures = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function assertEq(name, actual, expected) {
  const ok = actual === expected
  record(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  return ok
}

function assertClose(name, actual, expected, eps = 0.011) {
  const ok = Math.abs(Number(actual) - Number(expected)) < eps
  record(name, ok, ok ? '' : `expected ≈${expected}, got ${actual}`)
  return ok
}

function assertTruthy(name, value, detail = '') {
  record(name, Boolean(value), Boolean(value) ? '' : detail || `got ${JSON.stringify(value)}`)
  return Boolean(value)
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const createdUserIds = []
const createdBookingIds = []
const createdPurchaseIds = []
const testEventIds = []

async function createTestUser(tag, role = 'customer') {
  const email = `pf-billing-suite-${tag}-${ts}@example.com`
  const created = await admin.auth.admin.createUser({
    email,
    password: 'TestPass!23456',
    email_confirm: true,
    user_metadata: { full_name: `PF Billing Suite ${tag}` },
  })
  if (created.error) throw created.error
  const id = created.data.user.id
  createdUserIds.push(id)
  const { error: upErr } = await admin.from('profiles').upsert({
    id,
    email,
    role,
    full_name: `PF Billing Suite ${tag}`,
    pilot_clearance_status: 'cleared_to_fly',
    account_status: 'active',
  })
  if (upErr) throw upErr
  return id
}

async function getAuthenticatedAdminClient() {
  if (!authenticatedAdminClientPromise) {
    authenticatedAdminClientPromise = (async () => {
      const email = `pf-billing-suite-auth-admin-${ts}@example.com`
      const password = 'TestPass!23456'
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'PF Billing Suite Auth Admin' },
      })
      if (created.error) throw created.error
      const adminUserId = created.data.user.id
      createdUserIds.push(adminUserId)
      const { error: upErr } = await admin.from('profiles').upsert({
        id: adminUserId,
        email,
        role: 'admin',
        full_name: 'PF Billing Suite Auth Admin',
        pilot_clearance_status: 'cleared_to_fly',
        account_status: 'active',
      })
      if (upErr) throw upErr

      const authClient = createClient(url, anonKey)
      const { error: signInErr } = await authClient.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr
      return authClient
    })()
  }
  return authenticatedAdminClientPromise
}

async function createBooking(userId, aircraftId, offsetHours, status = 'pending_post_flight_review') {
  const start = new Date(Date.now() + offsetHours * 3600_000)
  const end = new Date(start.getTime() + 2 * 3600_000)
  const { data, error } = await admin
    .from('bookings')
    .insert({
      aircraft_id: aircraftId,
      booking_owner_user_id: userId,
      booking_type: 'standard',
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      status,
      pic_name: 'Test Pilot',
    })
    .select('id, scheduled_start, scheduled_end, status, aircraft_id, booking_owner_user_id, pic_name, pic_arn')
    .single()
  if (error) throw error
  createdBookingIds.push(data.id)
  return data
}

// Insert as pending, then flip to active so the queue-position trigger fires —
// same lifecycle as a real purchase, without driving the purchase webhook.
async function createActivePurchase(userId, pkg, ratePerHour, hours) {
  const rate = ratePerHour ?? Number(pkg.rate_per_hour)
  const h = hours ?? Number(pkg.hours)
  const { data, error } = await admin
    .from('pilot_block_time_purchases')
    .insert({
      user_id: userId,
      package_id: pkg.id,
      hours_purchased: h,
      hours_remaining: h,
      rate_per_hour: rate,
      amount_paid: Math.round(h * rate * 100) / 100,
      status: 'pending',
      purchased_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * DAY_MS).toISOString(),
      stripe_payment_intent_id: `pi_test_pfb_seed_${userId.slice(0, 8)}_${ts}`,
    })
    .select('id')
    .single()
  if (error) throw error
  createdPurchaseIds.push(data.id)
  const { error: actErr } = await admin
    .from('pilot_block_time_purchases')
    .update({ status: 'active', activated_at: new Date().toISOString() })
    .eq('id', data.id)
  if (actErr) throw actErr
  return data.id
}

async function getPurchase(purchaseId) {
  const { data, error } = await admin
    .from('pilot_block_time_purchases')
    .select('*')
    .eq('id', purchaseId)
    .single()
  if (error) throw error
  return data
}

async function getInvoice(invoiceId) {
  const { data, error } = await admin
    .from('invoices')
    .select('*, invoice_line_items ( type, description, quantity, unit_price, amount )')
    .eq('id', invoiceId)
    .single()
  if (error) throw error
  return data
}

// Same condition as lib/payments/block-time-overage.ts getOutstandingOverageInvoices.
async function gateInvoices(userId) {
  const { data, error } = await admin
    .from('invoices')
    .select('id, invoice_number, total, status')
    .eq('user_id', userId)
    .eq('is_block_time_overage', true)
    .eq('status', 'awaiting')
  if (error) throw error
  return data ?? []
}

async function drawdown(userId, bookingId, vdoHours, landingFees) {
  // Migration 108 added an auth.uid()-based admin guard to this RPC, so it can
  // no longer be driven with the service-role client (auth.uid() is NULL →
  // 'Unauthorized'). Call it the way the app does: with the authenticated
  // admin session client.
  const authedAdmin = await getAuthenticatedAdminClient()
  return authedAdmin.rpc('process_block_time_flight', {
    p_user_id: userId,
    p_booking_id: bookingId,
    p_vdo_hours: vdoHours,
    p_landing_fees: landingFees,
  })
}

async function postSignedEvent(eventId, paymentIntentObject) {
  testEventIds.push(eventId)
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.succeeded',
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: paymentIntentObject },
  })
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

function overagePaymentIntentObject(paymentIntentId, invoice, userId) {
  const amountCents = Math.round(Number(invoice.total) * 100)
  return {
    id: paymentIntentId,
    object: 'payment_intent',
    amount: amountCents,
    amount_received: amountCents,
    currency: 'aud',
    payment_method: 'pm_test_overage',
    metadata: {
      purchase_type: 'block_time_overage_payment',
      supabase_user_id: userId,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      booking_id: invoice.booking_id ?? '',
    },
  }
}

// ── Compiled shared submission core ─────────────────────────────────────────
// Compiles lib/booking/flight-record-submission.ts (and its import graph) to
// CommonJS and loads it with '@/…' mapped into the compiled tree and the two
// Next-only modules stubbed. This drives the exact production code path the
// customer and admin server actions share.

function loadSubmissionCore() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-billing-core-'))
  const repoRoot = process.cwd()
  const tsconfigPath = path.join(outDir, 'tsconfig.suite.json')
  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'es2020',
        moduleResolution: 'node',
        esModuleInterop: true,
        skipLibCheck: true,
        strict: false,
        noEmitOnError: false,
        jsx: 'react-jsx',
        baseUrl: repoRoot,
        rootDir: repoRoot,
        outDir,
        paths: { '@/*': ['./*'] },
      },
      files: [path.join(repoRoot, 'lib/booking/flight-record-submission.ts')],
    }),
  )
  const compile = spawnSync('npx', ['tsc', '--project', tsconfigPath], { encoding: 'utf8' })
  const entry = path.join(outDir, 'lib/booking/flight-record-submission.js')
  if (!fs.existsSync(entry)) {
    throw new Error(`Failed to compile submission core:\n${compile.stdout}\n${compile.stderr}`)
  }

  const require = createRequire(import.meta.url)
  const repoRequire = createRequire(path.join(repoRoot, 'package.json'))
  const Module = require('module')
  const origLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'next/cache') return { revalidatePath: () => {} }
    if (request === 'server-only') return {}
    if (request.startsWith('@/')) {
      return origLoad.call(this, path.join(outDir, request.slice(2)), parent, isMain)
    }
    // Bare package imports from the compiled tmp tree resolve against the
    // repo's node_modules (the tmp dir has none of its own).
    if (!request.startsWith('.') && !path.isAbsolute(request)) {
      try {
        return origLoad.call(this, repoRequire.resolve(request), parent, isMain)
      } catch {
        // fall through to default resolution
      }
    }
    return origLoad.call(this, request, parent, isMain)
  }
  const core = require(entry)
  return { createFlightRecordForBooking: core.createFlightRecordForBooking, outDir }
}

// ── Dev server management ────────────────────────────────────────────────────

let devServer = null

async function startDevServer() {
  console.log(`\nStarting Next.js dev server on port ${PORT}…`)
  devServer = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RESEND_API_KEY: '' },
  })
  devServer.stdout.on('data', () => {})
  devServer.stderr.on('data', () => {})

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/stripe/webhook`, { method: 'GET' })
      if (res.status > 0) return
    } catch {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw new Error('Dev server did not become ready within 120s')
}

function stopDevServer() {
  if (devServer && !devServer.killed) {
    devServer.kill('SIGTERM')
  }
}

// ── Preflight ────────────────────────────────────────────────────────────────

async function preflight() {
  const { error: colErr } = await admin
    .from('invoices')
    .select('is_block_time_overage')
    .limit(1)
  if (colErr) {
    throw new Error(
      `invoices.is_block_time_overage missing (${colErr.message}). Apply supabase/migrations/104_block_time_overage_gate.sql first.`,
    )
  }

  const { error: gstErr } = await admin.rpc('block_time_gst_parts', { p_total: 110 })
  if (gstErr && /could not find the function/i.test(gstErr.message)) {
    throw new Error('block_time_gst_parts missing. Apply supabase/migrations/104_block_time_overage_gate.sql first.')
  }

  const { error: fnErr } = await admin.rpc('process_block_time_flight', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_booking_id: '00000000-0000-0000-0000-000000000000',
    p_vdo_hours: 1,
    p_landing_fees: 0,
  })
  if (fnErr && /could not find the function/i.test(fnErr.message)) {
    throw new Error('process_block_time_flight missing. Apply supabase/migrations/104_block_time_overage_gate.sql first.')
  }
  // v2 detection happens in test [2] via the returned column names.

  const { error: dedupeErr } = await admin.from('stripe_webhook_events').select('event_id').limit(1)
  if (dedupeErr) {
    throw new Error(`stripe_webhook_events missing (${dedupeErr.message}). Apply migration 098 first.`)
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\nCleaning up test data…')
  try {
    if (createdBookingIds.length > 0) {
      const { data: recs } = await admin
        .from('flight_records')
        .select('id')
        .in('booking_id', createdBookingIds)
      const recIds = (recs ?? []).map((r) => r.id)
      if (recIds.length > 0) {
        await admin.from('flight_record_landings').delete().in('flight_record_id', recIds)
        await admin.from('flight_records').delete().in('id', recIds)
      }
      await admin.from('aircraft_flight_logs').delete().in('related_booking_id', createdBookingIds)
      await admin.from('booking_landing_charges').delete().in('booking_id', createdBookingIds)
      await admin.from('booking_invoices').delete().in('booking_id', createdBookingIds)
      await admin.from('booking_status_history').delete().in('booking_id', createdBookingIds)
      await admin.from('booking_audit_events').delete().in('booking_id', createdBookingIds)
      await admin.from('email_events').delete().in('entity_id', createdBookingIds)
    }
    if (createdUserIds.length > 0) {
      const { data: invs } = await admin.from('invoices').select('id').in('user_id', createdUserIds)
      const invIds = (invs ?? []).map((r) => r.id)
      if (invIds.length > 0) {
        await admin.from('invoice_line_items').delete().in('invoice_id', invIds)
      }
      await admin.from('pilot_block_time_usage').delete().in('user_id', createdUserIds)
      if (invIds.length > 0) {
        await admin.from('invoices').delete().in('id', invIds)
      }
      await admin.from('verification_events').delete().in('user_id', createdUserIds)
    }
    if (testEventIds.length > 0) {
      await admin.from('stripe_webhook_events').delete().in('event_id', testEventIds)
    }
    if (createdBookingIds.length > 0) {
      await admin.from('bookings').delete().in('id', createdBookingIds)
    }
    if (createdPurchaseIds.length > 0) {
      await admin.from('block_time_topups').delete().in('purchase_id', createdPurchaseIds)
      await admin.from('pilot_block_time_purchases').delete().in('id', createdPurchaseIds)
    }
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) console.warn(`  cleanup: could not delete user ${id}: ${error.message}`)
    }
  } catch (err) {
    console.warn(`  cleanup step failed: ${err?.message ?? err}`)
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Post-flight billing suite — preflight…')
  await preflight()
  console.log('  preflight OK')
  const adminAuthClient = await getAuthenticatedAdminClient()

  const { data: aircraft } = await admin.from('aircraft').select('id, registration').limit(1).single()
  if (!aircraft) throw new Error('No aircraft row found')
  const { data: airport } = await admin
    .from('airports')
    .select('id, icao_code, default_landing_fee_cents')
    .eq('is_active', true)
    .limit(1)
    .single()
  if (!airport) throw new Error('No active airport found')
  const landingFee = Number(airport.default_landing_fee_cents) / 100
  const { data: pkg } = await admin
    .from('block_time_packages')
    .select('id, name, hours, rate_per_hour, validity_days')
    .eq('is_active', true)
    .order('hours', { ascending: true })
    .limit(1)
    .single()
  if (!pkg) throw new Error('No active block time package found')

  // ══ [1] PAYF path unchanged ══
  console.log('\n[1] PAYF finalisation (unchanged behaviour)')
  const payfUser = await createTestUser('payf')
  const payfBooking = await createBooking(payfUser, aircraft.id, -30)
  const { data: payfRows, error: payfErr } = await adminAuthClient.rpc('finalise_standard_booking_invoice_atomic', {
    p_booking_id: payfBooking.id,
    p_customer_id: payfUser,
    p_vdo_reading: 2.0,
    p_rate_cents_per_hour: 33000,
    p_landing_charges: [{ airport_id: airport.id, landing_count: 1 }],
    p_admin_notes: 'suite payf',
  })
  assertTruthy('PAYF RPC succeeds', !payfErr && payfRows?.[0], payfErr?.message)
  if (payfRows?.[0]) {
    const expectedCents = 2 * 33000 + Number(airport.default_landing_fee_cents)
    assertEq('PAYF amount due', Number(payfRows[0].out_amount_due_now_cents), expectedCents)
    assertEq('PAYF final status', payfRows[0].out_final_booking_status, 'payment_pending')
    const { data: payfBk } = await admin.from('bookings').select('status').eq('id', payfBooking.id).single()
    assertEq('PAYF booking → payment_pending', payfBk?.status, 'payment_pending')
    const { data: payfInv } = await admin
      .from('booking_invoices')
      .select('id, stripe_amount_due_cents')
      .eq('booking_id', payfBooking.id)
      .single()
    assertTruthy('PAYF booking_invoices row exists', payfInv)
    assertEq('PAYF invoice amount', Number(payfInv?.stripe_amount_due_cents), expectedCents)
    const gateAfterPayf = await gateInvoices(payfUser)
    assertEq('PAYF creates no overage gate', gateAfterPayf.length, 0)
  }

  // ══ [2] Block time within balance ══
  console.log('\n[2] Block time within balance')
  const btUser = await createTestUser('bt-within')
  const btPurchase = await createActivePurchase(btUser, pkg, 250, 10)
  const btBooking = await createBooking(btUser, aircraft.id, -29)
  const { data: ddRows, error: ddErr } = await drawdown(btUser, btBooking.id, 2.0, 0)
  assertTruthy('drawdown RPC succeeds', !ddErr && ddRows?.[0], ddErr?.message)
  const dd = ddRows?.[0] ?? {}
  assertTruthy(
    'RPC is v2 (out_usage_invoice_id present)',
    'out_usage_invoice_id' in dd,
    `returned keys: ${Object.keys(dd).join(', ')} — apply migration 104`,
  )
  assertClose('hours_after 8.0', dd.out_hours_after, 8.0)
  assertEq('no overage invoice', dd.out_overage_invoice_id ?? null, null)
  assertEq('no landing invoice', dd.out_landing_invoice_id ?? null, null)
  const btPurchaseAfter = await getPurchase(btPurchase)
  assertClose('purchase balance 8.0', btPurchaseAfter.hours_remaining, 8.0)
  assertEq('purchase still active', btPurchaseAfter.status, 'active')
  if (dd.out_usage_invoice_id) {
    const usageInv = await getInvoice(dd.out_usage_invoice_id)
    assertEq('usage invoice paid', usageInv.status, 'paid')
    assertEq('usage invoice not overage-flagged', usageInv.is_block_time_overage, false)
    assertClose('usage invoice total 500', usageInv.total, 500)
    assertEq('usage line item type', usageInv.invoice_line_items?.[0]?.type, 'flight_hours')
    assertClose('usage line qty 2.0', usageInv.invoice_line_items?.[0]?.quantity, 2.0)
  }
  const { data: usageRow } = await admin
    .from('pilot_block_time_usage')
    .select('*')
    .eq('booking_id', btBooking.id)
    .single()
  assertTruthy('usage history row exists', usageRow)
  assertClose('usage row deducted 2.0', usageRow?.hours_deducted, 2.0)
  assertClose('usage row overflow 0', usageRow?.overflow_hours, 0)
  assertEq('usage row links usage invoice', usageRow?.invoice_id, dd.out_usage_invoice_id)
  assertEq('no gate after within-balance flight', (await gateInvoices(btUser)).length, 0)

  // ══ [3] Landing fees within balance — separate invoice ══
  console.log('\n[3] Landing fees always invoiced separately (within balance)')
  const btBooking2 = await createBooking(btUser, aircraft.id, -28)
  const { data: dd2Rows, error: dd2Err } = await drawdown(btUser, btBooking2.id, 1.5, landingFee)
  assertTruthy('drawdown with landing fees succeeds', !dd2Err && dd2Rows?.[0], dd2Err?.message)
  const dd2 = dd2Rows?.[0] ?? {}
  assertEq('no overage invoice (within balance)', dd2.out_overage_invoice_id ?? null, null)
  assertTruthy('landing invoice created', dd2.out_landing_invoice_id)
  if (dd2.out_landing_invoice_id) {
    const landInv = await getInvoice(dd2.out_landing_invoice_id)
    assertEq('landing invoice separate from usage', landInv.id !== dd2.out_usage_invoice_id, true)
    assertEq('landing invoice awaiting payment', landInv.status, 'awaiting')
    assertEq('landing invoice not overage-flagged', landInv.is_block_time_overage, false)
    assertClose('landing invoice total', landInv.total, landingFee)
    assertEq('landing line item type', landInv.invoice_line_items?.[0]?.type, 'landing_fee')
  }
  if (dd2.out_usage_invoice_id) {
    const usage2 = await getInvoice(dd2.out_usage_invoice_id)
    assertEq('usage invoice has no landing line', usage2.invoice_line_items?.every((li) => li.type === 'flight_hours'), true)
    assertClose('usage invoice total 375', usage2.total, 375)
  }
  assertEq('landing invoice does not gate', (await gateInvoices(btUser)).length, 0)

  // ══ [4] Overage: invoices, flags, gate, webhook payment ══
  console.log('\n[4] Overage — invoice + gate + payment lifts gate')
  const ovUser = await createTestUser('overage')
  const ovPurchase = await createActivePurchase(ovUser, pkg, 250, 2)
  const ovBooking = await createBooking(ovUser, aircraft.id, -27)
  const { data: ovRows, error: ovErr } = await drawdown(ovUser, ovBooking.id, 3.5, landingFee)
  assertTruthy('overage drawdown succeeds', !ovErr && ovRows?.[0], ovErr?.message)
  const ov = ovRows?.[0] ?? {}
  assertClose('deducted to zero', ov.out_hours_after, 0)
  assertClose('overflow hours 1.5', ov.out_overflow_hours, 1.5)
  assertClose('overflow amount 375', ov.out_overflow_amount, 375)
  const ovPurchaseAfter = await getPurchase(ovPurchase)
  assertEq('package exhausted', ovPurchaseAfter.status, 'exhausted')
  assertTruthy('overage invoice created', ov.out_overage_invoice_id)
  assertTruthy('landing invoice created alongside overage', ov.out_landing_invoice_id)
  let ovInvoice = null
  if (ov.out_overage_invoice_id) {
    ovInvoice = await getInvoice(ov.out_overage_invoice_id)
    assertEq('overage invoice awaiting', ovInvoice.status, 'awaiting')
    assertEq('overage invoice flagged', ovInvoice.is_block_time_overage, true)
    assertClose('overage invoice total 375 (locked rate)', ovInvoice.total, 375)
    assertEq('overage line type', ovInvoice.invoice_line_items?.[0]?.type, 'overflow_hours')
    assertClose('overage line at locked rate 250', ovInvoice.invoice_line_items?.[0]?.unit_price, 250)
    assertTruthy(
      'overage line flagged in description',
      String(ovInvoice.invoice_line_items?.[0]?.description ?? '').includes('OVERAGE'),
    )
  }
  if (ov.out_usage_invoice_id) {
    const ovUsage = await getInvoice(ov.out_usage_invoice_id)
    assertEq('usage invoice paid (deducted 2h)', ovUsage.status, 'paid')
    assertClose('usage invoice total 500', ovUsage.total, 500)
  }
  const gateBefore = await gateInvoices(ovUser)
  assertEq('gate engaged: 1 outstanding overage', gateBefore.length, 1)

  // Webhook payment lifts the gate
  await startDevServer()
  const ovPi = `pi_test_pfb_overage_${ts}`
  const ovEvt = `evt_test_pfb_overage_${ts}`
  const payRes = await postSignedEvent(ovEvt, overagePaymentIntentObject(ovPi, ovInvoice, ovUser))
  assertEq('overage payment webhook 200', payRes.status, 200)
  const ovInvoicePaid = await getInvoice(ov.out_overage_invoice_id)
  assertEq('overage invoice now paid', ovInvoicePaid.status, 'paid')
  assertEq('payment intent recorded', ovInvoicePaid.stripe_payment_intent_id, ovPi)
  assertEq('gate lifted after payment', (await gateInvoices(ovUser)).length, 0)

  // Double-fire safety: same event id, then same payment under a new event id.
  const replaySame = await postSignedEvent(ovEvt, overagePaymentIntentObject(ovPi, ovInvoice, ovUser))
  assertEq('duplicate event returns 200', replaySame.status, 200)
  assertEq('duplicate event flagged as deduped', replaySame.body?.deduped === true, true)
  const ovEvt2 = `evt_test_pfb_overage2_${ts}`
  const replayNew = await postSignedEvent(ovEvt2, overagePaymentIntentObject(ovPi, ovInvoice, ovUser))
  assertEq('replayed payment (new event id) returns 200', replayNew.status, 200)
  const ovInvoiceStill = await getInvoice(ov.out_overage_invoice_id)
  assertEq('invoice still paid after replay', ovInvoiceStill.status, 'paid')

  // ══ [5] Admin-initiated submission via the shared core ══
  console.log('\n[5] Admin-initiated submission (shared core, both billing types)')
  const { createFlightRecordForBooking } = loadSubmissionCore()
  const adminUser = await createTestUser('admin', 'admin')

  // 5a: block time customer
  const adUser = await createTestUser('admin-bt')
  await createActivePurchase(adUser, pkg, 240, 5)
  const adBooking = await createBooking(adUser, aircraft.id, -26, 'confirmed')
  const coreResult = await createFlightRecordForBooking(
    admin,
    adBooking,
    {
      booking_id: adBooking.id,
      date: new Date().toISOString().slice(0, 10),
      pic_name: 'Test Pilot',
      pic_arn: null,
      vdo_total: 1.5,
      tacho_total: 1.4,
      air_switch_total: 1.4,
      mr_total: 1.4,
      landings: 1,
      landing_rows: [{ airport_id: airport.id, landing_count: 1 }],
      customer_notes: null,
    },
    { userId: adminUser, role: 'admin' },
  )
  assertTruthy('core returns flight record id', coreResult?.flightRecordId)
  const { data: adRecord } = await admin
    .from('flight_records')
    .select('*')
    .eq('id', coreResult.flightRecordId)
    .single()
  assertEq('record submitted by admin', adRecord?.submitted_by_user_id, adminUser)
  assertEq('record pending review', adRecord?.status, 'pending_review')
  const { data: adBookingAfter } = await admin.from('bookings').select('status').eq('id', adBooking.id).single()
  assertEq('booking → pending_post_flight_review', adBookingAfter?.status, 'pending_post_flight_review')
  const { data: adAudit } = await admin
    .from('booking_audit_events')
    .select('actor_role, event_type')
    .eq('booking_id', adBooking.id)
    .eq('event_type', 'flight_record_submitted')
    .single()
  assertEq('audit event actor is admin', adAudit?.actor_role, 'admin')
  const { data: adEmail } = await admin
    .from('email_events')
    .select('id, event_type, status')
    .eq('entity_id', adBooking.id)
    .eq('event_type', 'flight_record_submitted')
  assertTruthy('customer confirmation email fired on admin submission', (adEmail ?? []).length > 0)
  const { data: adLandings } = await admin
    .from('flight_record_landings')
    .select('airport_id, landing_count')
    .eq('flight_record_id', coreResult.flightRecordId)
  assertEq('landing rows recorded', (adLandings ?? []).length, 1)
  // Complete the admin block-time path the way adminSubmitFlightRecord →
  // finaliseStandardBookingInvoice does: same drawdown RPC.
  const { data: adDdRows, error: adDdErr } = await drawdown(adUser, adBooking.id, 1.5, landingFee)
  assertTruthy('admin block-time billing drawdown succeeds', !adDdErr && adDdRows?.[0], adDdErr?.message)
  if (adDdRows?.[0]) {
    assertClose('admin path deduction 5.0 → 3.5', adDdRows[0].out_hours_after, 3.5)
    assertTruthy('admin path landing invoice separate', adDdRows[0].out_landing_invoice_id)
  }

  // 5b: PAYF customer
  const adPayfUser = await createTestUser('admin-payf')
  const adPayfBooking = await createBooking(adPayfUser, aircraft.id, -25, 'awaiting_flight_record')
  const corePayf = await createFlightRecordForBooking(
    admin,
    adPayfBooking,
    {
      booking_id: adPayfBooking.id,
      date: new Date().toISOString().slice(0, 10),
      pic_name: 'Test Pilot',
      pic_arn: null,
      vdo_total: 2.0,
      tacho_total: 1.8,
      air_switch_total: 1.8,
      mr_total: 1.8,
      landings: null,
      landing_rows: [],
      customer_notes: null,
    },
    { userId: adminUser, role: 'admin' },
  )
  assertTruthy('PAYF core submission returns id', corePayf?.flightRecordId)
  const { data: adPayfRows, error: adPayfErr } = await adminAuthClient.rpc('finalise_standard_booking_invoice_atomic', {
    p_booking_id: adPayfBooking.id,
    p_customer_id: adPayfUser,
    p_vdo_reading: 2.0,
    p_rate_cents_per_hour: 33000,
    p_landing_charges: null,
    p_admin_notes: 'suite admin payf',
  })
  assertTruthy('admin PAYF billing RPC succeeds', !adPayfErr && adPayfRows?.[0], adPayfErr?.message)
  if (adPayfRows?.[0]) {
    assertEq('admin PAYF final status', adPayfRows[0].out_final_booking_status, 'payment_pending')
  }

  // ══ [6] Composition + regression source assertions ══
  console.log('\n[6] Source-level composition checks')
  const adminActions = fs.readFileSync('app/actions/admin-booking.ts', 'utf8')
  const adminSubmitBody = adminActions.slice(adminActions.indexOf('export async function adminSubmitFlightRecord'))
  assertTruthy(
    'adminSubmitFlightRecord uses shared submission core',
    adminSubmitBody.includes('createFlightRecordForBooking('),
  )
  assertTruthy(
    'adminSubmitFlightRecord reuses shared billing finalisation',
    adminSubmitBody.includes('finaliseStandardBookingInvoice({'),
  )
  const customerActions = fs.readFileSync('app/actions/booking.ts', 'utf8')
  assertTruthy(
    'customer submitFlightRecord uses the same core',
    customerActions.includes('createFlightRecordForBooking('),
  )
  assertTruthy(
    'overage is no longer auto-charged off-session',
    !adminActions.includes('block_time_overflow'),
  )
  assertTruthy(
    'booking gate installed in createBooking',
    customerActions.includes('getOutstandingOverageInvoices'),
  )
  const paymentActions = fs.readFileSync('app/actions/payment.ts', 'utf8')
  assertTruthy(
    'purchase/top-up gates installed',
    (paymentActions.match(/getOutstandingOverageInvoices\(/g) ?? []).length >= 2,
  )

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════')
  console.log(`${results.length} assertions, ${failures} failure(s)`)
}

main()
  .catch((err) => {
    failures += 1
    console.error(`\nSUITE ABORTED: ${err?.message ?? err}`)
  })
  .finally(async () => {
    stopDevServer()
    await cleanup()
    process.exit(failures > 0 ? 1 : 0)
  })
