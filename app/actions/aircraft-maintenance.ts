'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type MaintenanceSettings = {
  id: string
  aircraft_id: string
  last_oil_change_mr: number | null
  next_oil_change_due_mr: number | null
  oil_change_interval_mr: number
  last_100hr_maintenance_mr: number | null
  next_100hr_maintenance_due_mr: number | null
  maintenance_100hr_interval_mr: number
  notes: string | null
  updated_at: string
}

export type MaintenanceStatus = 'ok' | 'due_soon' | 'overdue'

export type MaintenanceInfo = {
  settings: MaintenanceSettings | null
  current_mr: number | null
  oil_change_status: MaintenanceStatus
  oil_change_hours_remaining: number | null
  maintenance_100hr_status: MaintenanceStatus
  maintenance_100hr_hours_remaining: number | null
}

export type MaintenanceAlert = {
  aircraft_id: string
  aircraft_registration: string
  oil_change_status: MaintenanceStatus
  maintenance_100hr_status: MaintenanceStatus
  current_mr: number | null
  next_oil_change_due_mr: number | null
  next_100hr_maintenance_due_mr: number | null
  oil_hours_remaining: number | null
  maintenance_hours_remaining: number | null
}

const OIL_DUE_SOON_THRESHOLD   = 5    // MR hours
const MAINTENANCE_DUE_SOON_THRESHOLD = 10 // MR hours

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

function computeMaintenanceStatus(
  currentMr: number | null,
  nextDueMr: number | null,
  dueSoonThreshold: number,
): { status: MaintenanceStatus; hoursRemaining: number | null } {
  if (currentMr == null || nextDueMr == null) {
    return { status: 'ok', hoursRemaining: null }
  }
  const remaining = nextDueMr - currentMr
  if (remaining <= 0) return { status: 'overdue', hoursRemaining: remaining }
  if (remaining <= dueSoonThreshold) return { status: 'due_soon', hoursRemaining: remaining }
  return { status: 'ok', hoursRemaining: remaining }
}

export async function getAircraftMaintenanceInfo(aircraftId: string): Promise<MaintenanceInfo> {
  const { supabase } = await requireAdmin()

  const [{ data: settingsRow }, { data: latestLog }] = await Promise.all([
    supabase
      .from('aircraft_maintenance_settings')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .maybeSingle(),
    supabase
      .from('aircraft_flight_logs')
      .select('mr_stop')
      .eq('aircraft_id', aircraftId)
      .in('review_status', ['admin_confirmed', 'admin_adjusted'])
      .order('log_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const settings  = (settingsRow as MaintenanceSettings | null) ?? null
  const currentMr = (latestLog?.mr_stop as number | null) ?? null

  const oilResult = computeMaintenanceStatus(
    currentMr,
    settings?.next_oil_change_due_mr ?? null,
    OIL_DUE_SOON_THRESHOLD,
  )
  const maintenanceResult = computeMaintenanceStatus(
    currentMr,
    settings?.next_100hr_maintenance_due_mr ?? null,
    MAINTENANCE_DUE_SOON_THRESHOLD,
  )

  return {
    settings,
    current_mr:                        currentMr,
    oil_change_status:                 oilResult.status,
    oil_change_hours_remaining:        oilResult.hoursRemaining,
    maintenance_100hr_status:          maintenanceResult.status,
    maintenance_100hr_hours_remaining: maintenanceResult.hoursRemaining,
  }
}

export async function updateAircraftMaintenanceSettings(
  aircraftId: string,
  data: {
    last_oil_change_mr?: number | null
    next_oil_change_due_mr?: number | null
    oil_change_interval_mr?: number
    last_100hr_maintenance_mr?: number | null
    next_100hr_maintenance_due_mr?: number | null
    maintenance_100hr_interval_mr?: number
    notes?: string | null
  },
): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  const { error } = await supabase
    .from('aircraft_maintenance_settings')
    .upsert(
      {
        aircraft_id: aircraftId,
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: adminId,
      },
      { onConflict: 'aircraft_id' },
    )

  if (error) throw new Error(error.message)

  revalidatePath('/admin/aircraft')
  revalidatePath(`/admin/aircraft/${aircraftId}/maintenance`)
  revalidatePath('/admin')
}

export async function markOilChangeDone(aircraftId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  // Get current MR from latest finalized log
  const { data: latestLog } = await supabase
    .from('aircraft_flight_logs')
    .select('mr_stop')
    .eq('aircraft_id', aircraftId)
    .in('review_status', ['admin_confirmed', 'admin_adjusted'])
    .order('log_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const currentMr = (latestLog?.mr_stop as number | null)
  if (currentMr == null) throw new Error('No finalized aircraft flight log found to determine current MR.')

  // Get interval from settings
  const { data: settings } = await supabase
    .from('aircraft_maintenance_settings')
    .select('oil_change_interval_mr')
    .eq('aircraft_id', aircraftId)
    .maybeSingle()

  const interval = (settings?.oil_change_interval_mr as number | null) ?? 50
  const nextDue  = Math.round((currentMr + interval) * 10) / 10

  const { error } = await supabase
    .from('aircraft_maintenance_settings')
    .upsert(
      {
        aircraft_id:           aircraftId,
        last_oil_change_mr:    currentMr,
        next_oil_change_due_mr: nextDue,
        updated_at:            new Date().toISOString(),
        updated_by:            adminId,
      },
      { onConflict: 'aircraft_id' },
    )

  if (error) throw new Error(error.message)

  revalidatePath('/admin/aircraft')
  revalidatePath(`/admin/aircraft/${aircraftId}/maintenance`)
  revalidatePath('/admin')
}

export async function mark100HrMaintenanceDone(aircraftId: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  const { data: latestLog } = await supabase
    .from('aircraft_flight_logs')
    .select('mr_stop')
    .eq('aircraft_id', aircraftId)
    .in('review_status', ['admin_confirmed', 'admin_adjusted'])
    .order('log_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const currentMr = (latestLog?.mr_stop as number | null)
  if (currentMr == null) throw new Error('No finalized aircraft flight log found to determine current MR.')

  const { data: settings } = await supabase
    .from('aircraft_maintenance_settings')
    .select('maintenance_100hr_interval_mr')
    .eq('aircraft_id', aircraftId)
    .maybeSingle()

  const interval = (settings?.maintenance_100hr_interval_mr as number | null) ?? 100
  const nextDue  = Math.round((currentMr + interval) * 10) / 10

  const { error } = await supabase
    .from('aircraft_maintenance_settings')
    .upsert(
      {
        aircraft_id:                   aircraftId,
        last_100hr_maintenance_mr:     currentMr,
        next_100hr_maintenance_due_mr: nextDue,
        updated_at:                    new Date().toISOString(),
        updated_by:                    adminId,
      },
      { onConflict: 'aircraft_id' },
    )

  if (error) throw new Error(error.message)

  revalidatePath('/admin/aircraft')
  revalidatePath(`/admin/aircraft/${aircraftId}/maintenance`)
  revalidatePath('/admin')
}

/**
 * Fetch maintenance alerts for all aircraft — used by the admin dashboard.
 * Uses admin client to bypass RLS since this runs server-side during page render.
 */
export async function getAllMaintenanceAlerts(): Promise<MaintenanceAlert[]> {
  const admin = createAdminClient()

  const { data: aircraft } = await admin
    .from('aircraft')
    .select('id, registration')
    .neq('status', 'inactive')
    .order('registration', { ascending: true })

  if (!aircraft?.length) return []

  const alerts: MaintenanceAlert[] = []

  await Promise.all(
    aircraft.map(async (a) => {
      const [{ data: settingsRow }, { data: latestLog }] = await Promise.all([
        admin
          .from('aircraft_maintenance_settings')
          .select('next_oil_change_due_mr, next_100hr_maintenance_due_mr, oil_change_interval_mr, maintenance_100hr_interval_mr')
          .eq('aircraft_id', a.id)
          .maybeSingle(),
        admin
          .from('aircraft_flight_logs')
          .select('mr_stop')
          .eq('aircraft_id', a.id)
          .in('review_status', ['admin_confirmed', 'admin_adjusted'])
          .order('log_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const currentMr          = (latestLog?.mr_stop as number | null) ?? null
      const nextOilDue         = (settingsRow?.next_oil_change_due_mr as number | null) ?? null
      const next100hrDue       = (settingsRow?.next_100hr_maintenance_due_mr as number | null) ?? null

      const oilResult          = computeMaintenanceStatus(currentMr, nextOilDue, OIL_DUE_SOON_THRESHOLD)
      const maintenanceResult  = computeMaintenanceStatus(currentMr, next100hrDue, MAINTENANCE_DUE_SOON_THRESHOLD)

      if (oilResult.status !== 'ok' || maintenanceResult.status !== 'ok') {
        alerts.push({
          aircraft_id:                   a.id,
          aircraft_registration:         a.registration,
          oil_change_status:             oilResult.status,
          maintenance_100hr_status:      maintenanceResult.status,
          current_mr:                    currentMr,
          next_oil_change_due_mr:        nextOilDue,
          next_100hr_maintenance_due_mr: next100hrDue,
          oil_hours_remaining:           oilResult.hoursRemaining,
          maintenance_hours_remaining:   maintenanceResult.hoursRemaining,
        })
      }
    }),
  )

  return alerts
}
