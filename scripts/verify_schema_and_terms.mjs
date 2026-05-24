/**
 * verify_schema_and_terms.mjs
 *
 * Targeted verification script:
 *  1. Schema check — booking_terms_acceptances.acceptance_context
 *  2. Sample of acceptance_context = 'booking_readiness' records
 *  3. Cleanup dry-run for known old test user
 *  4. Active terms document status
 *
 * Usage:
 *   node scripts/verify_schema_and_terms.mjs
 */

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase env vars')

const admin = createClient(url, key)

function section(title) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

async function main() {
  // ── 1. Schema check via PostgREST introspection ──────────────────────────
  section('1. Schema check: booking_terms_acceptances.acceptance_context')

  // Try inserting a probe row with acceptance_context to confirm column is live.
  // We query information_schema via a raw RPC if available, otherwise probe via insert attempt.
  // Since we can't run arbitrary SQL via the JS client, we probe by selecting the column.
  const { data: probe, error: probeErr } = await admin
    .from('booking_terms_acceptances')
    .select('acceptance_context')
    .limit(1)

  if (probeErr) {
    if (/acceptance_context/i.test(probeErr.message ?? '')) {
      console.error('FAIL: acceptance_context column NOT in schema cache. Migration may not have been applied.')
      console.error('Error:', probeErr.message)
    } else {
      console.error('FAIL: Unexpected error querying acceptance_context:', probeErr.message)
    }
  } else {
    console.log('PASS: acceptance_context column is visible in PostgREST schema cache.')
    console.log('Probe row(s):', probe)
  }

  // ── 2. Active terms document ─────────────────────────────────────────────
  section('2. Active terms document')

  const { data: terms, error: termsErr } = await admin
    .from('terms_documents')
    .select('id, version, content_hash, is_active, effective_from, created_at')
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (termsErr) {
    console.error('Error fetching active terms:', termsErr.message)
  } else if (!terms) {
    console.warn('WARNING: No active terms document found.')
  } else {
    console.log('Active terms document:')
    console.log('  id              :', terms.id)
    console.log('  version         :', terms.version)
    console.log('  content_hash    :', terms.content_hash)
    console.log('  effective_from  :', terms.effective_from)
    console.log('  created_at      :', terms.created_at)
  }

  // ── 3. Sample booking_readiness acceptances ──────────────────────────────
  section('3. booking_terms_acceptances where acceptance_context = booking_readiness')

  const { data: readinessAcceptances, error: raErr } = await admin
    .from('booking_terms_acceptances')
    .select('id, user_id, booking_id, terms_document_id, terms_version, terms_content_hash, acceptance_context, accepted_at')
    .eq('acceptance_context', 'booking_readiness')
    .order('accepted_at', { ascending: false })
    .limit(10)

  if (raErr) {
    console.error('Error fetching booking_readiness acceptances:', raErr.message)
  } else if (!readinessAcceptances?.length) {
    console.log('No booking_readiness acceptances found yet.')
    console.log('(Expected after terms acceptance via inline readiness panel.)')
  } else {
    console.log(`Found ${readinessAcceptances.length} booking_readiness acceptance(s):`)
    for (const r of readinessAcceptances) {
      console.log('  ─')
      console.log('  id               :', r.id)
      console.log('  user_id          :', r.user_id)
      console.log('  booking_id       :', r.booking_id, '(expected: null)')
      console.log('  terms_document_id:', r.terms_document_id)
      console.log('  terms_version    :', r.terms_version)
      console.log('  terms_content_hash:', r.terms_content_hash)
      console.log('  acceptance_context:', r.acceptance_context, '(expected: booking_readiness)')
      console.log('  accepted_at      :', r.accepted_at)
    }
  }

  // ── 4. All acceptance_context values in table ────────────────────────────
  section('4. Acceptance context value distribution')

  const { data: all, error: allErr } = await admin
    .from('booking_terms_acceptances')
    .select('acceptance_context')
    .limit(200)

  if (allErr) {
    console.error('Error:', allErr.message)
  } else {
    const counts = {}
    for (const row of (all ?? [])) {
      const ctx = row.acceptance_context ?? '(null)'
      counts[ctx] = (counts[ctx] ?? 0) + 1
    }
    console.log('acceptance_context distribution:', counts)
    const hasNull = counts['(null)'] > 0
    if (hasNull) {
      console.warn('WARNING: Some rows have null acceptance_context. Migration backfill may be incomplete.')
    } else {
      console.log('PASS: No null acceptance_context values.')
    }
  }

  // ── 5. Cleanup dry-run for old test user ─────────────────────────────────
  section('5. Cleanup dry-run: terms-schema-check-1779600082673@example.com')

  const testEmail = 'terms-schema-check-1779600082673@example.com'
  const { data: testProfile } = await admin
    .from('profiles')
    .select('id, email, pilot_clearance_status, created_at')
    .eq('email', testEmail)
    .maybeSingle()

  if (!testProfile) {
    console.log('Profile not found — user may already be deleted or not in profiles table.')
  } else {
    const uid = testProfile.id
    console.log('Profile:', testProfile)

    const [terms2, docs2, bookings2, hist2] = await Promise.all([
      admin.from('booking_terms_acceptances').select('id, accepted_at, acceptance_context').eq('user_id', uid),
      admin.from('user_documents').select('id, document_type, status').eq('user_id', uid),
      admin.from('bookings').select('id, status').eq('booking_owner_user_id', uid),
      admin.from('historical_checkout_completions').select('id, checkout_outcome').eq('customer_id', uid),
    ])

    console.log('\nWould delete (dry-run):')
    console.log('  booking_terms_acceptances:', terms2.data?.length ?? 0, 'row(s)', terms2.data?.map(r => r.acceptance_context))
    console.log('  user_documents           :', docs2.data?.length ?? 0, 'row(s)')
    console.log('  bookings                 :', bookings2.data?.length ?? 0, 'row(s)')
    console.log('  historical_checkout_completions:', hist2.data?.length ?? 0, 'row(s)')
    console.log('  profiles                 : 1 row')
    console.log('\nDO NOT DELETE — awaiting explicit user approval.')
  }

  // ── 6. Any other test users created today ───────────────────────────────
  section('6. Test users created today (dry-run scan)')

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { data: todayUsers } = await admin
    .from('profiles')
    .select('id, email, created_at, pilot_clearance_status')
    .gte('created_at', todayStart.toISOString())
    .ilike('email', '%@example.com%')
    .order('created_at', { ascending: false })
    .limit(20)

  if (!todayUsers?.length) {
    console.log('No @example.com profiles created today.')
  } else {
    console.log(`${todayUsers.length} @example.com profile(s) created today:`)
    for (const u of todayUsers) {
      console.log(`  ${u.email}  [${u.pilot_clearance_status}]  created: ${u.created_at}`)
    }
  }

  console.log('\n✓ Verification complete.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
