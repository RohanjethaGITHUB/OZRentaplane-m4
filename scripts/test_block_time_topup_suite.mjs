// Block Time top-up test suite (task: top-up feature).
//
// Runs against the linked Supabase project with the service-role key, using
// disposable test users that are removed at the end. The webhook tests start
// a local Next.js dev server and POST real signed Stripe events at the actual
// /api/stripe/webhook route. The 10%-minimum boundary rules are tested against
// the compiled production module (lib/payments/block-time-topup.ts), the same
// code the server action and customer preview call.
//
// Prerequisites: migration 101_block_time_topups.sql applied (the suite
// verifies this first, along with 097/098 from the prior task).
//
// Usage: node scripts/test_block_time_topup_suite.mjs

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
if (!url || !key) throw new Error('Missing Supabase env')
if (!webhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET')

const admin = createClient(url, key)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2023-10-16' })

const PORT = 3034
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

function assertClose(name, actual, expected, eps = 0.01) {
  const ok = Math.abs(Number(actual) - Number(expected)) < eps
  record(name, ok, ok ? '' : `expected ≈${expected}, got ${actual}`)
  return ok
}

function assertTimeClose(name, actualIso, expectedMs, epsMs = 15_000) {
  const actualMs = new Date(actualIso).getTime()
  const ok = Math.abs(actualMs - expectedMs) < epsMs
  record(name, ok, ok ? '' : `expected ≈${new Date(expectedMs).toISOString()}, got ${actualIso}`)
  return ok
}

function assertTruthy(name, value, detail = '') {
  record(name, Boolean(value), Boolean(value) ? '' : detail || `got ${JSON.stringify(value)}`)
  return Boolean(value)
}

// ── Production rules module (compiled from TypeScript) ──────────────────────

function loadTopupRules() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-topup-rules-'))
  const compile = spawnSync(
    'npx',
    [
      'tsc',
      'lib/payments/block-time-topup.ts',
      '--outDir',
      outDir,
      '--module',
      'commonjs',
      '--target',
      'es2020',
      '--skipLibCheck',
    ],
    { encoding: 'utf8' },
  )
  if (compile.status !== 0) {
    throw new Error(`Failed to compile lib/payments/block-time-topup.ts: ${compile.stdout}\n${compile.stderr}`)
  }
  const require = createRequire(import.meta.url)
  return { rules: require(path.join(outDir, 'block-time-topup.js')), outDir }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const createdUserIds = []
const createdBookingIds = []
const createdPurchaseIds = []
const testEventIds = []

async function createTestUser(tag) {
  const email = `bt-topup-suite-${tag}-${ts}@example.com`
  const created = await admin.auth.admin.createUser({
    email,
    password: 'TestPass!23456',
    email_confirm: true,
    user_metadata: { full_name: `BT Topup Suite ${tag}` },
  })
  if (created.error) throw created.error
  const id = created.data.user.id
  createdUserIds.push(id)
  const { error: upErr } = await admin.from('profiles').upsert({
    id,
    email,
    role: 'customer',
    full_name: `BT Topup Suite ${tag}`,
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

// Rate can differ from the package's current catalogue rate — that's the
// whole point of the locked-rate tests.
async function createPendingPurchase(userId, pkg, paymentIntentId, ratePerHour) {
  const rate = ratePerHour ?? Number(pkg.rate_per_hour)
  const { data, error } = await admin
    .from('pilot_block_time_purchases')
    .insert({
      user_id: userId,
      package_id: pkg.id,
      hours_purchased: pkg.hours,
      hours_remaining: pkg.hours,
      rate_per_hour: rate,
      amount_paid: Math.round(Number(pkg.hours) * rate * 100) / 100,
      status: 'pending',
      purchased_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * DAY_MS).toISOString(),
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

async function getTopups(purchaseId) {
  const { data, error } = await admin
    .from('block_time_topups')
    .select('*')
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
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

function purchaseIntentObject(paymentIntentId, purchaseId, userId, pkg, ratePerHour) {
  const rate = ratePerHour ?? Number(pkg.rate_per_hour)
  const amountCents = Math.round(Number(pkg.hours) * rate * 100)
  return {
    id: paymentIntentId,
    object: 'payment_intent',
    amount: amountCents,
    amount_received: amountCents,
    currency: 'aud',
    payment_method: 'pm_test_blocktime_topup',
    metadata: {
      purchase_type: 'block_time',
      supabase_user_id: userId,
      purchase_id: purchaseId,
      package_id: pkg.id,
      package_name: pkg.name,
      hours_purchased: String(pkg.hours),
      rate_per_hour: String(rate),
      validity_days: String(pkg.validity_days),
    },
  }
}

function topupIntentObject(paymentIntentId, purchaseId, userId, pkg, hoursAdded, ratePerHour) {
  const amountCents = Math.round(hoursAdded * ratePerHour * 100)
  return {
    id: paymentIntentId,
    object: 'payment_intent',
    amount: amountCents,
    amount_received: amountCents,
    currency: 'aud',
    payment_method: 'pm_test_blocktime_topup',
    metadata: {
      purchase_type: 'block_time_topup',
      supabase_user_id: userId,
      purchase_id: purchaseId,
      package_id: pkg.id,
      package_name: pkg.name,
      hours_added: String(hoursAdded),
      rate_per_hour: String(ratePerHour),
    },
  }
}

async function activatePurchase(tagPrefix, purchaseId, userId, pkg, ratePerHour) {
  const pi = `pi_test_btt_${tagPrefix}_${ts}`
  const evt = `evt_test_btt_${tagPrefix}_${ts}`
  const res = await postSignedEvent(evt, purchaseIntentObject(pi, purchaseId, userId, pkg, ratePerHour))
  if (res.status !== 200) throw new Error(`activation webhook returned ${res.status}`)
  return getPurchase(purchaseId)
}

async function applyTopupRpc(purchaseId, hours, paymentIntentId) {
  return admin.rpc('apply_block_time_topup', {
    p_purchase_id: purchaseId,
    p_hours: hours,
    p_stripe_payment_intent_id: paymentIntentId,
  })
}

// ── Dev server management ────────────────────────────────────────────────────

let devServer = null

async function startDevServer() {
  console.log(`\nStarting Next.js dev server on port ${PORT}…`)
  devServer = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // Blank RESEND_API_KEY so the webhook's confirmation emails are skipped.
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
  const { error: topupTableErr } = await admin.from('block_time_topups').select('id').limit(1)
  if (topupTableErr) {
    throw new Error(
      `block_time_topups table missing or unreadable (${topupTableErr.message}). Apply supabase/migrations/101_block_time_topups.sql first.`,
    )
  }

  const { error: fnErr } = await admin.rpc('apply_block_time_topup', {
    p_purchase_id: '00000000-0000-0000-0000-000000000000',
    p_hours: 1,
    p_stripe_payment_intent_id: 'pi_preflight_probe',
  })
  if (fnErr && /could not find the function/i.test(fnErr.message)) {
    throw new Error('apply_block_time_topup missing. Apply supabase/migrations/101_block_time_topups.sql first.')
  }
  // Any other error (e.g. "not found") proves the function exists.

  const { error: dedupeTableErr } = await admin.from('stripe_webhook_events').select('event_id').limit(1)
  if (dedupeTableErr) {
    throw new Error(
      `stripe_webhook_events table missing (${dedupeTableErr.message}). Apply supabase/migrations/098_stripe_webhook_events.sql first.`,
    )
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\nCleaning up test data…')
  const steps = [
    async () => {
      if (createdUserIds.length > 0) {
        await admin.from('pilot_block_time_usage').delete().in('user_id', createdUserIds)
        await admin.from('block_time_topups').delete().in('user_id', createdUserIds)
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
  console.log('Preflight OK — migrations 098/101 are applied.')

  const { rules } = loadTopupRules()

  const { data: pkg, error: pkgErr } = await admin
    .from('block_time_packages')
    .select('id, name, hours, rate_per_hour, total_price, validity_days')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1)
    .single()
  if (pkgErr || !pkg) throw new Error(`No active block time package found: ${pkgErr?.message}`)
  const H = Number(pkg.hours)
  const CATALOGUE_RATE = Number(pkg.rate_per_hour)
  const VALIDITY = Number(pkg.validity_days)
  const EXT_DAYS = Math.ceil(VALIDITY / 2)
  const MIN_HOURS = Math.round(H * 10) / 100
  if (H < 5) throw new Error(`Smallest package has ${H}h; suite assumes at least 5h`)
  console.log(
    `Using package "${pkg.name}" (${H}h at $${CATALOGUE_RATE}/hr, ${VALIDITY}d validity → +${EXT_DAYS}d per top-up, min ${MIN_HOURS}h).`,
  )

  const { data: aircraft, error: acErr } = await admin
    .from('aircraft')
    .select('id, registration')
    .limit(1)
    .single()
  if (acErr || !aircraft) throw new Error(`No aircraft found: ${acErr?.message}`)

  // ════ Group 1: 10% minimum boundary (production rules module) ══════════════
  console.log('\n[1] Minimum boundary rules (compiled production module)')
  {
    assertClose('minimum is 10% of purchased hours', rules.blockTimeTopupMinimumHours(H), MIN_HOURS)
    assertEq('extension is half the validity, rounded up', rules.blockTimeTopupExtensionDays(VALIDITY), EXT_DAYS)
    assertEq('odd validity rounds up (45d → 23d)', rules.blockTimeTopupExtensionDays(45), 23)

    const below = rules.validateBlockTimeTopupHours(MIN_HOURS - 0.01, H)
    assertEq('just below minimum rejected', below.ok, false)
    assertTruthy('rejection explains the minimum', /minimum top-up/i.test(below.reason ?? ''), below.reason)

    const atMin = rules.validateBlockTimeTopupHours(MIN_HOURS, H)
    assertEq('exactly at minimum accepted', atMin.ok, true)
    assertClose('accepted hours normalised', atMin.hours, MIN_HOURS)

    const above = rules.validateBlockTimeTopupHours(MIN_HOURS + 4.25, H)
    assertEq('above minimum accepted', above.ok, true)

    const invalid = rules.validateBlockTimeTopupHours(Number.NaN, H)
    assertEq('non-numeric hours rejected', invalid.ok, false)
    const zero = rules.validateBlockTimeTopupHours(0, H)
    assertEq('zero hours rejected', zero.ok, false)
  }

  await startDevServer()

  // ════ Group 2: top-up applied via webhook — locked rate, hours, expiry ═════
  console.log('\n[2] Webhook top-up: locked rate + hours/expiry math')
  const LOCKED_RATE = 250 // deliberately different from the catalogue rate
  const userA = await createTestUser('math')
  const purchaseA = await createPendingPurchase(userA, pkg, `pi_test_btt_a0_${ts}`, LOCKED_RATE)
  const activatedA = await activatePurchase('a0', purchaseA, userA, pkg, LOCKED_RATE)
  assertEq('setup: purchase active', activatedA.status, 'active')
  assertTruthy(
    'setup: locked rate differs from catalogue rate',
    LOCKED_RATE !== CATALOGUE_RATE,
    `both are ${LOCKED_RATE}`,
  )
  const expiryBeforeTopup = new Date(activatedA.expires_at).getTime()

  const piTopup1 = `pi_test_btt_a1_${ts}`
  const evtTopup1 = `evt_test_btt_a1_${ts}`
  {
    const res = await postSignedEvent(
      evtTopup1,
      topupIntentObject(piTopup1, purchaseA, userA, pkg, MIN_HOURS, LOCKED_RATE),
    )
    assertEq('top-up webhook returns 200', res.status, 200)

    const p = await getPurchase(purchaseA)
    assertEq('purchase still active', p.status, 'active')
    assertClose('hours_purchased extended', p.hours_purchased, H + MIN_HOURS)
    assertClose('hours_remaining extended', p.hours_remaining, H + MIN_HOURS)
    assertClose(
      'amount_paid recomputed at the locked rate',
      p.amount_paid,
      Math.round((H + MIN_HOURS) * LOCKED_RATE * 100) / 100,
    )
    assertTimeClose('expiry extended by half validity from current expiry', p.expires_at, expiryBeforeTopup + EXT_DAYS * DAY_MS)

    const topups = await getTopups(purchaseA)
    assertEq('one top-up history row', topups.length, 1)
    const t = topups[0]
    assertClose('history: hours added', t?.hours_added, MIN_HOURS)
    assertClose('history: locked rate used, not catalogue rate', t?.rate_per_hour, LOCKED_RATE)
    assertClose('history: amount = hours × locked rate', t?.amount_paid, Math.round(MIN_HOURS * LOCKED_RATE * 100) / 100)
    assertEq('history: validity extension days', Number(t?.validity_extension_days), EXT_DAYS)
    assertClose('history: balance before', t?.hours_remaining_before, H)
    assertClose('history: balance after', t?.hours_remaining_after, H + MIN_HOURS)
    assertEq('history: stripe payment intent recorded', t?.stripe_payment_intent_id, piTopup1)

    const { data: topupInvoices } = await admin
      .from('invoices')
      .select('id, status, type, total, stripe_payment_intent_id')
      .eq('stripe_payment_intent_id', piTopup1)
      .eq('type', 'block_time_topup')
    assertEq('exactly one top-up invoice', topupInvoices?.length, 1)
    assertEq('top-up invoice paid', topupInvoices?.[0]?.status, 'paid')
    assertClose('top-up invoice total = charge', topupInvoices?.[0]?.total, Math.round(MIN_HOURS * LOCKED_RATE * 100) / 100)
    assertEq('history row linked to invoice', t?.invoice_id, topupInvoices?.[0]?.id)

    const { data: lineItems } = await admin
      .from('invoice_line_items')
      .select('type, quantity, unit_price, amount')
      .eq('invoice_id', topupInvoices?.[0]?.id ?? '00000000-0000-0000-0000-000000000000')
    assertEq('one invoice line item', lineItems?.length, 1)
    assertClose('line item priced at locked rate', lineItems?.[0]?.unit_price, LOCKED_RATE)
    assertClose('line item quantity = hours added', lineItems?.[0]?.quantity, MIN_HOURS)

    const { data: purchaseInvoices } = await admin
      .from('invoices')
      .select('id')
      .eq('block_time_purchase_id', purchaseA)
      .eq('type', 'block_time_purchase')
    assertEq('original purchase invoice untouched (still one)', purchaseInvoices?.length, 1)
  }

  // Second, larger top-up on the same package (above minimum), stacking math.
  {
    const hours2 = 3.5
    const pi2 = `pi_test_btt_a2_${ts}`
    const evt2 = `evt_test_btt_a2_${ts}`
    const before = await getPurchase(purchaseA)
    const expiryBefore2 = new Date(before.expires_at).getTime()
    const res = await postSignedEvent(evt2, topupIntentObject(pi2, purchaseA, userA, pkg, hours2, LOCKED_RATE))
    assertEq('second top-up webhook returns 200', res.status, 200)
    const p = await getPurchase(purchaseA)
    assertClose('hours stack across top-ups', p.hours_remaining, H + MIN_HOURS + hours2)
    assertTimeClose('expiry extension stacks from previous expiry', p.expires_at, expiryBefore2 + EXT_DAYS * DAY_MS)
    const topups = await getTopups(purchaseA)
    assertEq('two top-up history rows', topups.length, 2)

    // The minimum for the next top-up now grows with hours_purchased.
    const grownMin = rules.blockTimeTopupMinimumHours(Number(p.hours_purchased))
    assertClose('minimum grows with the extended package', grownMin, Math.round((H + MIN_HOURS + hours2) * 10) / 100)
    const belowGrown = rules.validateBlockTimeTopupHours(MIN_HOURS, Number(p.hours_purchased))
    assertEq('old minimum no longer accepted after growth', belowGrown.ok, false)
  }

  // ════ Group 3: duplicate delivery (dedupe + payment-intent idempotency) ════
  console.log('\n[3] Webhook double-fire on a top-up')
  {
    const before = await getPurchase(purchaseA)
    const res = await postSignedEvent(
      evtTopup1,
      topupIntentObject(piTopup1, purchaseA, userA, pkg, MIN_HOURS, LOCKED_RATE),
    )
    assertEq('duplicate event returns 200', res.status, 200)
    assertEq('duplicate flagged as deduped', res.body?.deduped, true)
    const p = await getPurchase(purchaseA)
    assertClose('balance unchanged by duplicate event', p.hours_remaining, Number(before.hours_remaining))
    assertEq('expiry unchanged by duplicate event', p.expires_at, before.expires_at)
    const topups = await getTopups(purchaseA)
    assertEq('no extra history row from duplicate event', topups.length, 2)
  }

  {
    // Same payment intent arriving under a NEW event id (dedupe can't catch
    // it) must hit the RPC's idempotency and change nothing.
    const before = await getPurchase(purchaseA)
    const evtReplay = `evt_test_btt_a1_replay_${ts}`
    const res = await postSignedEvent(
      evtReplay,
      topupIntentObject(piTopup1, purchaseA, userA, pkg, MIN_HOURS, LOCKED_RATE),
    )
    assertEq('replayed payment intent returns 200', res.status, 200)
    const p = await getPurchase(purchaseA)
    assertClose('balance unchanged by replayed payment intent', p.hours_remaining, Number(before.hours_remaining))
    assertEq('expiry unchanged by replayed payment intent', p.expires_at, before.expires_at)
    const topups = await getTopups(purchaseA)
    assertEq('still two history rows after replay', topups.length, 2)
    const { data: topupInvoices } = await admin
      .from('invoices')
      .select('id')
      .eq('stripe_payment_intent_id', piTopup1)
      .eq('type', 'block_time_topup')
    assertEq('still one invoice for the replayed payment', topupInvoices?.length, 1)
  }

  // ════ Group 4: concurrent top-ups (row locking) ════════════════════════════
  console.log('\n[4] Concurrent top-ups against one package')
  const userB = await createTestUser('concurrency')
  const purchaseB = await createPendingPurchase(userB, pkg, `pi_test_btt_b0_${ts}`)
  const activatedB = await activatePurchase('b0', purchaseB, userB, pkg)
  assertEq('setup: purchase active', activatedB.status, 'active')
  {
    const expiryBefore = new Date(activatedB.expires_at).getTime()
    const [r1, r2] = await Promise.all([
      applyTopupRpc(purchaseB, 2, `pi_test_btt_b1_${ts}`),
      applyTopupRpc(purchaseB, 3, `pi_test_btt_b2_${ts}`),
    ])
    assertTruthy('both concurrent top-ups succeed', !r1.error && !r2.error, r1.error?.message ?? r2.error?.message)
    const p = await getPurchase(purchaseB)
    assertClose('no lost update: balance reflects both top-ups', p.hours_remaining, H + 5)
    assertClose('hours_purchased reflects both top-ups', p.hours_purchased, H + 5)
    assertTimeClose('expiry extended twice', p.expires_at, expiryBefore + 2 * EXT_DAYS * DAY_MS)

    const topups = await getTopups(purchaseB)
    assertEq('two history rows', topups.length, 2)
    const sorted = [...topups].sort((a, b) => Number(a.hours_remaining_before) - Number(b.hours_remaining_before))
    const chained =
      sorted.length === 2 &&
      Math.abs(Number(sorted[0].hours_remaining_before) - H) < 0.01 &&
      Math.abs(Number(sorted[0].hours_remaining_after) - (H + Number(sorted[0].hours_added))) < 0.01 &&
      Math.abs(Number(sorted[1].hours_remaining_before) - Number(sorted[0].hours_remaining_after)) < 0.01 &&
      Math.abs(Number(sorted[1].hours_remaining_after) - (H + 5)) < 0.01
    assertTruthy('history rows chain without overlap (serialised by row lock)', chained, JSON.stringify(sorted))
  }

  // ════ Group 5: guards — non-active packages ════════════════════════════════
  console.log('\n[5] Status guards')
  {
    // Pending (never paid) package cannot be topped up.
    const pendingPurchase = await createPendingPurchase(userB, pkg, `pi_test_btt_b3_${ts}`)
    const { error } = await applyTopupRpc(pendingPurchase, 2, `pi_test_btt_b4_${ts}`)
    assertTruthy(
      'top-up refused on pending package',
      error && /only active packages/i.test(error.message),
      error?.message ?? 'top-up unexpectedly applied',
    )
  }

  {
    // Exhausted-in-transit: balance flown to zero while the top-up payment
    // was processing — the top-up still lands and revives the package.
    const userC = await createTestUser('exhausted')
    const purchaseC = await createPendingPurchase(userC, pkg, `pi_test_btt_c0_${ts}`)
    await activatePurchase('c0', purchaseC, userC, pkg)
    const bookingC = await createBooking(userC, aircraft.id, 24)
    const { error: ddErr } = await admin.rpc('process_block_time_flight', {
      p_user_id: userC,
      p_booking_id: bookingC,
      p_vdo_hours: H,
      p_landing_fees: 0,
    })
    assertTruthy('setup: drawdown to zero succeeds', !ddErr, ddErr?.message)
    let p = await getPurchase(purchaseC)
    assertEq('setup: package exhausted', p.status, 'exhausted')

    const { error: topupErr } = await applyTopupRpc(purchaseC, 2, `pi_test_btt_c1_${ts}`)
    assertTruthy('top-up applies to exhausted-in-transit package', !topupErr, topupErr?.message)
    p = await getPurchase(purchaseC)
    assertEq('package revived to active', p.status, 'active')
    assertClose('revived balance is the topped-up hours', p.hours_remaining, 2)
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
