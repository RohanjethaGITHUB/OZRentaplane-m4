"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { recordManualPayment } from "@/app/actions/payment"

type Props = {
  bookingId: string
  amountCents: number
  bookingType: "checkout" | "standard"
}

type PaymentMethod = "cash" | "card_in_person" | "bank_transfer"

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card_in_person: "Card (in person)",
  bank_transfer: "Bank transfer",
}

export default function AdminBankTransferPanel({ bookingId, amountCents, bookingType }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer")
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2))
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    setSuccess(null)

    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Amount must be greater than zero.")
      return
    }

    const cents = Math.round(parsed * 100)

    startTransition(async () => {
      try {
        const result = await recordManualPayment({
          bookingId,
          paymentMethod: method,
          amountCents: cents,
          note: note.trim() || undefined,
        })

        if (!result?.success) {
          setError("Failed to record manual payment.")
          return
        }

        setSuccess(`Marked as paid via ${METHOD_LABEL[method]}.`)
        router.refresh()
      } catch (err: any) {
        setError(err?.message || "Failed to record manual payment.")
      }
    })
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-amber-400 text-[18px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          payments
        </span>
        <h2 className="text-[9px] uppercase tracking-widest font-bold text-amber-400/70">
          Manual Payment
        </h2>
        <span className="ml-auto px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {bookingType === "checkout" ? "Checkout" : "Standard"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {(["cash", "card_in_person", "bank_transfer"] as PaymentMethod[]).map((option) => {
          const active = method === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => setMethod(option)}
              disabled={isPending}
              className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                  : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
              }`}
            >
              {METHOD_LABEL[option]}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 block mb-1.5">Amount</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-white/20"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 block mb-1.5">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            placeholder="Internal note"
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-white/20"
          />
        </label>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {success ? <p className="text-xs text-green-400">{success}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full md:w-auto px-4 py-2.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/20 text-green-300 text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
      >
        {isPending ? "Recording..." : "Mark as paid"}
      </button>
    </div>
  )
}
