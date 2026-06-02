'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomerAccount } from '@/app/actions/admin-customers'

export default function NewCustomerForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = event.currentTarget
    const formData = new FormData(form)

    const fullName = String(formData.get('fullName') ?? '')
    const email = String(formData.get('email') ?? '')
    const phone = String(formData.get('phone') ?? '')
    const pilotArnValue = String(formData.get('pilotArn') ?? '').trim()

    startTransition(async () => {
      const result = await createCustomerAccount({
        fullName,
        email,
        phone,
        pilotArn: pilotArnValue || undefined,
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      form.reset()
      router.push(`/admin/users/${result.customerId}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--admin-text)]">Full name</span>
          <input
            type="text"
            name="fullName"
            required
            className="h-11 w-full rounded-xl border border-[#152d5a]/15 bg-white px-3.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8"
            placeholder="Enter customer full name"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--admin-text)]">Email address</span>
          <input
            type="email"
            name="email"
            required
            className="h-11 w-full rounded-xl border border-[#152d5a]/15 bg-white px-3.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8"
            placeholder="customer@example.com"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--admin-text)]">Phone number</span>
          <input
            type="tel"
            name="phone"
            required
            className="h-11 w-full rounded-xl border border-[#152d5a]/15 bg-white px-3.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8"
            placeholder="Enter phone number"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-[var(--admin-text)]">Pilot ARN (optional)</span>
          <input
            type="text"
            name="pilotArn"
            className="h-11 w-full rounded-xl border border-[#152d5a]/15 bg-white px-3.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8"
            placeholder="Enter ARN if provided"
          />
        </label>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-lg bg-[#152d5a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d3d79] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Creating account...' : 'Create customer account'}
        </button>
      </div>
    </form>
  )
}
