"use client";

import { useEffect, useRef } from "react";
import { CalendarDays, Clock3, PencilLine, X } from "lucide-react";
import ModalPortal from "@/components/ModalPortal";
import { formatDate } from "@/lib/formatDateTime";
import type { CreateBookingInput } from "@/lib/supabase/booking-types";
import RunwaySwipeConfirm from "./RunwaySwipeConfirm";

export type BookingReviewDraft = {
  bookingMode: "single" | "multi";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  bookingSummaryDurationLabel: string;
  estimatedHours: number | null;
  estimatedRate: number;
  bookingDayCount: number;
  multiDayMinimumVdoHours: number | null;
  input: CreateBookingInput & {
    bookingMode: "single" | "multi";
    returnDate: string | null;
    returnTime: string | null;
  };
};

type Props = {
  open: boolean;
  draft: BookingReviewDraft | null;
  error: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onSwipeError: (message: string) => void;
};

function formatTimeLabel(time: string): string {
  if (!time) return "—";
  const [hours, minutes] = time.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function formatRate(rate: number): string {
  return `$${Math.round(rate).toLocaleString("en-AU")}/hr`;
}

export default function BookingReviewModal({
  open,
  draft,
  error,
  onClose,
  onConfirm,
  onSwipeError,
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !draft) return null;

  const { bookingMode, startDate, startTime, endDate, endTime } = draft;
  const title = bookingMode === "multi" ? "Review your booking request" : "Review your booking request";
  const bookingTypeLabel = bookingMode === "multi" ? "Multi-day hire" : "Single day hire";
  const bookingWindowLabel = bookingMode === "multi" ? "Booking window" : "Estimated duration";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <button
          type="button"
          aria-label="Close booking review dialog"
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-review-title"
          className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-[#dbe3ef] bg-[#ffffff] text-[#152d5a] shadow-[0_24px_80px_rgba(21,45,90,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute inset-x-0 top-0 h-1.5 bg-[#1a4fd6]" />

          <div className="flex items-start gap-4 px-6 pb-5 pt-6 sm:px-8 sm:pb-6">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f0f6ff] text-[#1a4fd6]">
              <PencilLine className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                Ready to submit
              </p>
              <h3
                id="booking-review-title"
                className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl"
              >
                {title}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4b6390]">
                Slide the runway handle to confirm this booking. You can go back and edit before submitting if anything looks off.
              </p>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f1f5f9] hover:text-[#152d5a]"
              aria-label="Close booking review dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-6 pb-6 sm:px-8">
            <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_0_rgba(21,45,90,0.02)]">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">
                  <CalendarDays className="h-4 w-4" />
                  Booking summary
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4 border-b border-[#edf2f7] pb-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">Date</p>
                      <p className="mt-2 text-sm font-medium text-[#152d5a]">
                        {bookingMode === "single"
                          ? formatDate(startDate)
                          : `${formatDate(startDate)} to ${formatDate(endDate)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">Type</p>
                      <p className="mt-2 text-sm font-semibold text-[#1a4fd6]">{bookingTypeLabel}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">Start</p>
                      <p className="mt-2 text-sm font-medium text-[#152d5a]">{formatTimeLabel(startTime)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">Return</p>
                      <p className="mt-2 text-sm font-medium text-[#152d5a]">{formatTimeLabel(endTime)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">
                        {bookingWindowLabel}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[#1a4fd6]">
                        {draft.bookingSummaryDurationLabel}
                      </p>
                    </div>
                  </div>

                  {bookingMode === "multi" && draft.bookingDayCount > 0 ? (
                    <div className="rounded-xl border border-[#dbe7f4] bg-[#f8fbff] px-4 py-3 text-sm text-[#4b6390]">
                      Minimum billable VDO: {draft.multiDayMinimumVdoHours ?? "—"} hours across {draft.bookingDayCount} day{draft.bookingDayCount === 1 ? "" : "s"}.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_1px_0_rgba(21,45,90,0.02)]">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">
                  <Clock3 className="h-4 w-4" />
                  Pricing summary
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 border-b border-[#edf2f7] pb-3">
                    <span className="text-sm text-[#6b7280]">Billing type</span>
                    <span className="text-sm font-semibold text-[#152d5a]">Actual VDO hours flown</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-[#edf2f7] pb-3">
                    <span className="text-sm text-[#6b7280]">Hire type</span>
                    <span className="text-sm font-semibold text-[#152d5a]">Wet hire · GST incl.</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#6b7280]">Rate</span>
                    <span className="text-lg font-semibold text-[#1a4fd6]">{formatRate(draft.estimatedRate)}</span>
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl border border-[#e2e8f0] bg-[#f8fbff] p-4">
              <RunwaySwipeConfirm onConfirm={onConfirm} onError={onSwipeError} />
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
