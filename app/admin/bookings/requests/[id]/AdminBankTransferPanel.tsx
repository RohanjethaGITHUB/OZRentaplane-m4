"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { recordManualPayment } from "@/app/actions/payment"

type Props = {
  bookingId: string
  amountCents: number
  bookingType: "checkout" | "standard"
  variant?: "pre_invoice" | "admin_override"
}

type PaymentMethod = "cash" | "card_in_person" | "bank_transfer"

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card_in_person: "Card (in person)",
  bank_transfer: "Bank transfer",
}

export default function AdminBankTransferPanel({ bookingId, amountCents, bookingType, variant = "pre_invoice" }: Props) {
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

    if (variant === "admin_override" && note.trim().length === 0) {
      setError("A note is required when confirming payment without customer-submitted proof (e.g. bank statement reference, date sighted).")
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

  const isOverride = variant === "admin_override"

  return (
    <div
      className={`rounded-2xl p-6 space-y-5 border ${
        isOverride ? "bg-amber-50 border-amber-300" : "bg-white border-[#152d5a]/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`material-symbols-outlined text-[18px] ${isOverride ? "text-amber-600" : "text-[#1a4fd6]"}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          payments
        </span>
        <h2 className={`text-[11px] uppercase tracking-widest font-bold ${isOverride ? "text-amber-700" : "text-[#4b6390]"}`}>
          {isOverride ? "Confirm Payment Without Portal Submission" : "Manual Payment"}
        </h2>
        <span className="ml-auto px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-[#1a4fd6] border border-blue-500/20">
          {bookingType === "checkout" ? "Checkout" : "Standard"}
        </span>
      </div>
      {isOverride && (
        <p className="text-[14px] text-amber-800 -mt-2">
          Use this only when the customer has paid directly (e.g. bank transfer sighted in the account) but has not logged in to submit proof. Adding a note is required.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {(["cash", "card_in_person", "bank_transfer"] as PaymentMethod[]).map((option) => {
          const active = method === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => setMethod(option)}
              disabled={isPending}
              className={`rounded-lg border px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "border-[#1a4fd6]/40 bg-[#1a4fd6]/10 text-[#1a4fd6]"
                  : "border-[#152d5a]/10 bg-white text-[#4b6390] hover:border-[#152d5a]/25"
              }`}
            >
              {METHOD_LABEL[option]}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[12px] uppercase tracking-widest font-semibold text-[#4b6390] block mb-2">Amount</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-4 py-3 text-base text-[#152d5a] focus:outline-none focus:border-[#1a4fd6]/40"
          />
        </label>
        <label className="block">
          <span className="text-[12px] uppercase tracking-widest font-semibold text-[#4b6390] block mb-2">
            {isOverride ? "Note (required — payment reference / date sighted)" : "Note (optional)"}
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            placeholder="Internal note"
            className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-4 py-3 text-base text-[#152d5a] placeholder:text-slate-400 focus:outline-none focus:border-[#1a4fd6]/40"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full md:w-auto px-6 py-3.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[13px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
      >
        {isPending ? "Recording..." : "Mark as paid"}
      </button>
    </div>
  )
}
