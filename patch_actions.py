import sys, re

def patch_booking():
    with open('app/actions/booking.ts', 'r') as f:
        content = f.read()

    # The block starts right after `const now = new Date().toISOString()`
    # We want to replace everything from `// Insert flight record` down to the end of `// Audit event` insert.
    # We will replace it with the RPC call.

    # Match from:
    #   // Insert flight record
    # to:
    #       },
    #     })

    start_str = "// Insert flight record"
    end_str = "revalidatePath('/dashboard')"

    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx == -1 or end_idx == -1:
        print("Failed to find boundaries in booking.ts")
        sys.exit(1)

    rpc_call = """// Call atomic RPC
  const { data: frId, error: submitError } = await supabase.rpc('submit_flight_record_atomic', {
    p_booking_id:              input.booking_id,
    p_date:                    input.date,
    p_pic_name:                input.pic_name           ?? null,
    p_pic_arn:                 input.pic_arn            ?? null,
    p_tacho_start:             input.tacho_start        ?? null,
    p_tacho_stop:              input.tacho_stop         ?? null,
    p_vdo_start:               input.vdo_start          ?? null,
    p_vdo_stop:                input.vdo_stop           ?? null,
    p_air_switch_start:        input.air_switch_start   ?? null,
    p_air_switch_stop:         input.air_switch_stop    ?? null,
    p_add_to_mr:               input.add_to_mr          ?? null,
    p_oil_added:               input.oil_added          ?? null,
    p_oil_total:               input.oil_total          ?? null,
    p_fuel_added:              input.fuel_added         ?? null,
    p_fuel_actual:             input.fuel_actual        ?? null,
    p_landings:                input.landings           ?? null,
    p_customer_notes:          input.customer_notes     ?? null,
    p_declaration_accepted:    input.declaration_accepted ?? false,
    p_signature_type:          input.signature_type     ?? 'none',
    p_signature_value:         input.signature_value    ?? null,
    p_review_flags:            flags.length > 0 ? flags : null,
  })

  if (submitError || !frId) {
    console.error('[submitFlightRecord] RPC failed:', submitError)
    throw new Error(submitError?.message || 'Failed to submit flight record. Please try again.')
  }

  """
    
    new_content = content[:start_idx] + rpc_call + content[end_idx:]
    
    with open('app/actions/booking.ts', 'w') as f:
        f.write(new_content)
    print("Patched booking.ts")

def patch_admin_booking():
    with open('app/actions/admin-booking.ts', 'r') as f:
        content = f.read()

    # Patch createAdminScheduleBlock
    # Replace from // Check for conflicts ... down to revalidatePath
    start_str_1 = "// Check for conflicts (no buffer expansion for admin blocks)"
    end_str_1 = "revalidatePath('/admin')"
    
    start_idx_1 = content.find(start_str_1)
    end_idx_1 = content.find(end_str_1)

    rpc_call_1 = """// Delegate to atomic RPC check
  const { data, error } = await supabase.rpc('create_admin_schedule_block_atomic', {
    p_aircraft_id:        input.aircraft_id,
    p_related_booking_id: input.related_booking_id ?? null,
    p_block_type:         input.block_type,
    p_start_time:         input.start_time,
    p_end_time:           input.end_time,
    p_public_label:       input.public_label    ?? null,
    p_internal_reason:    input.internal_reason ?? null,
    p_is_public_visible:  input.is_public_visible ?? false,
    p_expires_at:         input.expires_at ?? null,
    p_exclude_booking_id: input.exclude_booking_id ?? null,
    p_force_override:     input.force_override ?? false,
  })

  if (error) {
    console.error('[createAdminScheduleBlock] RPC failed:', error)
    throw new Error(error.message || 'Failed to create schedule block.')
  }

  const result = data as any
  if (!result.created) {
    return { created: false, conflicts: result.conflicts }
  }

  """
    content = content[:start_idx_1] + rpc_call_1 + content[end_idx_1:]

    # Patch approvePostFlightReview
    # Replace from // Fetch flight record ... to revalidatePath('/admin')
    start_str_2 = "// Fetch flight record with its meter readings"
    end_str_2 = "revalidatePath('/admin')"

    start_idx_2 = content.find(start_str_2)
    end_idx_2 = content.find(end_str_2)

    rpc_call_2 = """// Delegate to atomic RPC execution
  const { error } = await supabase.rpc('approve_post_flight_review_atomic', {
    p_flight_record_id:    input.flight_record_id,
    p_with_correction:     input.with_correction ?? false,
    p_admin_notes:         input.admin_notes ?? null,
    p_correction_reason:   input.correction_reason ?? null,
    p_admin_booking_notes: input.admin_booking_notes ?? null,
  })

  if (error) {
    console.error('[approvePostFlightReview] RPC failed:', error)
    throw new Error(error.message || 'Failed to approve flight record.')
  }

  """
    content = content[:start_idx_2] + rpc_call_2 + content[end_idx_2:]

    # Remove the unused checkAircraftAvailability import since it's no longer used in admin-booking.ts
    content = content.replace("import { checkAircraftAvailability } from '@/lib/booking/availability'\n", "")

    with open('app/actions/admin-booking.ts', 'w') as f:
        f.write(content)
    print("Patched admin-booking.ts")

patch_booking()
patch_admin_booking()
