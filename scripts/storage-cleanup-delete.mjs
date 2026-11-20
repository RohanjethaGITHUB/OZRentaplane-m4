#!/usr/bin/env node
/**
 * Storage cleanup — deletes ONLY the files listed in the CSV exported from
 * scripts/storage-cleanup-files.sql (approved by the CEO, 19 Nov 2026).
 *
 * Dry run (default — deletes nothing, prints what would be deleted):
 *   node scripts/storage-cleanup-delete.mjs path/to/files.csv
 *
 * Delete for real:
 *   node scripts/storage-cleanup-delete.mjs path/to/files.csv --execute
 *
 * Safety:
 *   • Refuses any row in a protected bucket or belonging to a protected customer.
 *   • Before deleting a 'deleted_account' file, re-checks with Supabase Auth that
 *     the account really does not exist; if it exists, the file is skipped.
 *   • Deletes through the Storage API (frees the space), in batches of 100.
 *   • Writes a log of every file deleted / skipped / failed next to the CSV.
 *
 * Needs .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * The Supabase project must be unrestricted (Storage API returns 402 while blocked).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PROTECTED_USER_IDS = new Set([
  '4c328778-5df0-4c6f-aa67-7dc9c3f4a441', // Zain Alam
  '1780d366-361c-4e45-867d-5c9e3842a080', // Ryan Wang
  'de361f3b-008c-4664-a012-1292aaf955ab', // Jorge Alfredo Gustavo
  '94f6578f-59c0-4ae7-ba42-89fb5ab7edf1', // Matt Jin
  '369ba631-da66-4dba-9e7f-db159d7c76df', // Roger Binks
  '9e020bab-90d9-4dac-ae7c-23c4e32aaf55', // William Puican
  'c30fe9c6-ffd3-4f5d-94c2-672dd583e2f2', // Ammanuel Abebe
  '16d003a7-393e-42ba-98ac-1756a42a8210', // Thomas Curtain
  'ce8540ad-c246-453f-a060-d6945e9916b1', // Maximilian Touw
])
const ALLOWED_BUCKETS = new Set(['verification_documents', 'invoice_pdfs', 'bank_transfer_receipts', 'flight_record_evidence'])
const ALLOWED_REASONS = new Set(['deleted_account', 'no_owner', 'test_account'])
const BATCH = 100

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const csvPath = args.find((a) => !a.startsWith('--'))
const execute = args.includes('--execute')
if (!csvPath) {
  console.error('Usage: node scripts/storage-cleanup-delete.mjs <files.csv> [--execute]')
  process.exit(1)
}

// ── CSV (handles quoted fields) ─────────────────────────────────────────────
function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row) }
  const [header, ...data] = rows
  const h = header.map((x) => x.trim().replace(/^﻿/, ''))
  return data.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])))
}

const records = parseCsv(readFileSync(csvPath, 'utf8'))
for (const col of ['reason', 'bucket_id', 'path', 'bytes', 'owner_id']) {
  if (!(col in (records[0] ?? {}))) {
    console.error(`CSV is missing column "${col}". Export the result of scripts/storage-cleanup-files.sql.`)
    process.exit(1)
  }
}

// ── validate every row before touching anything ─────────────────────────────
const refused = []
const files = []
for (const r of records) {
  const ownerInPath = [...PROTECTED_USER_IDS].find((id) => r.path.includes(id) || r.owner_id === id)
  if (ownerInPath) refused.push({ ...r, why: `protected customer ${ownerInPath}` })
  else if (!ALLOWED_BUCKETS.has(r.bucket_id)) refused.push({ ...r, why: `bucket ${r.bucket_id} not allowed` })
  else if (!ALLOWED_REASONS.has(r.reason)) refused.push({ ...r, why: `unknown reason ${r.reason}` })
  else if (!r.path || r.path.endsWith('/')) refused.push({ ...r, why: 'empty / folder path' })
  else files.push({ ...r, bytes: Number(r.bytes) || 0 })
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`
function summary(list) {
  const by = {}
  for (const f of list) {
    const k = `${f.reason.padEnd(16)} ${f.bucket_id}`
    by[k] ??= { files: 0, bytes: 0 }
    by[k].files++; by[k].bytes += f.bytes
  }
  for (const [k, v] of Object.entries(by).sort()) console.log(`  ${k.padEnd(45)} ${String(v.files).padStart(5)} files  ${mb(v.bytes).padStart(10)}`)
  const total = list.reduce((s, f) => s + f.bytes, 0)
  console.log(`  ${'TOTAL'.padEnd(45)} ${String(list.length).padStart(5)} files  ${mb(total).padStart(10)}`)
}

console.log(`\n${execute ? '⚠  EXECUTE MODE — files WILL be deleted' : 'DRY RUN — nothing will be deleted'}`)
console.log(`CSV: ${csvPath}\n`)
console.log('Files to delete:')
summary(files)
if (refused.length) {
  console.log(`\nRefused by safety checks (${refused.length}) — these will NOT be deleted:`)
  for (const r of refused.slice(0, 20)) console.log(`  ${r.bucket_id}/${r.path}  (${r.why})`)
}

if (!execute) {
  console.log('\nNo files were deleted. Re-run with --execute to delete them.')
  process.exit(0)
}

// ── execute ─────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Re-check that every 'deleted_account' owner truly does not exist.
const owners = [...new Set(files.filter((f) => f.reason === 'deleted_account').map((f) => f.owner_id))]
const existing = new Set()
console.log(`\nRe-checking ${owners.length} deleted accounts with Supabase Auth…`)
for (const id of owners) {
  const { data, error } = await supabase.auth.admin.getUserById(id)
  if (data?.user) existing.add(id)
  else if (error && error.status !== 404 && !/not.?found/i.test(error.message ?? '')) {
    console.error(`Could not verify user ${id}: ${error.message}. Stopping — nothing deleted.`)
    process.exit(1)
  }
}
if (existing.size) console.log(`  ${existing.size} account(s) still exist — their files will be skipped.`)

const toDelete = files.filter((f) => !(f.reason === 'deleted_account' && existing.has(f.owner_id)))
const log = { startedAt: new Date().toISOString(), deleted: [], failed: [], skipped: files.filter((f) => !toDelete.includes(f)).map((f) => `${f.bucket_id}/${f.path}`) }

const byBucket = {}
for (const f of toDelete) (byBucket[f.bucket_id] ??= []).push(f)

let freed = 0
for (const [bucket, list] of Object.entries(byBucket)) {
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH)
    const { data, error } = await supabase.storage.from(bucket).remove(chunk.map((f) => f.path))
    if (error) {
      console.error(`  ${bucket}: batch ${i / BATCH + 1} failed — ${error.message}`)
      log.failed.push(...chunk.map((f) => ({ path: `${bucket}/${f.path}`, error: error.message })))
      if (/restricted|402/i.test(error.message ?? '')) { console.error('Project is still restricted. Stopping.'); break }
      continue
    }
    const removed = new Set((data ?? []).map((o) => o.name))
    for (const f of chunk) {
      if (removed.has(f.path)) { log.deleted.push(`${bucket}/${f.path}`); freed += f.bytes }
      else log.failed.push({ path: `${bucket}/${f.path}`, error: 'not returned as removed (already gone?)' })
    }
    console.log(`  ${bucket}: ${Math.min(i + BATCH, list.length)}/${list.length}`)
  }
}

log.finishedAt = new Date().toISOString()
log.freedBytes = freed
const logPath = join(dirname(csvPath), `${basename(csvPath, '.csv')}-deletion-log.json`)
writeFileSync(logPath, JSON.stringify(log, null, 2))
console.log(`\nDeleted ${log.deleted.length} files, freed about ${mb(freed)}. Failed: ${log.failed.length}. Skipped: ${log.skipped.length}.`)
console.log(`Log written to ${logPath}`)
