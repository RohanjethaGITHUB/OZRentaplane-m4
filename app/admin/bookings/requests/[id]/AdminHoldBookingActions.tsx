import { cancelOnHoldBooking } from './actions'

export default function AdminHoldBookingActions({ bookingId }: { bookingId: string }) {
  const action = cancelOnHoldBooking.bind(null, bookingId)

  return (
    <form action={action} className="space-y-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-rose-300">
          Cancel booking
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-rose-100/70">
          Use this if you want to cancel the booking instead of waiting for document approval.
        </p>
      </div>

      <textarea
        name="reason"
        required
        rows={4}
        placeholder="Reason for cancellation..."
        className="w-full rounded-xl border border-rose-500/20 bg-[#0f1320] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-400/40 resize-none"
      />

      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-500"
      >
        <span className="material-symbols-outlined text-[18px]">cancel</span>
        Cancel booking
      </button>
    </form>
  )
}
