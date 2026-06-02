'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send-email'
import { customerWelcomeAdminEmail } from '@/lib/email/templates/customer-welcome-admin'

type CreateCustomerInput = {
  email: string
  fullName: string
  phone: string
  pilotArn?: string
}

export async function createCustomerAccount(input: CreateCustomerInput): Promise<
  { success: true; customerId: string } | { success: false; error: string }
> {
  try {
    const { adminId } = await requireAdmin()

    const email = input.email.trim().toLowerCase()
    const fullName = input.fullName.trim()
    const phone = input.phone.trim()
    const pilotArn = input.pilotArn?.trim() || null
    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://www.ozrentaplane.com'

    if (!email || !fullName || !phone) {
      return { success: false, error: 'Full name, email, and phone are required.' }
    }

    const admin = createAdminClient()

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createUserError || !createdUser.user) {
      return { success: false, error: createUserError?.message ?? 'Failed to create customer account.' }
    }

    const customerId = createdUser.user.id
    const { firstName, lastName } = splitName(fullName)

    const profileUpdate = {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      phone_number: phone,
      pilot_arn: pilotArn,
      is_admin_created: true,
      created_by_admin_id: adminId,
    }

    let profileUpdated = false
    let lastProfileError: string | null = null

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt))
      }

      const { error: profileError } = await admin
        .from('profiles')
        .update(profileUpdate as never)
        .eq('id', customerId)

      if (!profileError) {
        profileUpdated = true
        break
      }

      lastProfileError = profileError.message
    }

    if (!profileUpdated) {
      return { success: false, error: lastProfileError ?? 'Customer was created, but profile update failed.' }
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ozrentaplane.com'}/auth/update-password`,
      },
    })

    if (linkError || !linkData?.properties?.action_link) {
      return { success: false, error: linkError?.message ?? 'Customer was created, but the password setup link could not be generated.' }
    }

    const rawActionLink = linkData.properties.action_link
    const linkUrl = new URL(rawActionLink)
    const actionLink = `${linkUrl.origin}/auth/update-password${linkUrl.hash}`

    const emailTemplate = customerWelcomeAdminEmail({
      fullName,
      email,
      actionLink,
    })

    await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      eventType: 'admin_customer_welcome',
      entityType: 'user',
      entityId: customerId,
      metadata: { createdByAdminId: adminId },
    })

    revalidatePath('/admin/customers')
    revalidatePath('/admin/customers/all')

    return { success: true, customerId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error creating customer account.'
    if (message.startsWith('VALIDATION:')) {
      return { success: false, error: message.replace(/^VALIDATION:\s*/, '') }
    }
    if (message === 'Unauthorized') {
      return { success: false, error: 'You must be signed in to perform this action.' }
    }
    if (message === 'Forbidden') {
      return { success: false, error: 'Only admins can create customer accounts.' }
    }
    return { success: false, error: message }
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  const [firstName, ...rest] = normalized.split(' ')
  return {
    firstName,
    lastName: rest.length > 0 ? rest.join(' ') : null,
  }
}
