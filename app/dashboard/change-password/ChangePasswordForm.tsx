'use client'

import { useActionState } from 'react'
import { changePassword, type ChangePasswordState } from './actions'
import { LoadingButtonContent } from '@/components/ui/Spinner'

const initialState: ChangePasswordState = {
  error: null,
}

export default function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">New password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#152d5a] focus:ring-1 focus:ring-[#152d5a]"
          placeholder="At least 8 characters"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Confirm password</span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#152d5a] focus:ring-1 focus:ring-[#152d5a]"
          placeholder="Repeat your new password"
        />
      </label>

      {state.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        className="w-full rounded-xl bg-[#152d5a] py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#1d3d79] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2"
      >
        <LoadingButtonContent loading={isPending} loadingLabel="Setting password...">
          Set password
        </LoadingButtonContent>
      </button>
    </form>
  )
}
