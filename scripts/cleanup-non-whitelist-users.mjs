#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const WHITELIST_EMAILS = [
  'ammanuel.eman@gmail.com',
  'info@ozrentaplane.com',
  'roger@papandrea.com.au',
  'rohanjetha2@gmail.com',
]

const USER_COLUMN_CANDIDATES = new Set([
  'user_id',
  'customer_id',
  'profile_id',
  'created_by',
  'updated_by',
  'admin_user_id',
  'pilot_id',
  'pic_user_id',
  'booking_owner_user_id',
  'reviewed_by',
  'checkout_completed_by',
  'payment_confirmed_by',
  'payment_rejected_by',
  'reported_by_user_id',
  'resolved_by_user_id',
  'approved_by_user_id',
])

const OWNERSHIP_USER_COLUMNS = new Map([
  ['profiles', new Set(['id', 'user_id'])],
  ['bookings', new Set(['user_id', 'customer_id', 'booking_owner_user_id', 'pic_user_id'])],
  ['checkout_change_requests', new Set(['customer_id'])],
  ['user_documents', new Set(['user_id'])],
  ['booking_terms_acceptances', new Set(['user_id'])],
  ['booking_bank_transfer_submissions', new Set(['customer_id'])],
  ['checkout_bank_transfer_submissions', new Set(['customer_id'])],
  ['booking_invoices', new Set(['customer_id'])],
  ['checkout_invoices', new Set(['customer_id'])],
  ['customer_payment_ledger', new Set(['customer_id'])],
  ['customer_credit_balances', new Set(['customer_id'])],
  ['booking_cancellation_requests', new Set(['user_id'])],
  ['flight_records', new Set(['submitted_by_user_id'])],
  ['verification_events', new Set(['user_id'])],
  ['aircraft_flight_logs', new Set(['pic_user_id'])],
  ['squawks', new Set(['reported_by_user_id'])],
])

const ACTOR_METADATA_COLUMNS = new Map([
  ['profiles', new Set(['reviewed_by', 'account_locked_by_admin_id', 'account_unlocked_by_admin_id'])],
  ['checkout_bank_transfer_submissions', new Set(['reviewed_by'])],
  ['booking_bank_transfer_submissions', new Set(['reviewed_by'])],
  ['checkout_change_requests', new Set(['reviewed_by'])],
  ['checkout_invoices', new Set(['checkout_completed_by'])],
  ['customer_payment_ledger', new Set(['created_by'])],
  ['booking_audit_events', new Set(['actor_user_id'])],
  ['booking_status_history', new Set(['changed_by_user_id'])],
  ['verification_events', new Set(['actor_user_id'])],
  ['aircraft_flight_logs', new Set(['created_by', 'updated_by'])],
  ['flight_records', new Set(['approved_by_user_id'])],
  ['flight_record_attachments', new Set(['uploaded_by_user_id'])],
  ['schedule_blocks', new Set(['created_by_user_id'])],
  ['aircraft_usage_records', new Set(['created_by_user_id', 'approved_by_user_id'])],
  ['aircraft_meter_history', new Set(['entered_by_user_id', 'approved_by_user_id'])],
  ['squawks', new Set(['resolved_by_user_id'])],
])

const REQUIRED_ZERO_OR_SKIPPED_TABLES = [
  'booking_cancellation_requests',
  'squawks',
  'aircraft_usage_records',
  'aircraft_meter_history',
]

const CONFIRM_VALUE = 'DELETE_NON_WHITELIST_USERS'
const BACKUP_CONFIRM_VALUE = 'FULL_BACKUP_EXISTS'
const BATCH_SIZE = 50
const READ_ONLY_VIEWS = new Set(['booking_invoice_live_amount', 'checkout_invoice_live_amount'])

const SAFETY_CATEGORIES = [
  { label: 'profile rows selected for deletion', match: (table) => table === 'profiles' },
  { label: 'booking rows selected for deletion', match: (table) => table === 'bookings' },
  { label: 'checkout rows selected for deletion', match: (table) => table.includes('checkout') },
  { label: 'document rows selected for deletion', match: (table) => table.includes('document') },
  {
    label: 'invoice/payment rows selected for deletion',
    match: (table) => table.includes('invoice') || table.includes('payment'),
  },
  { label: 'schedule block rows selected for deletion', match: (table) => table === 'schedule_blocks' },
  {
    label: 'audit/history rows selected for deletion',
    match: (table) => table.includes('audit') || table.includes('history'),
  },
]

function loadDotEnvLocal() {
  try {
    const envText = readFileSync('.env.local', 'utf8')
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!match || process.env[match[1]]) continue
      let value = match[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[match[1]] = value
    }
  } catch {
    // .env.local is optional; real production runs should normally inject env vars.
  }
}

loadDotEnvLocal()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryRun = process.env.CLEANUP_CONFIRM !== CONFIRM_VALUE
const backupConfirmed = process.env.BACKUP_CONFIRMED === BACKUP_CONFIRM_VALUE

if (!supabaseUrl || !serviceRoleKey) {
  fail('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}

const projectRef = new URL(supabaseUrl).host.split('.')[0]
const expectedProjectRef = process.env.EXPECTED_SUPABASE_PROJECT_REF
const expectedUrl = process.env.EXPECTED_SUPABASE_URL

if (expectedProjectRef && expectedProjectRef !== projectRef) {
  fail(`Project ref mismatch: expected ${expectedProjectRef}, got ${projectRef}.`)
}

if (expectedUrl && normalizeUrl(expectedUrl) !== normalizeUrl(supabaseUrl)) {
  fail(`Supabase URL mismatch: expected ${expectedUrl}, got ${supabaseUrl}.`)
}

if (!dryRun && !backupConfirmed) {
  fail(
    `Refusing destructive cleanup without BACKUP_CONFIRMED=${BACKUP_CONFIRM_VALUE}. ` +
      'Take/verify a full Supabase backup first.'
  )
}

const restBase = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`
const authBase = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`
let activeSafetyFailures = null

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
}

main().catch((error) => {
  console.error('\nCleanup failed:')
  console.error(error?.stack || error?.message || error)
  process.exit(1)
})

async function main() {
  console.log('OZ Rent A Plane Supabase user cleanup')
  console.log(`Project: ${projectRef} (${supabaseUrl})`)
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'DELETE'}`)
  console.log(
    `Backup confirmation: ${backupConfirmed ? 'confirmed by env' : 'not confirmed in env'}`
  )

  const openApi = await getJson(`${restBase}/`)
  const tables = buildTables(openApi)
  const users = await listAuthUsers()
  const keepEmails = new Set(WHITELIST_EMAILS.map((email) => email.toLowerCase()))
  const keepUsers = users.filter((user) => keepEmails.has((user.email || '').toLowerCase()))
  const deleteUsers = users.filter((user) => !keepEmails.has((user.email || '').toLowerCase()))
  const missingKeepEmails = WHITELIST_EMAILS.filter(
    (email) => !keepUsers.some((user) => (user.email || '').toLowerCase() === email)
  )

  console.log('\nUsers kept:')
  printUsers(keepUsers)
  if (missingKeepEmails.length) {
    console.log('\nWhitelisted emails not present in auth.users:')
    for (const email of missingKeepEmails) console.log(`- ${email}`)
  }

  console.log('\nUsers deleted:')
  printUsers(deleteUsers)

  const deleteUserIds = deleteUsers.map((user) => user.id).filter(Boolean)
  const keepUserIds = keepUsers.map((user) => user.id).filter(Boolean)

  const plan = await buildAffectedPlan(tables, deleteUserIds, deleteUsers)
  plan.deleteAuthUserCount = deleteUserIds.length
  plan.allowedActorMetadataAppearances = await collectAllowedActorMetadataAppearances(plan, keepUserIds)
  await runPreDeleteSafetyAssertions(plan, keepUserIds, deleteUserIds)

  console.log('\nWhitelist auth user IDs:')
  printIds(keepUserIds)

  console.log('\nDelete auth user IDs:')
  printIds(deleteUserIds)

  console.log('\nSafety assertions:')
  for (const item of plan.safetyChecks) {
    console.log(`- PASS: ${item}`)
  }
  if (plan.safetyFailures.length) {
    console.log('\nSafety assertion failures:')
    for (const item of plan.safetyFailures) {
      console.log(`- FAIL: ${item}`)
    }
  }

  console.log('\nDeleted-user record counts by affected table:')
  if (!plan.affectedTables.length) {
    console.log('- none')
  } else {
    for (const item of plan.affectedTables) {
      const columns = [...item.reasons].sort().join(', ')
      const kind = item.meta?.deletable ? 'table' : 'read-only view'
      console.log(`- ${item.table}: ${item.ids.size} rows (${kind}; ${columns})`)
    }
  }

  printOwnershipReport(plan)
  printAllowedActorMetadataReport(plan)
  printSkippedUserColumnReport(plan)
  printNonFkOwnershipReport(plan)
  printRequiredTableCoverage(plan)

  printReadOnlyViewReport(plan)
  printDeleteOrder(plan)

  if (dryRun) {
    console.log('\nDry run complete. No rows were deleted.')
    if (plan.safetyFailures.length) {
      console.log('\nActual cleanup command withheld until safety assertion failures are resolved.')
      process.exitCode = 1
    } else {
      console.log('\nActual cleanup command:')
      console.log(
        [
          `EXPECTED_SUPABASE_PROJECT_REF=${shell(projectRef)}`,
          `BACKUP_CONFIRMED=${BACKUP_CONFIRM_VALUE}`,
          `CLEANUP_CONFIRM=${CONFIRM_VALUE}`,
          'node scripts/cleanup-non-whitelist-users.mjs',
        ].join(' ')
      )
    }
    return
  }

  if (plan.safetyFailures.length) {
    fail('Refusing destructive cleanup because safety assertion failures were found.')
  }

  for (const item of plan.deleteOrder) {
    if (!item.ids.size) continue
    if (!item.meta?.deletable) continue
    await deleteRowsByIds(item.table, item.meta.primaryKey, [...item.ids])
    console.log(`Deleted ${item.ids.size} rows from ${item.table}`)
  }

  for (const user of deleteUsers) {
    await deleteAuthUser(user.id)
    console.log(`Deleted auth user ${user.email || '(no email)'} (${user.id})`)
  }

  await verifyAfterDelete(tables, keepUserIds, deleteUserIds)
  console.log('\nCleanup and verification complete.')
}

function buildTables(openApi) {
  const definitions = openApi.definitions || openApi.components?.schemas || {}
  return Object.entries(definitions)
    .filter(([, definition]) => definition?.properties)
    .map(([name, definition]) => {
      const properties = definition.properties
      const columns = Object.keys(properties)
      const primaryKey = columns.find((column) =>
        String(properties[column]?.description || '').includes('<pk/>')
      )
      const fks = []
      for (const [column, meta] of Object.entries(properties)) {
        const description = String(meta?.description || '')
        const match = description.match(/<fk table='([^']+)' column='([^']+)'\/>/)
        if (match) fks.push({ column, targetTable: match[1], targetColumn: match[2] })
      }
      return {
        name,
        columns,
        primaryKey,
        fks,
        properties,
        deletable: Boolean(openApi.paths?.[`/${name}`]?.delete) && !READ_ONLY_VIEWS.has(name),
      }
    })
    .filter((table) => table.primaryKey)
}

async function buildAffectedPlan(tables, deleteUserIds, deleteUsers) {
  const tableByName = new Map(tables.map((table) => [table.name, table]))
  const affected = new Map()
  const withoutFk = []
  const skippedUserColumns = []

  for (const table of tables) {
    const relatedColumns = userRelatedColumns(table)
    const directColumns = ownershipColumns(table)
    const actorColumns = actorMetadataColumns(table)

    for (const column of relatedColumns) {
      if (directColumns.includes(column) || actorColumns.includes(column)) continue
      skippedUserColumns.push({
        table: table.name,
        column,
        reason: 'not classified as ownership or actor/admin metadata',
      })
    }

    for (const column of directColumns) {
      const hasFk = table.fks.some((fk) => fk.column === column)
      if (!hasFk && !(table.name === 'profiles' && column === 'id')) {
        withoutFk.push({ table: table.name, column })
      }
      const ids = await selectIds(table.name, table.primaryKey, column, deleteUserIds)
      addAffected(affected, table.name, ids, `ownership: ${column} in deleted user IDs`)
    }

    if (table.name === 'email_events' && table.columns.includes('recipient_email')) {
      const ids = await selectIdsByTextValues(
        table.name,
        table.primaryKey,
        'recipient_email',
        deleteUsers.map((user) => user.email).filter(Boolean)
      )
      addAffected(affected, table.name, ids, 'ownership: recipient_email in deleted user emails')
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const table of tables) {
      for (const fk of table.fks) {
        const parent = affected.get(fk.targetTable)
        if (!parent?.ids?.size) continue
        if (!shouldFollowParentFk(table, fk)) continue
        const ids = await selectIds(table.name, table.primaryKey, fk.column, [...parent.ids])
        if (addAffected(affected, table.name, ids, `parent-chain: ${fk.column} references ${fk.targetTable}`)) {
          changed = true
        }
      }
    }
  }

  const affectedTables = [...affected.entries()]
    .map(([table, value]) => ({ table, meta: tableByName.get(table), ...value }))
    .filter((item) => item.ids.size)
    .sort((a, b) => a.table.localeCompare(b.table))

  const deleteOrder = topologicalDeleteOrder(tables, affectedTables, tableByName)
  return { affectedTables, deleteOrder, userColumnsWithoutFk: withoutFk, skippedUserColumns }
}

function userRelatedColumns(table) {
  return table.columns.filter((column) => {
    if (table.name === 'profiles' && column === 'id') return true
    if (!isUuidColumn(table, column)) return false
    if (USER_COLUMN_CANDIDATES.has(column)) return true
    return /(^|_)(user|customer|profile|pilot|admin)(_id)?$/.test(column)
  })
}

function ownershipColumns(table) {
  const configured = OWNERSHIP_USER_COLUMNS.get(table.name)
  if (!configured) return []
  return table.columns.filter((column) => configured.has(column))
}

function actorMetadataColumns(table) {
  const configured = ACTOR_METADATA_COLUMNS.get(table.name)
  if (!configured) return []
  return table.columns.filter((column) => configured.has(column))
}

function shouldFollowParentFk(table, fk) {
  if (fk.targetTable !== 'profiles' && fk.targetTable !== 'auth.users') return true
  return ownershipColumns(table).includes(fk.column)
}

function isUuidColumn(table, column) {
  return table.properties[column]?.format === 'uuid'
}

function addAffected(affected, table, ids, reason) {
  if (!ids.length) return false
  const existing = affected.get(table) || { ids: new Set(), reasons: new Set() }
  const before = existing.ids.size
  ids.forEach((id) => existing.ids.add(id))
  existing.reasons.add(reason)
  affected.set(table, existing)
  return existing.ids.size > before
}

function topologicalDeleteOrder(tables, affectedTables, tableByName) {
  const affectedNames = new Set(affectedTables.map((item) => item.table))
  const depthMemo = new Map()
  const byTable = new Map(affectedTables.map((item) => [item.table, item]))

  function depth(tableName, seen = new Set()) {
    if (depthMemo.has(tableName)) return depthMemo.get(tableName)
    if (seen.has(tableName)) return 0
    seen.add(tableName)
    const children = tables.filter((table) =>
      table.fks.some((fk) => fk.targetTable === tableName && affectedNames.has(table.name))
    )
    const value = children.length
      ? 1 + Math.max(...children.map((child) => depth(child.name, new Set(seen))))
      : 0
    depthMemo.set(tableName, value)
    return value
  }

  return [...affectedNames]
    .sort((a, b) => {
      if (a === 'profiles' && b !== 'profiles') return 1
      if (b === 'profiles' && a !== 'profiles') return -1
      return depth(a) - depth(b) || a.localeCompare(b)
    })
    .map((name) => ({ ...byTable.get(name), meta: tableByName.get(name) }))
}

async function runPreDeleteSafetyAssertions(plan, keepUserIds, deleteUserIds) {
  const keepSet = new Set(keepUserIds)
  const messages = []
  activeSafetyFailures = []

  if (assertCondition(keepUserIds.length === WHITELIST_EMAILS.length, {
    label: 'whitelist auth user count',
    details: `expected ${WHITELIST_EMAILS.length}, got ${keepUserIds.length}`,
  })) {
    messages.push(`exactly ${WHITELIST_EMAILS.length} whitelist auth user IDs resolved`)
  }

  if (assertCondition(deleteUserIds.length === 9, {
    label: 'delete auth user count',
    details: `expected 9, got ${deleteUserIds.length}`,
  })) {
    messages.push('exactly 9 delete auth user IDs resolved')
  }

  const deleteWhitelistOverlap = deleteUserIds.filter((id) => keepSet.has(id))
  if (assertNoIds(deleteWhitelistOverlap, 'deleteUserIds contains whitelist user IDs')) {
    messages.push('no whitelist user ID appears in deleteUserIds')
  }

  for (const category of SAFETY_CATEGORIES) {
    const overlaps = await whitelistOverlapsForAffectedTables(
      plan.affectedTables.filter((item) => category.match(item.table)),
      keepSet
    )
    if (assertNoIds(overlaps, category.label)) {
      messages.push(`no whitelist user ID appears in ${category.label}`)
    }
  }

  const nonFkOverlaps = []
  for (const item of plan.userColumnsWithoutFk) {
    const affected = plan.affectedTables.find((table) => table.table === item.table)
    if (!affected?.ids?.size) continue
    const keepLinkedIds = await selectIds(item.table, affected.meta.primaryKey, item.column, keepUserIds)
    const selectedKeepLinkedIds = keepLinkedIds.filter((id) => affected.ids.has(id))
    if (selectedKeepLinkedIds.length) {
      nonFkOverlaps.push(
        `${item.table}.${item.column} in rows ${selectedKeepLinkedIds.join(', ')}`
      )
    }
  }
  if (assertNoIds(nonFkOverlaps, 'manually detected non-FK user column cleanup list')) {
    messages.push('no whitelist user ID appears in manually detected non-FK cleanup rows')
  }

  for (const view of READ_ONLY_VIEWS) {
    const item = plan.affectedTables.find((table) => table.table === view)
    if (assertCondition(!item || !item.meta?.deletable, {
      label: `${view} delete guard`,
      details: `${view} must be report-only`,
    })) {
      messages.push(`${view} is report-only and will not be deleted directly`)
    }
  }

  const deletableOrder = plan.deleteOrder.filter((item) => item.meta?.deletable)
  const profileIndex = deletableOrder.findIndex((item) => item.table === 'profiles')
  if (assertCondition(profileIndex === -1 || profileIndex === deletableOrder.length - 1, {
    label: 'profiles deletion order',
    details: 'profiles must be the final public table before auth user deletion',
  })) {
    messages.push('deletion order is child/dependent rows first, profiles last, auth users after profiles')
  }

  plan.safetyChecks = messages
  plan.safetyFailures = activeSafetyFailures
  activeSafetyFailures = null
}

async function whitelistOverlapsForAffectedTables(items, keepSet) {
  const overlaps = []
  for (const item of items) {
    if (!item.meta?.deletable || !item.ids?.size) continue
    const rows = await selectRowsByIds(item.table, item.meta.primaryKey, [...item.ids])
    const columns = ownershipColumns(item.meta)
    for (const row of rows) {
      for (const column of columns) {
        if (keepSet.has(row[column])) {
          overlaps.push(`${item.table}.${column} row ${row[item.meta.primaryKey]} -> ${row[column]}`)
        }
      }
    }
  }
  return overlaps
}

async function collectAllowedActorMetadataAppearances(plan, keepUserIds) {
  const keepSet = new Set(keepUserIds)
  const appearances = []
  for (const item of plan.affectedTables) {
    if (!item.meta?.deletable || !item.ids?.size) continue
    const columns = actorMetadataColumns(item.meta)
    if (!columns.length) continue
    const rows = await selectRowsByIds(item.table, item.meta.primaryKey, [...item.ids])
    for (const row of rows) {
      for (const column of columns) {
        const value = row[column]
        if (keepSet.has(value)) {
          appearances.push(`${item.table}.${column} row ${row[item.meta.primaryKey]} -> ${value}`)
        }
      }
    }
  }
  return appearances
}

function printOwnershipReport(plan) {
  console.log('\nRows selected by ownership/parent-chain reason:')
  const rows = plan.affectedTables.filter((item) => item.ids.size)
  if (!rows.length) {
    console.log('- none')
    return
  }
  for (const item of rows) {
    const reasons = [...item.reasons].sort().join('; ')
    console.log(`- ${item.table}: ${item.ids.size} rows (${reasons})`)
  }
}

function printAllowedActorMetadataReport(plan) {
  console.log('\nAllowed whitelist ID appearances in actor/admin metadata:')
  if (!plan.allowedActorMetadataAppearances.length) {
    console.log('- none')
    return
  }
  for (const item of plan.allowedActorMetadataAppearances) {
    console.log(`- ${item}`)
  }
}

function printSkippedUserColumnReport(plan) {
  console.log('\nSkipped user-related columns not used as delete selectors:')
  if (!plan.skippedUserColumns.length) {
    console.log('- none')
    return
  }
  for (const item of plan.skippedUserColumns) {
    console.log(`- ${item.table}.${item.column}: ${item.reason}`)
  }
}

function printNonFkOwnershipReport(plan) {
  console.log('\nOwnership columns without FK constraint:')
  if (!plan.userColumnsWithoutFk.length) {
    console.log('- none detected')
    return
  }
  for (const item of plan.userColumnsWithoutFk) {
    console.log(`- ${item.table}.${item.column}`)
  }
}

function printRequiredTableCoverage(plan) {
  console.log('\nRequired table coverage:')
  for (const table of REQUIRED_ZERO_OR_SKIPPED_TABLES) {
    const affected = plan.affectedTables.find((item) => item.table === table)
    const skipped = plan.skippedUserColumns.filter((item) => item.table === table)
    if (affected?.ids?.size) {
      console.log(`- ${table}: included, ${affected.ids.size} rows`)
    } else if (skipped.length) {
      console.log(`- ${table}: 0 rows selected; skipped columns: ${skipped.map((item) => item.column).join(', ')}`)
    } else {
      console.log(`- ${table}: included with 0 rows or no actionable user-owned rows detected`)
    }
  }
}

function printReadOnlyViewReport(plan) {
  console.log('\nRead-only view handling:')
  for (const view of READ_ONLY_VIEWS) {
    const item = plan.affectedTables.find((table) => table.table === view)
    const count = item?.ids?.size || 0
    console.log(`- ${view}: ${count} affected rows reported only; direct DELETE skipped`)
  }
}

function printDeleteOrder(plan) {
  console.log('\nDeletion order:')
  const order = plan.deleteOrder.filter((item) => item.meta?.deletable && item.ids.size)
  if (!order.length) {
    console.log('- no public/application rows')
  } else {
    order.forEach((item, index) => {
      const suffix = item.table === 'profiles' ? ' (public user parent rows last)' : ''
      console.log(`${index + 1}. ${item.table}: ${item.ids.size} rows${suffix}`)
    })
  }
  console.log(`${order.length + 1}. auth.users: ${plan.deleteAuthUserCount ?? 'delete'} users (after public rows)`)
}

async function listAuthUsers() {
  const users = []
  for (let page = 1; ; page += 1) {
    const data = await getJson(`${authBase}/admin/users?page=${page}&per_page=1000`)
    const batch = data.users || []
    users.push(...batch)
    if (batch.length < 1000) return users
  }
}

async function selectIds(table, primaryKey, column, values) {
  if (!values.length) return []
  const ids = []
  for (const batch of chunks(values, BATCH_SIZE)) {
    const query = new URLSearchParams()
    query.set('select', primaryKey)
    query.set(column, `in.(${batch.map(encodeValue).join(',')})`)
    const rows = await getJson(`${restBase}/${table}?${query}`)
    ids.push(...rows.map((row) => row[primaryKey]).filter(Boolean))
  }
  return ids
}

async function selectIdsByTextValues(table, primaryKey, column, values) {
  if (!values.length) return []
  const ids = []
  for (const batch of chunks(values, BATCH_SIZE)) {
    const query = new URLSearchParams()
    query.set('select', primaryKey)
    query.set(column, `in.(${batch.map(encodeValue).join(',')})`)
    const rows = await getJson(`${restBase}/${table}?${query}`)
    ids.push(...rows.map((row) => row[primaryKey]).filter(Boolean))
  }
  return ids
}

async function selectRowsByIds(table, primaryKey, ids) {
  const rows = []
  for (const batch of chunks(ids, BATCH_SIZE)) {
    const query = new URLSearchParams()
    query.set('select', '*')
    query.set(primaryKey, `in.(${batch.map(encodeValue).join(',')})`)
    rows.push(...(await getJson(`${restBase}/${table}?${query}`)))
  }
  return rows
}

async function deleteRowsByIds(table, primaryKey, ids) {
  for (const batch of chunks(ids, BATCH_SIZE)) {
    const query = new URLSearchParams()
    query.set(primaryKey, `in.(${batch.map(encodeValue).join(',')})`)
    const response = await fetch(`${restBase}/${table}?${query}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=minimal' },
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Delete failed for ${table}: ${response.status} ${body}`)
    }
  }
}

async function deleteAuthUser(userId) {
  const response = await fetch(`${authBase}/admin/users/${userId}`, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Auth user delete failed for ${userId}: ${response.status} ${body}`)
  }
}

async function verifyAfterDelete(tables, keepUserIds, deleteUserIds) {
  const users = await listAuthUsers()
  const remainingEmails = users.map((user) => (user.email || '').toLowerCase()).sort()
  const expectedEmails = [...WHITELIST_EMAILS].sort()
  if (JSON.stringify(remainingEmails) !== JSON.stringify(expectedEmails)) {
    throw new Error(
      `Auth verification failed. Remaining emails: ${remainingEmails.join(', ') || '(none)'}`
    )
  }

  for (const table of tables) {
    for (const column of ownershipColumns(table)) {
      const ids = await selectIds(table.name, table.primaryKey, column, deleteUserIds)
      if (ids.length) {
        throw new Error(
          `Verification failed: ${table.name}.${column} still links to deleted users (${ids.length} rows).`
        )
      }
    }
  }

  console.log('\nVerification:')
  console.log(`- auth.users contains only ${keepUserIds.length} whitelisted users`)
  console.log('- no discovered public user-linked rows remain for deleted user IDs')
}

async function getJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Request failed ${response.status} ${url}: ${body}`)
  }
  return response.json()
}

function chunks(values, size) {
  const output = []
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size))
  }
  return output
}

function encodeValue(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`
}

function normalizeUrl(value) {
  return value.replace(/\/$/, '')
}

function printUsers(users) {
  if (!users.length) {
    console.log('- none')
    return
  }
  for (const user of users) {
    console.log(`- ${user.email || '(no email)'} (${user.id})`)
  }
}

function printIds(ids) {
  if (!ids.length) {
    console.log('- none')
    return
  }
  for (const id of ids) console.log(`- ${id}`)
}

function assertNoIds(values, label) {
  return assertCondition(values.length === 0, {
    label,
    details: values.join('; '),
  })
}

function assertCondition(condition, failure) {
  if (condition) return true
  if (activeSafetyFailures) {
    activeSafetyFailures.push(`${failure.label}. ${failure.details}`)
    return false
  }
  throw new Error(`Safety assertion failed: ${failure.label}. ${failure.details}`)
}

function shell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
