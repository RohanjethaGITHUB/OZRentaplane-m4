'use client'

import { useState, useTransition } from 'react'
import { changePassword } from './actions'
import Link from 'next/link'
import { LoadingButtonContent } from '@/components/ui/Spinner'

export default function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await changePassword(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-[#152d5a] focus:outline-none focus:ring-1 focus:ring-[#152d5a]"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-[#152d5a] focus:outline-none focus:ring-1 focus:ring-[#152d5a]"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        className="w-full rounded-xl bg-[#152d5a] text-white py-3 text-base font-semibold shadow-sm transition-colors hover:bg-[#1e3f7a] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <LoadingButtonContent loading={isPending} loadingLabel="Setting password...">
          Set password
        </LoadingButtonContent>
      </button>

      <Link 
        href="/dashboard?skip_password_prompt=1" 
        className="block text-center text-sm text-slate-400 hover:text-slate-600 mt-3 transition-colors"
      >
        Skip for now — I'll do this later
      </Link>
    </form>
  )
}
