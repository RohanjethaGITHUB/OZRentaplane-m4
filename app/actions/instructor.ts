'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { InstructorAircraftClearance, Profile } from '@/lib/supabase/types'

export type InstructorApplicationState = {
  hasInstructorClearance: boolean
  clearanceStatus: string | null // 'approved' | 'pending' | 'suspended' | null
  activeCheckoutBooking: {
    id: string
    status: string
    booking_reference: string
    scheduled_start: string
    scheduled_end: string
    checkout_type?: string
    aircraft_id: string
  } | null
  approvedAircraftIds: string[]
  pendingAircraftIds: string[]
  unpaidInvoicesCount: number
}

export type InstructorDirectoryItem = {
  id: string
  fullName: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  pilotArn: string | null
  role: string
  joinedAt: string
  accountStatus: string
  clearances: {
    aircraftId: string
    registration: string
    aircraftType: string
    displayName: string
    clearanceStatus: string
    clearedAt: string | null
  }[]
  activeCheckoutCount: number
  totalInstructionalHours?: number
}

/**
 * Fetch current user's instructor application and clearance state
 */
export async function getInstructorApplicationStatus(targetAircraftId?: string): Promise<InstructorApplicationState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      hasInstructorClearance: false,
      clearanceStatus: null,
      activeCheckoutBooking: null,
      approvedAircraftIds: [],
      pendingAircraftIds: [],
      unpaidInvoicesCount: 0,
    }
  }

  const [clearancesRes, activeBookingRes, unpaidInvoicesRes] = await Promise.all([
    supabase
      .from('instructor_aircraft_clearances')
      .select('aircraft_id, clearance_status, cleared_at')
      .eq('instructor_id', user.id),
    supabase
      .from('bookings')
      .select('id, status, booking_reference, scheduled_start, scheduled_end, checkout_type, aircraft_id')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'checkout')
      .eq('checkout_type', 'instructor')
      .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('booking_invoices')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['unpaid', 'overdue', 'payment_pending']),
  ])

  const clearances = clearancesRes.data ?? []
  const approvedAircraftIds = clearances.filter(c => c.clearance_status === 'approved').map(c => c.aircraft_id)
  const pendingAircraftIds = clearances.filter(c => c.clearance_status === 'pending').map(c => c.aircraft_id)

  let clearanceStatus: string | null = null
  if (targetAircraftId) {
    const match = clearances.find(c => c.aircraft_id === targetAircraftId)
    clearanceStatus = match ? match.clearance_status : null
  } else if (approvedAircraftIds.length > 0) {
    clearanceStatus = 'approved'
  } else if (pendingAircraftIds.length > 0) {
    clearanceStatus = 'pending'
  }

  return {
    hasInstructorClearance: approvedAircraftIds.length > 0,
    clearanceStatus,
    activeCheckoutBooking: activeBookingRes.data ?? null,
    approvedAircraftIds,
    pendingAircraftIds,
    unpaidInvoicesCount: unpaidInvoicesRes.data?.length ?? 0,
  }
}

/**
 * Fetch all instructors and candidates for Admin Instructors Directory
 */
export async function getAdminInstructorsDirectory(): Promise<InstructorDirectoryItem[]> {
  const admin = createAdminClient()

  // 1. Fetch all profiles that have role instructor or have clearances or instructor checkouts
  const [profilesRes, aircraftRes, clearancesRes, activeInstructorBookingsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, phone_number, phone_country_code, pilot_arn, role, account_status, created_at')
      .order('created_at', { ascending: false }),
    admin
      .from('aircraft')
      .select('id, registration, aircraft_type, display_name'),
    admin
      .from('instructor_aircraft_clearances')
      .select('instructor_id, aircraft_id, clearance_status, cleared_at'),
    admin
      .from('bookings')
      .select('booking_owner_user_id, checkout_type, status')
      .eq('booking_type', 'checkout')
      .eq('checkout_type', 'instructor')
      .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review']),
  ])

  const profiles = profilesRes.data ?? []
  const aircraftList = aircraftRes.data ?? []
  const clearances = clearancesRes.data ?? []
  const activeBookings = activeInstructorBookingsRes.data ?? []

  const aircraftMap = new Map(aircraftList.map(a => [a.id, a]))

  // Filter profiles that are instructors, have clearances, or have an active instructor checkout
  const instructorProfiles = profiles.filter(p => {
    if (p.role === 'instructor') return true
    const hasClearance = clearances.some(c => c.instructor_id === p.id)
    if (hasClearance) return true
    const hasActiveBooking = activeBookings.some(b => b.booking_owner_user_id === p.id)
    return hasActiveBooking
  })

  return instructorProfiles.map(p => {
    const userClearances = clearances.filter(c => c.instructor_id === p.id).map(c => {
      const plane = aircraftMap.get(c.aircraft_id)
      return {
        aircraftId: c.aircraft_id,
        registration: plane?.registration ?? 'Unknown',
        aircraftType: plane?.aircraft_type ?? '',
        displayName: plane?.display_name || plane?.aircraft_type || plane?.registration || 'Aircraft',
        clearanceStatus: c.clearance_status,
        clearedAt: c.cleared_at,
      }
    })

    const userActiveBookingsCount = activeBookings.filter(b => b.booking_owner_user_id === p.id).length

    const phoneStr = p.phone_number 
      ? `${p.phone_country_code ? p.phone_country_code + ' ' : ''}${p.phone_number}`
      : null

    return {
      id: p.id,
      fullName: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed Pilot',
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: phoneStr,
      pilotArn: p.pilot_arn,
      role: p.role,
      joinedAt: p.created_at,
      accountStatus: p.account_status || 'active',
      clearances: userClearances,
      activeCheckoutCount: userActiveBookingsCount,
    }
  })
}

/**
 * Admin action to grant or update an instructor's aircraft clearance
 */
export async function updateInstructorAircraftClearance(
  instructorId: string,
  aircraftId: string,
  status: 'approved' | 'pending' | 'suspended' | 'revoked',
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (adminProfile?.role !== 'admin') throw new Error('Forbidden: Admin access required')

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // 1. Update/insert clearance
  await admin
    .from('instructor_aircraft_clearances')
    .upsert({
      instructor_id: instructorId,
      aircraft_id: aircraftId,
      clearance_status: status,
      cleared_at: status === 'approved' ? now : null,
      cleared_by: status === 'approved' ? user.id : null,
      notes: notes ?? null,
      updated_at: now,
    }, { onConflict: 'instructor_id,aircraft_id' })

  // 2. Ensure instructor role in user_roles and profiles if approved
  if (status === 'approved') {
    await admin
      .from('user_roles')
      .upsert({
        user_id: instructorId,
        role: 'instructor',
        granted_by: user.id,
        granted_at: now,
      }, { onConflict: 'user_id,role' })
  }

  revalidatePath('/admin/customers/instructors')
  revalidatePath('/dashboard/instructor')
  return { ok: true }
}

export type InstructorFleetClearanceItem = {
  aircraftId: string
  registration: string
  aircraftType: string
  displayName: string
  status: string
  imageUrl?: string
  clearanceStatus: 'approved' | 'pending' | 'suspended' | 'not_started'
  clearedAt: string | null
  activeBookingId?: string
  activeBookingStatus?: string
}

export type InstructorStudentItem = {
  id: string
  studentId: string
  name: string
  email: string
  phone: string | null
  pilotArn: string | null
  clearanceStatus: string
  status: string
  assignedAt: string
  notes: string | null
  flightCount: number
  totalHours: number
}

/**
 * Get all fleet aircraft and their clearance status for the logged-in instructor
 */
export async function getInstructorFleetClearances(): Promise<InstructorFleetClearanceItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const [aircraftRes, clearancesRes, bookingsRes] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, registration, aircraft_type, display_name, status')
      .order('registration', { ascending: true }),
    supabase
      .from('instructor_aircraft_clearances')
      .select('aircraft_id, clearance_status, cleared_at')
      .eq('instructor_id', user.id),
    supabase
      .from('bookings')
      .select('id, aircraft_id, status, checkout_type')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'checkout')
      .eq('checkout_type', 'instructor')
      .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review']),
  ])

  const aircraftList = aircraftRes.data ?? []
  const clearances = clearancesRes.data ?? []
  const bookings = bookingsRes.data ?? []

  return aircraftList.map((plane) => {
    const clearance = clearances.find((c) => c.aircraft_id === plane.id)
    const activeBooking = bookings.find((b) => b.aircraft_id === plane.id)

    let clearanceStatus: 'approved' | 'pending' | 'suspended' | 'not_started' = 'not_started'
    if (clearance?.clearance_status === 'approved') {
      clearanceStatus = 'approved'
    } else if (clearance?.clearance_status === 'suspended') {
      clearanceStatus = 'suspended'
    } else if (clearance?.clearance_status === 'pending' || activeBooking) {
      clearanceStatus = 'pending'
    }

    const reg = plane.registration?.toUpperCase() || ''
    const img = reg.includes('KZG') ? '/Cessna-fleet.png' : reg.includes('ABC') ? '/instructor/piper-aircraft-clean.png' : '/CessnaTarmac.webp'

    return {
      aircraftId: plane.id,
      registration: plane.registration,
      aircraftType: plane.aircraft_type || 'Aircraft',
      displayName: plane.display_name || plane.aircraft_type || plane.registration,
      status: plane.status,
      imageUrl: img,
      clearanceStatus,
      clearedAt: clearance?.cleared_at ?? null,
      activeBookingId: activeBooking?.id,
      activeBookingStatus: activeBooking?.status,
    }
  })
}

/**
 * Get all students assigned to the current instructor
 */
export async function getInstructorStudents(): Promise<InstructorStudentItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: relations, error } = await admin
    .from('instructor_students')
    .select('id, student_id, status, assigned_at, notes')
    .eq('instructor_id', user.id)
    .order('assigned_at', { ascending: false })

  if (error || !relations || relations.length === 0) return []

  const studentIds = relations.map((r) => r.student_id)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, phone_number, phone_country_code, pilot_arn, pilot_clearance_status')
    .in('id', studentIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return relations.map((rel) => {
    const prof = profileMap.get(rel.student_id)
    const fullName = prof?.full_name || [prof?.first_name, prof?.last_name].filter(Boolean).join(' ') || 'Unnamed Student'
    const phone = prof?.phone_number
      ? `${prof.phone_country_code ? prof.phone_country_code + ' ' : ''}${prof.phone_number}`
      : null

    return {
      id: rel.id,
      studentId: rel.student_id,
      name: fullName,
      email: prof?.email || '',
      phone,
      pilotArn: prof?.pilot_arn || null,
      clearanceStatus: prof?.pilot_clearance_status || 'checkout_required',
      status: rel.status,
      assignedAt: rel.assigned_at,
      notes: rel.notes,
      flightCount: 0,
      totalHours: 0,
    }
  })
}

/**
 * Add / link a student to this instructor by email or Pilot ARN
 */
export async function addInstructorStudent(
  identifier: string,
  notes?: string
): Promise<{ ok: boolean; message?: string; student?: InstructorStudentItem }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const cleanId = identifier.trim().toLowerCase()

  // Find user by email or ARN
  const { data: matchedProfiles } = await admin
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, phone_number, phone_country_code, pilot_arn, pilot_clearance_status')
    .or(`email.ilike.${cleanId},pilot_arn.ilike.${cleanId}`)
    .limit(1)

  const studentProfile = matchedProfiles?.[0]
  if (!studentProfile) {
    return { ok: false, message: `No registered pilot found matching "${identifier}". Please check the email or ARN.` }
  }

  if (studentProfile.id === user.id) {
    return { ok: false, message: 'You cannot add yourself as a student.' }
  }

  // Insert or update assignment
  const { data: inserted, error: insertErr } = await admin
    .from('instructor_students')
    .upsert({
      instructor_id: user.id,
      student_id: studentProfile.id,
      status: 'active',
      notes: notes?.trim() || null,
      assigned_at: new Date().toISOString(),
    }, { onConflict: 'instructor_id,student_id' })
    .select('id, assigned_at, status, notes')
    .single()

  if (insertErr || !inserted) {
    return { ok: false, message: 'Failed to assign student. Please try again.' }
  }

  revalidatePath('/dashboard/instructor')

  const fullName = studentProfile.full_name || [studentProfile.first_name, studentProfile.last_name].filter(Boolean).join(' ') || 'Unnamed Student'
  const phone = studentProfile.phone_number
    ? `${studentProfile.phone_country_code ? studentProfile.phone_country_code + ' ' : ''}${studentProfile.phone_number}`
    : null

  return {
    ok: true,
    student: {
      id: inserted.id,
      studentId: studentProfile.id,
      name: fullName,
      email: studentProfile.email || '',
      phone,
      pilotArn: studentProfile.pilot_arn || null,
      clearanceStatus: studentProfile.pilot_clearance_status || 'checkout_required',
      status: 'active',
      assignedAt: inserted.assigned_at,
      notes: inserted.notes,
      flightCount: 0,
      totalHours: 0,
    },
  }
}

/**
 * Remove or deactivate student assignment
 */
export async function removeInstructorStudent(studentId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  await admin
    .from('instructor_students')
    .delete()
    .eq('instructor_id', user.id)
    .eq('student_id', studentId)

  revalidatePath('/dashboard/instructor')
  return { ok: true }
}

