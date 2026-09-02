"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { recordManualPayment } from "@/app/actions/payment"
import { LoadingButtonContent } from '@/components/ui/Spinner'

type Props = {
  bookingId: string
  amountCents: number
  bookingType: "checkout" | "standard"
  variant?: "pre_invoice" | "admin_override"
  /** When true, invoice has already been issued to the customer. */
  invoiceIssued?: boolean
}

type PaymentMethod = "cash" | "card_in_person" | "bank_transfer"

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card_in_person: "Card (in person)",
  bank_transfer: "Bank transfer",
}

const DISABLED_MARK_PAID_TOOLTIP =
  "Mark as Paid is disabled until the customer submits payment proof in the portal, or you confirm a direct settlement with the checkbox above."

export default function AdminBankTransferPanel({
  bookingId,
  amountCents,
  bookingType,
  variant = "pre_invoice",
  invoiceIssued = false,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer")
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2))
  const [note, setNote] = useState("")
  const [directSettlementConfirmed, setDirectSettlementConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isOverride = variant === "admin_override"
  const canMarkAsPaid = !isOverride || directSettlementConfirmed
  const markAsPaidDisabled = isPending || !canMarkAsPaid

  function handleSubmit() {
    setError(null)
    setSuccess(null)

    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Amount must be greater than zero.")
      return
    }

    if (isOverride && !directSettlementConfirmed) {
      setError("Confirm the direct settlement checkbox before marking this invoice as paid.")
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

  const overrideTitle = invoiceIssued
    ? "Record Direct Payment Settlement"
    : "Confirm Payment Without Portal Submission"

  const overrideDescription = invoiceIssued
    ? "An invoice has been sent and is awaiting customer payment in the portal. Use this only if you have spoken with the customer and payment was settled directly (cash, card in person, or bank transfer sighted)."
    : "Use this only when the customer has paid directly (e.g. bank transfer sighted in the account) but has not logged in to submit proof."

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
          {isOverride ? overrideTitle : "Manual Payment"}
        </h2>
        <span className="ml-auto px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-[#1a4fd6] border border-blue-500/20">
          {bookingType === "checkout" ? "Checkout" : "Standard"}
        </span>
      </div>
      {isOverride && (
        <p className="text-[14px] text-amber-800 -mt-2">
          {overrideDescription}
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
            Note (optional)
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

      {isOverride ? (
        <label className="flex items-start gap-3 rounded-xl border border-amber-300/80 bg-white/70 px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={directSettlementConfirmed}
            onChange={(e) => setDirectSettlementConfirmed(e.target.checked)}
            disabled={isPending}
            className="mt-1 h-4 w-4 rounded border-[#152d5a]/30 text-[#1a4fd6] focus:ring-[#1a4fd6]/30"
          />
          <span className="text-[13px] leading-relaxed text-[#152d5a]">
            I have spoken with the customer and confirmed payment was settled directly. I am proceeding to mark this as paid without portal-submitted proof.
          </span>
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}

      <div className="relative group/mark-paid inline-flex w-full md:w-auto">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={markAsPaidDisabled}
          aria-busy={isPending || undefined}
          aria-disabled={markAsPaidDisabled || undefined}
          className="w-full md:w-auto px-6 py-3.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[13px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:hover:bg-green-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <LoadingButtonContent loading={isPending} loadingLabel="Recording...">
            Mark as paid
          </LoadingButtonContent>
        </button>
        {markAsPaidDisabled && !isPending ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-72 rounded-lg border border-[#152d5a]/15 bg-[#0f1c33] px-3 py-2 text-[12px] font-medium leading-relaxed text-white shadow-lg group-hover/mark-paid:block"
          >
            {DISABLED_MARK_PAID_TOOLTIP}
          </div>
        ) : null}
      </div>
    </div>
  )
}
