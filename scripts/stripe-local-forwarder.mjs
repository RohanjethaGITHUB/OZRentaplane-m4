#!/usr/bin/env node
/**
 * Local Stripe webhook forwarder — a stand-in for `stripe listen` when the
 * Stripe CLI cannot run (e.g. blocked by Windows Application Control).
 *
 *   npm run stripe:listen
 *
 * How it works: polls the Stripe API (TEST mode key from .env.local) for new
 * events every 2 seconds and POSTs each one to the local webhook route, signed
 * with STRIPE_WEBHOOK_SECRET exactly like Stripe would. The webhook route
 * therefore runs its normal signature check and code path.
 *
 * Only events created after the forwarder starts are sent. Refuses live keys.
 *
 * Env (.env.local): STRIPE_SECRET_KEY (sk_test_…), STRIPE_WEBHOOK_SECRET (whsec_…)
 * Optional: WEBHOOK_FORWARD_URL (default http://localhost:3000/api/stripe/webhook)
 */
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
const secret = process.env.STRIPE_WEBHOOK_SECRET
const target = process.env.WEBHOOK_FORWARD_URL || 'http://localhost:3000/api/stripe/webhook'
const POLL_MS = 2000

if (!key || !secret) {
  console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET in .env.local')
  process.exit(1)
}
if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
  console.error('Refusing to run: STRIPE_SECRET_KEY is not a TEST mode key.')
  process.exit(1)
}

const stripe = new Stripe(key)
const seen = new Set()
// Start a few seconds back so a payment finished just before launch is not missed.
let since = Math.floor(Date.now() / 1000) - 5

const time = () => new Date().toLocaleTimeString('en-AU', { hour12: false })

async function forward(event) {
  const payload = JSON.stringify(event)
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body: payload,
    })
    const text = (await res.text()).slice(0, 160).replace(/\s+/g, ' ')
    const mark = res.ok ? '✓' : '✗'
    console.log(`${time()}  ${mark} ${res.status}  ${event.type.padEnd(34)} ${event.id}${res.ok ? '' : `  ${text}`}`)
  } catch (err) {
    console.log(`${time()}  ✗ ---  ${event.type.padEnd(34)} ${event.id}  (${err.message} — is "npm run dev" running?)`)
  }
}

async function poll() {
  try {
    const fresh = []
    // auto-paginate newest→oldest; collect unseen, then send oldest first
    for await (const event of stripe.events.list({ created: { gte: since }, limit: 100 })) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      fresh.push(event)
    }
    fresh.sort((a, b) => a.created - b.created)
    for (const event of fresh) await forward(event)
    if (fresh.length) since = Math.max(since, fresh[fresh.length - 1].created - 5)
  } catch (err) {
    console.error(`${time()}  poll error: ${err.message}`)
  } finally {
    setTimeout(poll, POLL_MS)
  }
}

console.log(`Stripe test-mode forwarder → ${target}`)
console.log('Waiting for events… (Ctrl+C to stop)\n')
poll()
