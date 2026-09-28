"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock3, PencilLine, X } from "lucide-react";
import ModalPortal from "@/components/ModalPortal";
import { formatDate } from "@/lib/formatDateTime";
import RunwaySwipeConfirm from "./RunwaySwipeConfirm";

export type BookingReviewDraft = {
  bookingMode: "single" | "multi";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  bookingSummaryDurationLabel: string;
  estimatedHours: number | null;
  estimatedRate: number | null;
  bookingDayCount: number;
  multiDayMinimumVdoHours: number | null;
  input: {
    scheduled_start: string;
    scheduled_end: string;
    [key: string]: any;
  };
};

export type BookingReviewModalProps = {
  open: boolean;
  draft: BookingReviewDraft | null;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onSwipeError?: (message: string) => void;
};

function formatTimeLabel(time24: string) {
  if (!time24) return "—";
  const [hStr, mStr] = time24.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatRate(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return `$${Math.round(cents / 100)}/hr`;
}

export default function BookingReviewModal({
  open,
  draft,
  error: externalError,
  onClose,
  onConfirm,
  onSwipeError,
}: BookingReviewModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const displayError = externalError ?? localError;

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
      setLocalError(null);
      return;
    }

    const previousActive = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      previousActive?.focus();
    };
  }, [open, onClose, isSubmitting]);

  function handleSwipeError(message: string) {
    setLocalError(message);
    onSwipeError?.(message);
    setIsSubmitting(false);
  }

  async function handleConfirm() {
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onConfirm();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setLocalError(error.message || "Failed to confirm booking.");
      setIsSubmitting(false);
      throw error;
    }
  }

  function handleClose() {
    if (isSubmitting) return;
    onClose();
  }

  if (!open || !draft) return null;

  const { bookingMode, startDate, startTime, endDate, endTime } = draft;
  const title = "Review your booking request";
  const bookingTypeLabel = bookingMode === "multi" ? "Multi-day hire" : "Single day hire";
  const bookingWindowLabel = bookingMode === "multi" ? "Booking window" : "Duration";
  const multiDayMinimumHours =
    draft.multiDayMinimumVdoHours ??
    (draft.bookingDayCount > 0 ? draft.bookingDayCount * 4 : null);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
        <button
          type="button"
          aria-label="Close booking review dialog"
          onClick={handleClose}
          disabled={isSubmitting}
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm disabled:cursor-not-allowed"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-review-title"
          aria-busy={isSubmitting || undefined}
          className="relative z-10 w-full max-w-2xl my-auto max-h-[96vh] sm:max-h-[90vh] flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-[#dbe3ef] bg-white text-[#152d5a] shadow-[0_24px_80px_rgba(21,45,90,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute inset-x-0 top-0 h-1.5 bg-[#1a4fd6] shrink-0" />

          {/* Modal Header */}
          <div className="flex items-start gap-2.5 sm:gap-4 p-3.5 sm:px-7 sm:pt-6 sm:pb-4 shrink-0 border-b border-slate-100 sm:border-none">
            <div className="mt-0.5 flex h-9 w-9 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-[#f0f6ff] text-[#1a4fd6]">
              <PencilLine className="h-4 w-4 sm:h-6 sm:w-6" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                Ready to submit
              </p>
              <h3
                id="booking-review-title"
                className="mt-0.5 text-base sm:text-2xl lg:text-3xl font-semibold leading-tight text-[#152d5a]"
              >
                {title}
              </h3>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug sm:leading-relaxed text-[#4b6390]">
                Slide the runway handle to confirm your booking.
              </p>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f1f5f9] hover:text-[#152d5a] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Close booking review dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-3 sm:px-7 sm:pb-6 space-y-3 sm:space-y-4">
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {/* Booking Summary Card */}
              <div className="rounded-xl sm:rounded-2xl border border-[#e2e8f0] bg-white p-3 sm:p-5 shadow-[0_1px_0_rgba(21,45,90,0.02)]">
                <div className="mb-2.5 sm:mb-4 flex items-center gap-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">
                  <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#1a4fd6]" />
                  Booking summary
                </div>

                <div className="space-y-2 sm:space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-1.5 border-b border-[#edf2f7] pb-2 sm:pb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-[#94a3b8]">Date</p>
                      <p className="mt-0.5 text-xs sm:text-sm font-semibold text-[#152d5a] break-words">
                        {bookingMode === "single"
                          ? formatDate(startDate)
                          : `${formatDate(startDate)} to ${formatDate(endDate)}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-[#94a3b8]">Type</p>
                      <p className="mt-0.5 text-xs sm:text-sm font-semibold text-[#1a4fd6]">{bookingTypeLabel}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3 pt-0.5">
                    <div className="min-w-0">
                      <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] text-[#94a3b8]">Start</p>
                      <p className="mt-0.5 text-[11px] sm:text-sm font-medium text-[#152d5a] truncate">{formatTimeLabel(startTime)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] text-[#94a3b8]">Return</p>
                      <p className="mt-0.5 text-[11px] sm:text-sm font-medium text-[#152d5a] truncate">{formatTimeLabel(endTime)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] text-[#94a3b8] truncate">
                        {bookingWindowLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] sm:text-sm font-semibold text-[#1a4fd6] truncate">
                        {draft.bookingSummaryDurationLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pricing Summary Card */}
              <div className="rounded-xl sm:rounded-2xl border border-[#e2e8f0] bg-white p-3 sm:p-5 shadow-[0_1px_0_rgba(21,45,90,0.02)]">
                <div className="mb-2.5 sm:mb-4 flex items-center gap-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">
                  <Clock3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#1a4fd6]" />
                  Pricing summary
                </div>

                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-[#edf2f7] pb-2 sm:pb-3">
                    <span className="text-xs sm:text-sm text-[#6b7280]">Billing type</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#152d5a] text-right">
                      {bookingMode === "multi" && multiDayMinimumHours
                        ? `Min. ${multiDayMinimumHours}h or actual VDO`
                        : "Actual VDO hours"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-[#edf2f7] pb-2 sm:pb-3">
                    <span className="text-xs sm:text-sm text-[#6b7280]">Hire type</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#152d5a]">Wet hire · GST incl.</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-[#6b7280]">Rate</span>
                    <span className="text-sm sm:text-lg font-semibold text-[#1a4fd6]">{formatRate(draft.estimatedRate)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Multi-Day Policy Notice Below Grid */}
            {bookingMode === "multi" && draft.bookingDayCount > 0 && (
              <div className="rounded-xl sm:rounded-2xl border border-amber-200/90 bg-amber-50/70 p-3 sm:p-4 text-xs sm:text-sm text-amber-950 shadow-xs">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0 mt-0.5">
                    info
                  </span>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <span className="font-bold text-amber-900 block text-xs sm:text-sm leading-snug">
                      Multi-Day Minimum: {multiDayMinimumHours}.0h VDO ({draft.bookingDayCount} days &times; 4h/day)
                    </span>
                    <p className="text-amber-900/90 text-[11px] sm:text-xs leading-relaxed">
                      Billed at 4.0h/day policy minimum. If actual flight hours exceed the minimum, actual VDO hours are billed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {displayError ? (
              <div className="rounded-xl sm:rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700">
                {displayError}
              </div>
            ) : null}

            {/* Runway Confirm Slider Container */}
            <div className="rounded-xl sm:rounded-2xl border border-[#e2e8f0] bg-[#f8fbff] p-2.5 sm:p-4">
              <RunwaySwipeConfirm
                onConfirm={handleConfirm}
                onError={handleSwipeError}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
