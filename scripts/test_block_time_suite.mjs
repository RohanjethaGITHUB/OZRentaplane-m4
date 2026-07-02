// Block Time billing test suite (task: dashboard, refunds, webhook dedupe).
//
// Runs against the linked Supabase project with the service-role key, using
// disposable test users that are removed at the end. The webhook tests start
// a local Next.js dev server and POST real signed Stripe events at the actual
// /api/stripe/webhook route.
//
// Prerequisites: migrations 097_block_time_refund.sql and
// 098_stripe_webhook_events.sql applied (the suite verifies this first).
//
// Usage: node scripts/test_block_time_suite.mjs

import fs from 'fs'
import { spawn } from 'child_process'
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
if (!url || !key) throw new Error('Missing Supabase env')
if (!webhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET')

const admin = createClient(url, key)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2023-10-16' })

const PORT = 3033
const BASE = `http://localhost:${PORT}`
const ts = Date.now()

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

function assertClose(name, actual, expected, eps = 0.01) {
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

async function createTestUser(tag) {
  const email = `block-time-suite-${tag}-${ts}@example.com`
  const created = await admin.auth.admin.createUser({
    email,
    password: 'TestPass!23456',
    email_confirm: true,
    user_metadata: { full_name: `Block Time Suite ${tag}` },
  })
  if (created.error) throw created.error
  const id = created.data.user.id
  createdUserIds.push(id)
  const { error: upErr } = await admin.from('profiles').upsert({
    id,
    email,
    role: 'customer',
    full_name: `Block Time Suite ${tag}`,
    pilot_clearance_status: 'cleared_to_fly',
    account_status: 'active',
  })
  if (upErr) throw upErr
  return id
}

async function createBooking(userId, aircraftId, offsetHours) {
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
      status: 'pending_post_flight_review',
      pic_name: 'Test Pilot',
    })
    .select('id')
    .single()
  if (error) throw error
  createdBookingIds.push(data.id)
  return data.id
}

async function createPendingPurchase(userId, pkg, paymentIntentId) {
  const { data, error } = await admin
    .from('pilot_block_time_purchases')
    .insert({
      user_id: userId,
      package_id: pkg.id,
      hours_purchased: pkg.hours,
      hours_remaining: pkg.hours,
      rate_per_hour: pkg.rate_per_hour,
      amount_paid: pkg.total_price,
      status: 'pending',
      purchased_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 86400_000).toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    })
    .select('id')
    .single()
  if (error) throw error
  createdPurchaseIds.push(data.id)
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

async function postWebhookEvent(eventId, paymentIntentId, purchaseId, userId, pkg) {
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
    data: {
      object: {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: Math.round(Number(pkg.total_price) * 100),
        amount_received: Math.round(Number(pkg.total_price) * 100),
        currency: 'aud',
        payment_method: 'pm_test_blocktime',
        metadata: {
          purchase_type: 'block_time',
          supabase_user_id: userId,
          purchase_id: purchaseId,
          package_id: pkg.id,
          package_name: pkg.name,
          hours_purchased: String(pkg.hours),
          rate_per_hour: String(pkg.rate_per_hour),
          validity_days: String(pkg.validity_days),
        },
      },
    },
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

async function drawdown(userId, bookingId, vdoHours, landingFees) {
  return admin.rpc('process_block_time_flight', {
    p_user_id: userId,
    p_booking_id: bookingId,
    p_vdo_hours: vdoHours,
    p_landing_fees: landingFees,
  })
}

// ── Dev server management ────────────────────────────────────────────────────

let devServer = null

async function startDevServer() {
  console.log(`\nStarting Next.js dev server on port ${PORT}…`)
  devServer = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // Blank RESEND_API_KEY so the webhook's confirmation emails are skipped
    // (sendEmail treats a missing key as "skip"); Next keeps existing env
    // vars over .env.local values.
    env: { ...process.env, RESEND_API_KEY: '' },
  })
  devServer.stdout.on('data', () => {})
  devServer.stderr.on('data', () => {})

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/stripe/webhook`, { method: 'GET' })
      // Any HTTP response (even 405) means the route module compiled.
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
  const { error: tableErr } = await admin.from('stripe_webhook_events').select('event_id').limit(1)
  if (tableErr) {
    throw new Error(
      `stripe_webhook_events table missing or unreadable (${tableErr.message}). Apply supabase/migrations/098_stripe_webhook_events.sql first.`,
    )
  }

  const { error: fnErr } = await admin.rpc('begin_block_time_refund', {
    p_purchase_id: '00000000-0000-0000-0000-000000000000',
  })
  if (fnErr && /could not find the function/i.test(fnErr.message)) {
    throw new Error('begin_block_time_refund missing. Apply supabase/migrations/097_block_time_refund.sql first.')
  }
  // Any other error (e.g. "not found") proves the function exists.
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\nCleaning up test data…')
  const steps = [
    async () => {
      if (createdUserIds.length > 0) {
        await admin.from('pilot_block_time_usage').delete().in('user_id', createdUserIds)
        await admin.from('invoices').delete().in('user_id', createdUserIds)
        await admin.from('verification_events').delete().in('user_id', createdUserIds)
      }
    },
    async () => {
      if (createdPurchaseIds.length > 0) {
        await admin.from('email_events').delete().in('entity_id', createdPurchaseIds)
        await admin.from('pilot_block_time_purchases').delete().in('id', createdPurchaseIds)
      }
    },
    async () => {
      if (createdBookingIds.length > 0) {
        await admin.from('booking_status_history').delete().in('booking_id', createdBookingIds)
        await admin.from('bookings').delete().in('id', createdBookingIds)
      }
    },
    async () => {
      if (testEventIds.length > 0) {
        await admin.from('stripe_webhook_events').delete().in('event_id', testEventIds)
      }
    },
    async () => {
      for (const id of createdUserIds) {
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) console.warn(`  cleanup: could not delete user ${id}: ${error.message}`)
      }
    },
  ]
  for (const step of steps) {
    try {
      await step()
    } catch (err) {
      console.warn(`  cleanup step failed: ${err?.message ?? err}`)
    }
  }
}

// ── Test groups ──────────────────────────────────────────────────────────────

async function main() {
  await preflight()
  console.log('Preflight OK — migrations 097/098 are applied.')

  const { data: pkg, error: pkgErr } = await admin
    .from('block_time_packages')
    .select('id, name, hours, rate_per_hour, total_price, validity_days')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1)
    .single()
  if (pkgErr || !pkg) throw new Error(`No active block time package found: ${pkgErr?.message}`)
  const H = Number(pkg.hours)
  const R = Number(pkg.rate_per_hour)
  if (H < 5) throw new Error(`Smallest package has ${H}h; suite assumes at least 5h`)
  console.log(`Using package "${pkg.name}" (${H}h at $${R}/hr) for all tests.`)

  const { data: aircraft, error: acErr } = await admin
    .from('aircraft')
    .select('id, registration')
    .limit(1)
    .single()
  if (acErr || !aircraft) throw new Error(`No aircraft found: ${acErr?.message}`)

  await startDevServer()

  // ════ Group 1: purchase → payment → active → drawdown → exhaustion ════════
  console.log('\n[1] Full purchase lifecycle')
  const userA = await createTestUser('lifecycle')
  const piA = `pi_test_bts_a_${ts}`
  const evtA = `evt_test_bts_a_${ts}`
  const purchaseA = await createPendingPurchase(userA, pkg, piA)

  // Pending visibility (dashboard page query shape)
  {
    const { data: pendingRows } = await admin
      .from('pilot_block_time_purchases')
      .select('id, status, package:block_time_packages ( name )')
      .eq('user_id', userA)
      .eq('status', 'pending')
    assertEq('pending purchase visible via dashboard query', pendingRows?.length, 1)
  }

  {
    const res = await postWebhookEvent(evtA, piA, purchaseA, userA, pkg)
    assertEq('webhook (payment) returns 200', res.status, 200)
    const p = await getPurchase(purchaseA)
    assertEq('purchase activated', p.status, 'active')
    assertClose('full hours available', p.hours_remaining, H)
    assertTruthy('activated_at set', p.activated_at)
    const { data: invoices } = await admin
      .from('invoices')
      .select('id, status, type')
      .eq('block_time_purchase_id', purchaseA)
    assertEq('exactly one purchase invoice', invoices?.length, 1)
    assertEq('purchase invoice paid', invoices?.[0]?.status, 'paid')
    const { data: evRow } = await admin
      .from('stripe_webhook_events')
      .select('event_id')
      .eq('event_id', evtA)
      .maybeSingle()
    assertTruthy('event id recorded in stripe_webhook_events', evRow)
  }

  const bookingA1 = await createBooking(userA, aircraft.id, 24)
  {
    const d1 = 3.5
    const { data, error } = await drawdown(userA, bookingA1, d1, 57.9)
    assertTruthy('drawdown succeeds', !error, error?.message)
    const row = data?.[0]
    assertClose('hours_after after first flight', row?.out_hours_after, H - d1)
    assertEq('no overflow on first flight', Number(row?.out_overflow_hours), 0)
    const { data: usage } = await admin
      .from('pilot_block_time_usage')
      .select('hours_deducted, hours_before, hours_after')
      .eq('booking_id', bookingA1)
    assertEq('usage record written', usage?.length, 1)
    assertClose('usage hours_before', usage?.[0]?.hours_before, H)
    const p = await getPurchase(purchaseA)
    assertEq('purchase still active after partial use', p.status, 'active')
  }

  const bookingA2 = await createBooking(userA, aircraft.id, 48)
  {
    const remaining = H - 3.5
    const d2 = remaining + 1.5 // overshoot to force overflow + exhaustion
    const { data, error } = await drawdown(userA, bookingA2, d2, 0)
    assertTruthy('exhausting drawdown succeeds', !error, error?.message)
    const row = data?.[0]
    assertClose('overflow hours computed', row?.out_overflow_hours, 1.5)
    assertClose('overflow amount at block rate', row?.out_overflow_amount, Math.round(1.5 * R * 100) / 100)
    assertEq('needs overflow charge flag', row?.out_needs_overflow_charge, true)
    const p = await getPurchase(purchaseA)
    assertEq('package exhausted at zero hours', p.status, 'exhausted')
    assertClose('zero hours remaining', p.hours_remaining, 0)
  }

  // ════ Group 2: webhook fired twice (Stripe retry) ══════════════════════════
  console.log('\n[2] Webhook duplicate delivery (same event id)')
  {
    const res = await postWebhookEvent(evtA, piA, purchaseA, userA, pkg)
    assertEq('duplicate webhook returns 200', res.status, 200)
    assertEq('duplicate flagged as deduped', res.body?.deduped, true)
    // Flight invoices from drawdowns also reference the purchase, so count
    // only purchase invoices here.
    const { data: invoices } = await admin
      .from('invoices')
      .select('id')
      .eq('block_time_purchase_id', purchaseA)
      .eq('type', 'block_time_purchase')
    assertEq('still exactly one purchase invoice', invoices?.length, 1)
    const p = await getPurchase(purchaseA)
    // Without event-id dedupe, the retry would reset hours_remaining to the
    // full package and flip the purchase back to active, wiping the drawdown.
    assertEq('exhausted status not clobbered by retry', p.status, 'exhausted')
    assertClose('drawn-down balance not reset by retry', p.hours_remaining, 0)
  }

  // ════ Group 3: refunds ═════════════════════════════════════════════════════
  console.log('\n[3] Refund workflow')
  const userB = await createTestUser('refund')
  const piB1 = `pi_test_bts_b1_${ts}`
  const evtB1 = `evt_test_bts_b1_${ts}`
  const purchaseB1 = await createPendingPurchase(userB, pkg, piB1)
  await postWebhookEvent(evtB1, piB1, purchaseB1, userB, pkg)

  {
    const { data, error } = await admin.rpc('begin_block_time_refund', { p_purchase_id: purchaseB1 })
    assertTruthy('refund begins on untouched package', !error, error?.message)
    assertEq('begin returns payment intent', data?.[0]?.out_stripe_payment_intent_id, piB1)
    const p = await getPurchase(purchaseB1)
    assertEq('purchase marked refunded', p.status, 'refunded')
    assertClose('refund amount = amount paid', p.refund_amount, Number(pkg.total_price))
  }

  {
    // Refunded package must be invisible to drawdown.
    const bookingB0 = await createBooking(userB, aircraft.id, 24)
    const { error } = await drawdown(userB, bookingB0, 1, 0)
    assertTruthy(
      'drawdown blocked while package refunded',
      error && /no active block time package/i.test(error.message),
      error?.message ?? 'drawdown unexpectedly succeeded',
    )
  }

  {
    // Simulate a failed Stripe refund: revert, then redo and finalise.
    const { error: revertErr } = await admin.rpc('revert_block_time_refund', { p_purchase_id: purchaseB1 })
    assertTruthy('revert restores package', !revertErr, revertErr?.message)
    let p = await getPurchase(purchaseB1)
    assertEq('purchase active again after revert', p.status, 'active')
    assertEq('refund fields cleared on revert', p.refunded_at, null)

    const { error: begin2Err } = await admin.rpc('begin_block_time_refund', { p_purchase_id: purchaseB1 })
    assertTruthy('refund can be re-begun after revert', !begin2Err, begin2Err?.message)
    const { error: finErr } = await admin.rpc('finalise_block_time_refund', {
      p_purchase_id: purchaseB1,
      p_refund_stripe_id: `re_test_bts_${ts}`,
    })
    assertTruthy('finalise succeeds', !finErr, finErr?.message)
    p = await getPurchase(purchaseB1)
    assertEq('stripe refund id recorded', p.refund_stripe_id, `re_test_bts_${ts}`)
    const { data: inv } = await admin
      .from('invoices')
      .select('status')
      .eq('block_time_purchase_id', purchaseB1)
      .eq('type', 'block_time_purchase')
      .single()
    assertEq('purchase invoice marked refunded', inv?.status, 'refunded')

    const { error: revertAfterErr } = await admin.rpc('revert_block_time_refund', { p_purchase_id: purchaseB1 })
    assertTruthy(
      'revert refused once money has moved',
      revertAfterErr && /not in a revertable/i.test(revertAfterErr.message),
      revertAfterErr?.message ?? 'revert unexpectedly succeeded',
    )
  }

  {
    // Partially-consumed package: refund must be refused.
    const piB2 = `pi_test_bts_b2_${ts}`
    const evtB2 = `evt_test_bts_b2_${ts}`
    const purchaseB2 = await createPendingPurchase(userB, pkg, piB2)
    await postWebhookEvent(evtB2, piB2, purchaseB2, userB, pkg)
    const bookingB1 = await createBooking(userB, aircraft.id, 48)
    const { error: ddErr } = await drawdown(userB, bookingB1, 2, 0)
    assertTruthy('setup drawdown on refund-test package', !ddErr, ddErr?.message)
    const { error } = await admin.rpc('begin_block_time_refund', { p_purchase_id: purchaseB2 })
    assertTruthy(
      'refund refused for partially-consumed package',
      error && /partially used/i.test(error.message),
      error?.message ?? 'refund unexpectedly allowed',
    )
    const p = await getPurchase(purchaseB2)
    assertEq('partially-used package still active', p.status, 'active')
  }

  // ════ Group 4: concurrent drawdown ═════════════════════════════════════════
  console.log('\n[4] Concurrent bookings against one balance')
  const userC = await createTestUser('concurrency')
  const piC = `pi_test_bts_c_${ts}`
  const evtC = `evt_test_bts_c_${ts}`
  const purchaseC = await createPendingPurchase(userC, pkg, piC)
  await postWebhookEvent(evtC, piC, purchaseC, userC, pkg)

  {
    const bookingC1 = await createBooking(userC, aircraft.id, 24)
    const bookingC2 = await createBooking(userC, aircraft.id, 48)
    const [r1, r2] = await Promise.all([
      drawdown(userC, bookingC1, 2, 0),
      drawdown(userC, bookingC2, 2, 0),
    ])
    assertTruthy('both concurrent drawdowns succeed', !r1.error && !r2.error, r1.error?.message ?? r2.error?.message)
    const p = await getPurchase(purchaseC)
    assertClose('no lost update: balance reflects both flights', p.hours_remaining, H - 4)
    const { data: usage } = await admin
      .from('pilot_block_time_usage')
      .select('hours_before, hours_after')
      .eq('purchase_id', purchaseC)
      .order('hours_before', { ascending: false })
    assertEq('two usage records', usage?.length, 2)
    const chained =
      usage?.length === 2 &&
      Math.abs(Number(usage[0].hours_before) - H) < 0.01 &&
      Math.abs(Number(usage[0].hours_after) - (H - 2)) < 0.01 &&
      Math.abs(Number(usage[1].hours_before) - (H - 2)) < 0.01 &&
      Math.abs(Number(usage[1].hours_after) - (H - 4)) < 0.01
    assertTruthy('usage records chain without overlap (serialised by row lock)', chained,
      `got ${JSON.stringify(usage)}`)
  }

  // ════ Group 5: pending purchase visibility (fresh row) ═════════════════════
  console.log('\n[5] Pending purchase visibility')
  {
    const piD = `pi_test_bts_d_${ts}`
    const purchaseD = await createPendingPurchase(userC, pkg, piD)
    const { data: pendingRows } = await admin
      .from('pilot_block_time_purchases')
      .select('id, status, hours_purchased, amount_paid, purchased_at, package:block_time_packages ( name )')
      .eq('user_id', userC)
      .eq('status', 'pending')
    assertEq('new pending purchase returned by dashboard query', pendingRows?.length, 1)
    assertEq('pending row is the created one', pendingRows?.[0]?.id, purchaseD)
    const pkgName = Array.isArray(pendingRows?.[0]?.package)
      ? pendingRows?.[0]?.package[0]?.name
      : pendingRows?.[0]?.package?.name
    assertEq('pending row carries package name for display', pkgName, pkg.name)
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════')
  console.log(`${results.length} assertions, ${failures} failure(s)`)
  if (failures > 0) {
    for (const r of results.filter((r) => !r.ok)) console.log(`  FAILED: ${r.name} — ${r.detail}`)
  }
}

let exitCode = 0
try {
  await main()
  exitCode = failures > 0 ? 1 : 0
} catch (err) {
  console.error(`\nSuite aborted: ${err?.message ?? err}`)
  exitCode = 2
} finally {
  stopDevServer()
  await cleanup()
}
process.exit(exitCode)
