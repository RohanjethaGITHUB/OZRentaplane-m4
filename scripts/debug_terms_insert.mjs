/**
 * debug_terms_insert.mjs
 *
 * Diagnose the exact error when acceptCurrentBookingTermsFromReadiness fails.
 * Simulates the server action using a real user session (sign in → get token → attempt insert).
 */

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) throw new Error('Missing env vars: need SUPABASE_URL, ANON_KEY, SERVICE_KEY')

const adminClient = createClient(url, serviceKey)

// Find the test user created by verify_terms_acceptance_flow.mjs
async function findOrCreateTestUser() {
  // Look for recent terms-acceptance-e2e user
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, email, pilot_clearance_status')
    .ilike('email', 'terms-acceptance-e2e-%@example.com')
    .order('created_at', { ascending: false })
    .limit(1)

  if (profiles?.length) {
    console.log(`Found existing test user: ${profiles[0].email} (${profiles[0].id})`)
    return { id: profiles[0].id, email: profiles[0].email, created: false }
  }

  // Create a fresh one
  const ts = Date.now()
  const email = `terms-acceptance-e2e-${ts}@example.com`
  const pw = 'TestPass!23456'
  const { data: { user }, error } = await adminClient.auth.admin.createUser({
    email, password: pw, email_confirm: true, user_metadata: { full_name: 'Terms Debug E2E' },
  })
  if (error) throw error

  await adminClient.from('profiles').upsert({
    id: user.id, email, role: 'customer', full_name: 'Terms Debug E2E',
    pilot_clearance_status: 'cleared_to_fly', account_status: 'active',
    pilot_arn: '9876543', has_night_vfr_rating: false, last_flight_date: '2026-04-15',
  })

  const { data: adminProfile } = await adminClient.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
  await adminClient.from('historical_checkout_completions').insert({
    customer_id: user.id,
    checkout_date: '2026-05-15',
    checkout_outcome: 'cleared_to_fly',
    admin_notes: 'Debug terms insert test',
    recorded_by_admin_id: adminProfile?.id ?? user.id,
    source: 'historical_admin',
    is_active: true,
    created_flight_log: false,
  })

  console.log(`Created test user: ${email} (${user.id})`)
  return { id: user.id, email, pw, created: true }
}

async function main() {
  const { id: userId, email } = await findOrCreateTestUser()
  const pw = 'TestPass!23456'

  // Sign in as the user using anon key
  console.log(`\nSigning in as: ${email}`)
  const userClient = createClient(url, anonKey)
  const { data: { session }, error: signInErr } = await userClient.auth.signInWithPassword({ email, password: pw })
  if (signInErr) {
    console.error('Sign-in failed:', signInErr.message)
    return
  }
  console.log(`Signed in. user_id from session: ${session?.user?.id}`)

  // Get active terms
  const { data: terms } = await adminClient
    .from('terms_documents')
    .select('id, version, public_url, content_hash')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!terms) { console.error('No active terms document'); return }
  console.log('Active terms:', terms.id, 'v' + terms.version)

  // Build the exact same payload as the server action
  const payload = {
    booking_id: null,
    checkout_request_id: null,
    user_id: userId,
    terms_document_id: terms.id,
    terms_version: terms.version,
    terms_document_url: terms.public_url,
    terms_content_hash: terms.content_hash,
    acceptance_text: 'I have read and accept the booking terms and conditions.',
    accepted_ip: '127.0.0.1',
    user_agent: 'debug-script',
    acceptance_context: 'booking_readiness',
  }

  console.log('\nAttempting INSERT as authenticated user (anon key + user session)…')
  const { error: insertErr } = await userClient
    .from('booking_terms_acceptances')
    .insert(payload)

  if (insertErr) {
    console.error('\n--- INSERT FAILED ---')
    console.error('code   :', insertErr.code)
    console.error('message:', insertErr.message)
    console.error('details:', insertErr.details)
    console.error('hint   :', insertErr.hint)
    console.error('full   :', JSON.stringify(insertErr, null, 2))

    const schemaMismatch =
      insertErr.code === 'PGRST204' ||
      insertErr.code === 'PGRST205' ||
      /acceptance_context/i.test(insertErr.message ?? '')

    console.log('\nschemaMismatch?', schemaMismatch)

    if (schemaMismatch) {
      // Try fallback without acceptance_context
      const { acceptance_context: _unused, ...legacyPayload } = payload
      console.log('\nRetrying WITHOUT acceptance_context…')
      const { error: retryErr } = await userClient
        .from('booking_terms_acceptances')
        .insert(legacyPayload)
      if (retryErr) {
        console.error('Fallback also failed:', retryErr.code, retryErr.message)
      } else {
        console.log('Fallback insert succeeded (without acceptance_context).')
      }
    }
  } else {
    console.log('\nINSERT SUCCEEDED as user client.')

    // Verify the record
    const { data: saved } = await adminClient
      .from('booking_terms_acceptances')
      .select('id, user_id, booking_id, acceptance_context, accepted_at')
      .eq('user_id', userId)
      .eq('acceptance_context', 'booking_readiness')
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (saved) {
      console.log('DB record confirmed:')
      console.log('  id               :', saved.id)
      console.log('  user_id          :', saved.user_id)
      console.log('  booking_id       :', saved.booking_id, '(expected null)')
      console.log('  acceptance_context:', saved.acceptance_context, '(expected: booking_readiness)')
      console.log('  accepted_at      :', saved.accepted_at)
    } else {
      console.error('Record not found in DB even though insert reported success?')
    }
  }

  // Also test with admin client for comparison
  console.log('\n--- Admin client test (bypasses RLS) ---')
  const { error: adminErr } = await adminClient
    .from('booking_terms_acceptances')
    .insert({ ...payload, user_id: userId + '_', acceptance_context: 'booking_readiness' })
  if (adminErr?.code !== '23503') { // 23503 = FK violation from fake user_id
    console.log('Admin insert attempt error (expected FK violation on fake user):', adminErr?.code, adminErr?.message)
  }

  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
