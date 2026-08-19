"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBooking } from "@/app/actions/booking";
import {
  checkCustomerAvailability,
  type SafeConflict,
  type AvailabilityCheckResult,
} from "@/app/actions/customer-availability";
import type { BookingReadinessItem } from "@/lib/booking-readiness";
import type { CreateBookingInput } from "@/lib/supabase/booking-types";
import type { UserDocument } from "@/lib/supabase/types";
import { sydneyInputToUTC, formatSydTime } from "@/lib/utils/sydney-time";
import { validateFlightReviewDate } from "@/lib/utils/flight-review";
import { formatDate, formatDateFromISO } from "@/lib/formatDateTime";
import DocumentProgressCard from "@/components/DocumentProgressCard";
import CalendarDateField from "@/components/CalendarDateField";
import PortalPageHero from "@/components/PortalPageHero";
import BookingConfirmationModal from "./BookingConfirmationModal";
import BookingReviewModal, { type BookingReviewDraft } from "./BookingReviewModal";
import { getDocumentProgressSnapshot } from "@/lib/document-progress";

// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; message: string; debugError?: string }
  | {
      status: "unavailable";
      message: string;
      conflicts: SafeConflict[];
      debugError?: string;
    };

type SuccessState = {
  bookingId: string;
  bookingReference: string;
  bookingStatus: string;
  bookingMode: "single" | "multi";
  startDT: string;
  endDT: string;
  estimatedHours: number | null;
};

type TimeOption = { value: string; label: string };

type Props = {
  aircraftId: string;
  aircraftRegistration: string;
  aircraftType: string;
  aircraftStatus: string;
  payfRatePerHour: number;
  displayedRatePerHour: number;
  activeBlockTimeSummary: {
    hoursRemaining: number;
    expiresAt: string;
    ratePerHour: number;
  } | null;
  cheapestActivePackageRatePerHour: number | null;
  picName: string | null;
  picArn: string | null;
  documentReadinessItems: BookingReadinessItem[];
  pilotLicenceDocument: UserDocument | null;
  hasNightVfrRating: boolean | null;
  termsAccepted: boolean;
  eligibilityBlocked: boolean;
  eligibilityWarnings: string[];
  initialLastFlightDate: string;
};

// ── Time options (full day, 15-min increments) ────────────────────────────────

const ALL_TIME_OPTIONS: TimeOption[] = (() => {
  const opts: TimeOption[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const period = h < 12 ? "AM" : "PM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      opts.push({
        value,
        label: `${h12}:${String(m).padStart(2, "0")} ${period}`,
      });
    }
  }
  return opts;
})();

function rotateTimeOptionsTo(
  options: TimeOption[],
  startValue: string,
): TimeOption[] {
  const idx = options.findIndex((o) => o.value === startValue);
  if (idx <= 0) return options;
  return [...options.slice(idx), ...options.slice(0, idx)];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateDisplay(dateStr: string): string {
  return formatDate(dateStr);
}

function formatLongDateDisplay(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDateDisplay(dateStr: string): string {
  return formatDate(dateStr);
}

function formatHourlyRate(rate: number): string {
  return `$${Math.round(rate).toLocaleString("en-AU")}/hr`;
}

function shiftDateByDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function sydIsoToMinutes(isoUTC: string): number {
  return parseTimeToMinutes(formatSydTime(isoUTC));
}

function formatTimeLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function formatDurationLabelFromMinutes(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getVdoHourlyRate(hours: number): number {
  if (hours < 10) return 330;
  if (hours < 25) return 320;
  if (hours < 50) return 310;
  if (hours < 100) return 300;
  return 290;
}

// ── Date input ─────────────────────────────────────────────────────────────────

function DateInput({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const minYear = min
    ? Number(min.slice(0, 4)) || new Date().getFullYear() - 20
    : new Date().getFullYear() - 20;
  const maxYear = max
    ? Number(max.slice(0, 4)) || new Date().getFullYear() + 5
    : new Date().getFullYear() + 5;
  return (
    <CalendarDateField
      value={value}
      minDate={min}
      maxDate={max}
      minYear={minYear}
      maxYear={maxYear}
      disabled={disabled}
      onChange={onChange}
      className={`
        w-full px-4 py-3 bg-white border border-[#d1d5db]
        focus:border-[#1a4fd6] focus:ring-2 focus:ring-[#1a4fd6]/20 focus:outline-none rounded-xl
        text-[#152d5a] text-sm transition-colors shadow-sm
        flex items-center justify-between gap-2 text-left
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-[#cbd5e1]"}
      `}
    />
  );
}

// ── Time select ────────────────────────────────────────────────────────────────

function TimeSelect({
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  options: TimeOption[];
  disabled?: boolean;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onFocus={(e) => {
          if (!value) e.currentTarget.selectedIndex = 0;
        }}
        onChange={(e) => onChange(e.target.value)}
        className={`
          w-full pl-4 pr-9 py-3 bg-white border border-[#d1d5db]
          focus:border-[#1a4fd6] focus:ring-2 focus:ring-[#1a4fd6]/20 focus:outline-none rounded-xl
          text-sm transition-colors appearance-none
          shadow-sm
          ${disabled ? "opacity-40 cursor-not-allowed text-[#94a3b8]" : "cursor-pointer text-[#152d5a] hover:border-[#cbd5e1]"}
          ${!value ? "text-[#94a3b8]" : ""}
        `}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-base pointer-events-none"
        style={{ fontVariationSettings: "'wght' 300" }}
      >
        expand_more
      </span>
    </div>
  );
}

// ── Availability status ────────────────────────────────────────────────────────

function AvailabilityStatus({
  availability,
  startDT,
  endDT,
  endIsBeforeStart,
}: {
  availability: AvailabilityState;
  startDT: string;
  endDT: string;
  endIsBeforeStart: boolean;
}) {
  // Only show once the user has started entering times
  if (!startDT) return null;

  if (availability.status === "idle") {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 bg-[#f8fbff] border border-[#e2e8f0] rounded-xl">
        <span
          className="material-symbols-outlined text-[#94a3b8] text-base flex-shrink-0"
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          info
        </span>
        <p className="text-xs text-[#64748b]">
          {!endDT || endIsBeforeStart
            ? "Select an estimated return time to check availability."
            : "Select a departure and return time to check availability."}
        </p>
      </div>
    );
  }

  if (availability.status === "checking") {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 bg-[#f0f6ff] border border-[#c7d8f5] rounded-xl">
        <span className="material-symbols-outlined text-[#1a4fd6] text-base animate-spin flex-shrink-0">
          progress_activity
        </span>
        <p className="text-xs text-[#1a4fd6]">
          Checking aircraft availability…
        </p>
      </div>
    );
  }

  if (availability.status === "available") {
    return (
      <div className="flex items-center gap-3 bg-[#f0fff7] border border-[#a7f3d0] rounded-xl px-4 py-3.5">
        <span
          className="material-symbols-outlined text-[#10b981] text-base flex-shrink-0"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
        <p className="text-sm text-[#047857] font-medium">
          Aircraft is available for the selected time.
        </p>
      </div>
    );
  }

  if (availability.status === "unavailable") {
    return (
      <div className="bg-[#fff1f2] border border-[#fecdd3] rounded-xl px-4 py-3.5 space-y-2.5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[#e11d48] text-base flex-shrink-0 mt-0.5">
            error
          </span>
          <div>
            <p className="text-sm text-[#be123c] font-medium">
              Selected time is unavailable.
            </p>
            <p className="text-xs text-[#e11d48]/70 mt-1 leading-relaxed">
              Try adjusting your departure or estimated return time.
            </p>
          </div>
        </div>
        {availability.conflicts.length > 0 && (
          <div className="space-y-1.5 ml-7">
            {availability.conflicts.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-1 h-1 rounded-full bg-[#e11d48] flex-shrink-0" />
                <span className="text-[#be123c]/80">{c.label}</span>
                <span className="text-[#64748b] font-mono ml-auto tabular-nums">
                  {formatSydTime(c.start_time)}–{formatSydTime(c.end_time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function BookingRateContextPanel({
  payfRatePerHour,
  displayedRatePerHour,
  activeBlockTimeSummary,
  cheapestActivePackageRatePerHour,
}: {
  payfRatePerHour: number
  displayedRatePerHour: number
  activeBlockTimeSummary: Props["activeBlockTimeSummary"]
  cheapestActivePackageRatePerHour: number | null
}) {
  const hasActiveBlockTime = activeBlockTimeSummary !== null

  return (
    <div
      className={`mb-5 rounded-2xl border px-6 py-5 shadow-sm ${
        hasActiveBlockTime ? "border-green-500/20 bg-green-500/5" : "border-[#1a4fd6] bg-[#152d5a]"
      }`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <p
            className={`text-[11px] font-semibold uppercase tracking-widest ${
              hasActiveBlockTime ? "text-green-700" : "text-[#cfe0ff]"
            }`}
          >
            {hasActiveBlockTime ? "Block time active" : "Pay As You Fly"}
          </p>
          <p
            className={`mt-2 text-lg font-bold ${
              hasActiveBlockTime ? "text-green-700" : "text-white"
            }`}
          >
            {hasActiveBlockTime
              ? "Your locked-in block time rate is available for this booking."
              : "You're booking at the Pay As You Fly rate."}
          </p>
          <p
            className={`mt-1 text-sm leading-relaxed ${
              hasActiveBlockTime ? "text-green-700/80" : "text-[#d6e3ff]"
            }`}
          >
            {hasActiveBlockTime
              ? `You can use your current balance below and top up later from Block Time.`
              : `That's ${formatHourlyRate(payfRatePerHour)} for this flight. Save up to $40/hr by purchasing a Block Time package.`}
          </p>
        </div>

        <div
          className={`lg:border-l lg:pl-6 ${
            hasActiveBlockTime ? "lg:border-green-500/20" : "lg:border-white/15"
          }`}
        >
          <div className={`flex items-start gap-2 ${hasActiveBlockTime ? "text-green-700" : "text-white"}`}>
            <span className="material-symbols-outlined text-[18px] mt-0.5">
              schedule
            </span>
            <div>
              <p
                className={`text-xs font-semibold uppercase tracking-wide ${
                  hasActiveBlockTime ? "text-green-700/80" : "text-[#cfe0ff]"
                }`}
              >
                {hasActiveBlockTime ? "Current balance" : "Booking rate"}
              </p>
              {hasActiveBlockTime && activeBlockTimeSummary ? (
                <>
                  <p className={`text-sm font-semibold ${hasActiveBlockTime ? "text-green-700" : "text-[#7c2d12]"}`}>
                    {activeBlockTimeSummary.hoursRemaining.toFixed(1)}h remaining
                  </p>
                  <p className={`text-xs ${hasActiveBlockTime ? "text-green-700/80" : "text-[#d6e3ff]"}`}>
                    Expires {formatDateFromISO(activeBlockTimeSummary.expiresAt)}
                  </p>
                  <p className="mt-3 text-sm line-through text-[#4b6390]/70">
                    {formatHourlyRate(payfRatePerHour)}
                  </p>
                  <p className={`font-serif text-3xl font-normal ${hasActiveBlockTime ? "text-[#1a4fd6]" : "text-[#152d5a]"}`}>
                    {formatHourlyRate(displayedRatePerHour)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white">
                    You're booking at the Pay As You Fly rate
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-[#d6e3ff]">
                    That's {formatHourlyRate(payfRatePerHour)} for this flight. Save up to $40/hr by purchasing a Block Time package.
                  </p>
                </>
              )}
            </div>
          </div>

          {!hasActiveBlockTime ? (
            <Link
              href="/dashboard/pricing"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-[#f59e0b]/25 bg-[#f59e0b] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-[#d97706] hover:border-[#d97706]"
            >
              View Block Time
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BookingRequestForm({
  aircraftId,
  aircraftRegistration,
  aircraftType,
  aircraftStatus,
  payfRatePerHour,
  displayedRatePerHour,
  activeBlockTimeSummary,
  cheapestActivePackageRatePerHour,
  picName,
  picArn,
  documentReadinessItems,
  pilotLicenceDocument,
  hasNightVfrRating,
  termsAccepted,
  eligibilityBlocked,
  eligibilityWarnings,
  initialLastFlightDate,
}: Props) {
  const [bookingMode, setBookingMode] = useState<
    "single" | "multi" | null
  >(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    summary: true,
    pricing: true,
    notes: true,
  });
  const [lastFlightDate, setLastFlightDate] = useState(initialLastFlightDate);
  const trackRef = useRef<HTMLDivElement>(null);
  const documentGate = useMemo(
    () =>
      getDocumentProgressSnapshot({
        documentReadinessItems,
        pilotLicenceDocument,
        lastFlightDate: lastFlightDate,
        hasNightVfrRating,
        termsAccepted,
      }),
    [documentReadinessItems, pilotLicenceDocument, lastFlightDate, hasNightVfrRating, termsAccepted],
  );
  const bookingTypeLocked = !documentGate.allApproved;
  const reviewTimeValue = documentGate.percent < 100 ? "After upload" : "Up to 24 hours";

  // ── Split date/time state ─────────────────────────────────────────────────
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [notes, setNotes] = useState("");
  const [medical] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<BookingReviewDraft | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [multiDayMinimumInfoOpen, setMultiDayMinimumInfoOpen] = useState(false);
  const multiDayMinimumInfoRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const timeToPct = (t: string): number => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return ((h * 60 + m) / 1440) * 100;
  };

  const pctToTime = (pct: number): string => {
    const totalMins =
      Math.round(((Math.min(100, Math.max(0, pct)) / 100) * 1440) / 15) * 15;
    // Cap at 23:45 - dragging to the far right must not wrap to 00:00
    const cappedMins = Math.min(totalMins, 1425);
    const h = Math.floor(cappedMins / 60);
    const m = cappedMins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const fmtTime = (t: string): string => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const getPctFromPointer = (
    e: React.PointerEvent,
    ref: React.RefObject<HTMLDivElement>,
  ): number => {
    if (!ref.current) return 0;
    const rect = ref.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * 100;
  };

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (!multiDayMinimumInfoOpen) return;

    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!multiDayMinimumInfoRef.current?.contains(target)) {
        setMultiDayMinimumInfoOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMultiDayMinimumInfoOpen(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [multiDayMinimumInfoOpen]);

  // Flight review validation (silent — no UI for editing, value comes from profile)
  const flightReviewError = lastFlightDate
    ? validateFlightReviewDate(lastFlightDate)
    : null;
  const flightReviewValid = !!lastFlightDate && !flightReviewError;

  // ── Derived combined datetime strings ─────────────────────────────────────
  const startDT = startDate && startTime ? `${startDate}T${startTime}` : "";
  const bookingReturnDate = bookingMode === "multi" ? returnDate : startDate;
  const bookingReturnTime = bookingMode === "multi" ? returnTime : endTime;
  const endDT =
    bookingReturnDate && bookingReturnTime
      ? `${bookingReturnDate}T${bookingReturnTime}`
      : "";

  // ── Availability state ────────────────────────────────────────────────────
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });

  // ── Min date/time (1 hour from now in Sydney) ─────────────────────────────
  const { minDate, minTimeToday } = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return {
      minDate: d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }),
      minTimeToday: d
        .toLocaleTimeString("sv-SE", { timeZone: "Australia/Sydney" })
        .slice(0, 5),
    };
  }, []);

  // ── Filtered time options ─────────────────────────────────────────────────
  const startTimeOptions = useMemo(() => {
    if (startDate === minDate) {
      return ALL_TIME_OPTIONS.filter((o) => o.value >= minTimeToday);
    }
    return rotateTimeOptionsTo(ALL_TIME_OPTIONS, "09:00");
  }, [startDate, minDate, minTimeToday]);

  const endTimeOptions = useMemo(() => {
    // Single-day: always same date as startDate, filter times after startTime
    if (bookingMode === "single" && startDate && startTime) {
      return ALL_TIME_OPTIONS.filter((o) => o.value > startTime);
    }
    // Multi-day fallback (if return is same date as start)
    if (endDate && startDate && endDate === startDate && startTime) {
      return ALL_TIME_OPTIONS.filter((o) => o.value > startTime);
    }
    return ALL_TIME_OPTIONS;
  }, [bookingMode, endDate, startDate, startTime]);

  const returnTimeOptions = useMemo(() => {
    if (
      bookingMode === "multi" &&
      returnDate &&
      startDate &&
      returnDate === startDate &&
      startTime
    ) {
      return ALL_TIME_OPTIONS.filter((o) => o.value > startTime);
    }
    return ALL_TIME_OPTIONS;
  }, [bookingMode, returnDate, startDate, startTime]);

  const multiReturnMinDate = useMemo(() => {
    if (!startDate) return minDate;
    return shiftDateByDays(startDate, 1);
  }, [startDate, minDate]);

  // ── Cascade handlers ──────────────────────────────────────────────────────

  function handleStartDateChange(date: string) {
    setStartDate(date);
    if (date === minDate && startTime && startTime < minTimeToday) {
      setStartTime("");
    }
    if (bookingMode === "single") {
      if (endDate && date > endDate) {
        setEndDate("");
        setEndTime("");
      }
    } else if (returnDate && date >= returnDate) {
      setReturnDate("");
      setReturnTime("");
    }
  }

  function handleStartTimeChange(time: string) {
    setStartTime(time);
    if (bookingMode === "single") {
      if (
        endDate &&
        startDate &&
        endDate === startDate &&
        endTime &&
        endTime <= time
      ) {
        setEndTime("");
      }
    } else if (
      returnDate &&
      startDate &&
      returnDate === startDate &&
      returnTime &&
      returnTime <= time
    ) {
      setReturnTime("");
    }
  }

  function handleReturnDateChange(date: string) {
    setReturnDate(date);
    if (
      date === startDate &&
      returnTime &&
      startTime &&
      returnTime <= startTime
    ) {
      setReturnTime("");
    }
  }

  function handleBookingModeChange(mode: "single" | "multi" | null) {
    setBookingMode(mode);
    setSubmitError(null);
    setAvailability({ status: "idle" });
  }

  // ── Live availability check (debounced 600ms) ─────────────────────────────
  const runAvailabilityCheck = useCallback(
    async (start: string, end: string) => {
      const startUTC = sydneyInputToUTC(start);
      const endUTC = sydneyInputToUTC(end);
      if (!startUTC || !endUTC) return;
      if (new Date(endUTC) <= new Date(startUTC)) return;

      setAvailability({ status: "checking" });

      let result: AvailabilityCheckResult;
      try {
        result = await checkCustomerAvailability(aircraftId, startUTC, endUTC);
      } catch {
        setAvailability({
          status: "unavailable",
          message: "Unable to check availability. Please try again.",
          conflicts: [],
        });
        return;
      }

      if (result.available) {
        setAvailability({
          status: "available",
          message: result.message,
          debugError: result.debugError,
        });
      } else {
        setAvailability({
          status: "unavailable",
          message: result.message,
          conflicts: result.conflicts,
          debugError: result.debugError,
        });
      }
    },
    [aircraftId],
  );

  useEffect(() => {
    if (!startDT || !endDT) {
      setAvailability({ status: "idle" });
      return;
    }
    const timer = setTimeout(() => runAvailabilityCheck(startDT, endDT), 600);
    return () => clearTimeout(timer);
  }, [startDT, endDT, runAvailabilityCheck]);

  // ── Estimated duration ────────────────────────────────────────────────────
  const estimatedHours = useMemo(() => {
    const s = sydneyInputToUTC(startDT);
    const e = sydneyInputToUTC(endDT);
    if (!s || !e) return null;
    const mins = (new Date(e).getTime() - new Date(s).getTime()) / 60000;
    return mins > 0 ? mins / 60 : null;
  }, [startDT, endDT]);

  const bookingDurationMinutes = useMemo(() => {
    const s = sydneyInputToUTC(startDT);
    const e = sydneyInputToUTC(endDT);
    if (!s || !e) return 0;
    return Math.max(
      0,
      Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000),
    );
  }, [startDT, endDT]);

  const bookingSummaryDurationLabel = useMemo(() => {
    if (bookingDurationMinutes <= 0) return "—";
    return formatDurationLabelFromMinutes(bookingDurationMinutes);
  }, [bookingDurationMinutes]);

  const estimatedRate = useMemo(() => {
    if (estimatedHours == null) return payfRatePerHour;
    return getVdoHourlyRate(estimatedHours);
  }, [estimatedHours, payfRatePerHour]);

  const bookingDayCount = useMemo(() => {
    if (bookingMode !== "multi" || !startDate || !bookingReturnDate) return 0;
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${bookingReturnDate}T12:00:00`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    )
      return 0;
    return (
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
  }, [bookingMode, startDate, bookingReturnDate]);

  const multiDayMinimumVdoHours = useMemo(() => {
    if (bookingMode !== "multi" || bookingDayCount <= 0) return null;
    return bookingDayCount * 4;
  }, [bookingMode, bookingDayCount]);

  const activeBookingDate = startDate;

  // ── Submit gate ───────────────────────────────────────────────────────────
  const endIsBeforeStart = !!(startDT && endDT && endDT <= startDT);
  const hasInvalidMultiDayRange =
    bookingMode === "multi" &&
    !!startDate &&
    !!bookingReturnDate &&
    bookingReturnDate <= startDate;

  const canSubmit =
    !reviewDraft &&
    !eligibilityBlocked &&
    !!startDT &&
    !!endDT &&
    !endIsBeforeStart &&
    !hasInvalidMultiDayRange &&
    availability.status === "available" &&
    flightReviewValid &&
    medical;

  function getDisabledReason(): string | null {
    if (eligibilityBlocked)
      return "Booking access is suspended. See the eligibility notice above.";
    if (!startDate || !startTime)
      return "Choose an available time and complete the required confirmations to continue.";
    if (bookingMode === "single") {
      if (!endDate || !endTime)
        return "Select an estimated return date and time.";
    } else {
      if (!returnDate || !returnTime) return "Select a return date and time.";
      if (hasInvalidMultiDayRange)
        return "Return date must be after the departure date.";
    }
    if (endIsBeforeStart) return "Estimated return must be after departure.";
    if (availability.status === "checking") return "Checking availability…";
    if (availability.status === "unavailable")
      return "Selected time is unavailable.";
    if (!lastFlightDate)
      return "Your flight review date is not on file. Please contact operations.";
    if (flightReviewError) return flightReviewError;
    return null;
  }

  // ── Handle submit ─────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!startDT || !endDT) {
      setSubmitError("Please select a departure and estimated return time.");
      return;
    }
    const startUTC = sydneyInputToUTC(startDT);
    const endUTC = sydneyInputToUTC(endDT);
    if (!startUTC || !endUTC) {
      setSubmitError("Invalid date/time values.");
      return;
    }
    if (new Date(endUTC) <= new Date(startUTC)) {
      setSubmitError("Estimated return time must be after departure.");
      return;
    }
    if (hasInvalidMultiDayRange) {
      setSubmitError("Return date must be after the departure date.");
      return;
    }
    if (eligibilityBlocked) {
      setSubmitError(
        "Booking access is currently unavailable. Please review the eligibility notice above.",
      );
      return;
    }
    if (availability.status !== "available") {
      setSubmitError(
        "Please wait for the availability check to complete, or choose a different time.",
      );
      return;
    }

    const flightReviewErr = validateFlightReviewDate(lastFlightDate);
    if (flightReviewErr) {
      setSubmitError(flightReviewErr);
      return;
    }

    const input = {
      aircraft_id: aircraftId,
      scheduled_start: startUTC,
      scheduled_end: endUTC,
      last_flight_date: lastFlightDate,
      pic_name: picName ?? undefined,
      pic_arn: picArn ?? undefined,
      customer_notes: notes || null,
      risk_acknowledgement_accepted: medical,
      bookingMode,
      returnDate: bookingMode === "multi" ? returnDate : null,
      returnTime: bookingMode === "multi" ? returnTime : null,
    } as CreateBookingInput & {
      bookingMode: "single" | "multi";
      returnDate: string | null;
      returnTime: string | null;
    };

    setReviewError(null);
    setReviewDraft({
      bookingMode: bookingMode ?? "single",
      startDate,
      startTime,
      endDate: bookingReturnDate,
      endTime: bookingReturnTime,
      bookingSummaryDurationLabel,
      estimatedHours,
      estimatedRate,
      bookingDayCount,
      multiDayMinimumVdoHours,
      input,
    });
  }

  async function handleReviewConfirm() {
    if (!reviewDraft) return;

    try {
      const result = await createBooking(reviewDraft.input as CreateBookingInput);
      setReviewDraft(null);
      setSuccessState({
        bookingId: result.bookingId,
        bookingReference: result.bookingReference,
        bookingStatus: result.bookingStatus,
        bookingMode: reviewDraft.bookingMode,
        startDT: reviewDraft.input.scheduled_start,
        endDT: reviewDraft.input.scheduled_end,
        estimatedHours: reviewDraft.estimatedHours,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong.";
      if (
        msg.includes("AVAILABILITY") ||
        msg.includes("conflict") ||
        msg.includes("unavailable")
      ) {
        setReviewError(
          "This time was just taken or blocked. Please choose another window.",
        );
      } else if (msg.includes("VALIDATION")) {
        setReviewError(msg.replace("VALIDATION:", "").trim());
      } else if (
        msg.includes("CLEARANCE_REQUIRED") ||
        msg.includes("VERIFICATION_REQUIRED")
      ) {
        setReviewError(
          "You must complete your checkout flight and be cleared before booking aircraft.",
        );
      } else if (msg.includes("READINESS_REQUIRED")) {
        setReviewError(
          "Your pilot documents are incomplete or still under review. Please check your Documents page and ensure all required files have been uploaded.",
        );
      } else {
        setReviewError(msg);
      }
      throw err;
    }
  }

  function handleReviewClose() {
    setReviewDraft(null);
    setReviewError(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {successState ? (
        <BookingConfirmationModal
          open
          bookingId={successState.bookingId}
          bookingReference={successState.bookingReference}
          bookingStatus={successState.bookingStatus}
          bookingMode={successState.bookingMode}
          startDT={successState.startDT}
          endDT={successState.endDT}
          estimatedHours={successState.estimatedHours}
          onClose={() => {
            setSuccessState(null);
            router.replace("/dashboard/bookings");
          }}
        />
      ) : null}
      {reviewDraft ? (
        <BookingReviewModal
          open
          draft={reviewDraft}
          error={reviewError}
          onClose={handleReviewClose}
          onConfirm={handleReviewConfirm}
          onSwipeError={(message) => setReviewError(message)}
        />
      ) : null}

    <div
      data-testid="booking-form"
      className="min-h-screen bg-white text-[#152d5a]"
    >
      <PortalPageHero
        eyebrow="FLEET BOOKING"
        title="Book a Flight"
        subtitle="Choose your preferred time and we'll take care of the rest."
        note="All times are shown in Sydney time (AEST/AEDT)."
        backgroundImage="/CustomerDashboard/booking-hero.png"
        backgroundPosition="center bottom"
        variant="dark"
      />

      <div className="w-full px-3 sm:px-4 lg:px-6 py-6 pb-28 bg-[#f5f7fb]">
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#152d5a] mb-5 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          My Bookings
        </Link>

        <form id="booking-request-form" onSubmit={handleSubmit}>
              <div className="space-y-5">
            {aircraftStatus !== "available" && (
              <div className="flex items-center gap-3 bg-[#fff7ed] border border-[#fed7aa] rounded-xl px-5 py-3.5">
                <span className="material-symbols-outlined text-[#f59e0b] text-lg flex-shrink-0">
                  warning
                </span>
                <p className="text-sm text-[#9a3412]">
                  {aircraftRegistration} is currently{" "}
                  <strong>{aircraftStatus}</strong>. Requests may be delayed.
                </p>
              </div>
            )}

            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-5 md:gap-6">
              <div className="w-24 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-[#e2e8f0]">
                <img
                  src="/Logo/ozrentaplane-logo.png"
                  alt="VH-KZG Cessna 172"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                    (
                      e.currentTarget.parentElement as HTMLElement
                    ).classList.add(
                      "bg-[#dde8f5]",
                      "flex",
                      "items-center",
                      "justify-center",
                    );
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-0.5">
                  Aircraft
                </p>
                <p className="text-lg font-semibold text-[#152d5a] truncate">
                  {aircraftRegistration} / {aircraftType}
                </p>
                <p className="text-sm text-[#6b7280]">4 seats</p>
              </div>
              <div className="hidden md:block w-px h-12 bg-[#e2e8f0]" />
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#dde8f5] flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-[#1a4fd6]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-0.5">
                    Pilot
                  </p>
                  <p className="text-base font-semibold text-[#152d5a] truncate">
                    {picName || "Pilot unavailable"}
                  </p>
                  {picArn && picArn.length > 2 && (
                    <p className="text-xs text-[#6b7280]">ARN {picArn}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Booking mode selector */}
            <div>
              <div className="mb-5 text-center">
                <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">
                  Booking type
                </p>
                <p
                  className="text-xl font-bold text-[#152d5a]"
                  style={{ fontFamily: "Newsreader, serif", fontWeight: 400 }}
                >
                  How long do you need the aircraft?
                </p>
              </div>

              {!documentGate.allApproved ? (
                <div
                  className={`mb-5 rounded-2xl border px-6 py-5 shadow-sm ${
                    documentGate.bannerState === 'unlocked'
                      ? 'border-green-500/20 bg-green-500/5'
                      : documentGate.bannerState === 'rejected'
                        ? 'border-rose-300 bg-rose-50/90'
                        : 'border-[#f2d28a] bg-[#fff6df]'
                  }`}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <DocumentProgressCard
                        variant="wizard"
                        statuses={documentGate.statuses}
                        heading={
                          documentGate.bannerState === 'rejected'
                            ? 'One or more documents need your attention'
                            : 'Complete all 4 steps to submit your documents'
                        }
                        subheading={
                          documentGate.bannerState === 'rejected'
                            ? 'Please re-upload rejected documents to complete your submission.'
                            : 'Our team will review and confirm your checkout request.'
                        }
                        className="shadow-sm"
                      />
                      <p
                        className={`mt-4 text-lg md:text-xl font-bold mb-1.5 ${
                          documentGate.bannerState === 'unlocked'
                            ? 'text-green-700'
                            : documentGate.bannerState === 'rejected'
                              ? 'text-rose-900'
                              : 'text-[#7c2d12]'
                        }`}
                      >
                        {documentGate.bannerHeading}
                      </p>
                      <p
                        className={`text-sm md:text-base leading-relaxed max-w-2xl ${
                          documentGate.bannerState === 'unlocked'
                            ? 'text-green-700/80'
                            : documentGate.bannerState === 'rejected'
                              ? 'text-rose-800 font-medium'
                              : 'text-[#8b5e34]'
                        }`}
                      >
                        {documentGate.bannerBody}
                      </p>
                      <Link
                        href="/dashboard/documents"
                        className={`mt-4 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors shadow-sm ${
                          documentGate.bannerState === 'unlocked'
                            ? 'bg-green-600 hover:bg-green-700'
                            : documentGate.bannerState === 'rejected'
                              ? 'bg-rose-600 hover:bg-rose-700'
                              : 'bg-[#1a4fd6] hover:bg-[#1540a8]'
                        }`}
                      >
                        {documentGate.ctaLabel}
                        <span className="material-symbols-outlined text-sm">
                          arrow_forward
                        </span>
                      </Link>
                    </div>

                    <div className={`lg:border-l lg:pl-6 ${
                      documentGate.bannerState === 'unlocked'
                        ? 'lg:border-green-500/20'
                        : documentGate.bannerState === 'rejected'
                          ? 'lg:border-rose-200'
                          : 'lg:border-[#e9c87b]'
                    }`}>
                      <div className={`flex items-start gap-2 ${
                        documentGate.bannerState === 'unlocked'
                          ? 'text-green-700'
                          : documentGate.bannerState === 'rejected'
                            ? 'text-rose-700'
                            : 'text-[#b45309]'
                      }`}>
                        <span className="material-symbols-outlined text-[18px] mt-0.5">
                          {documentGate.bannerState === 'rejected' ? 'error' : 'schedule'}
                        </span>
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-wide ${
                            documentGate.bannerState === 'unlocked'
                              ? 'text-green-700/80'
                              : documentGate.bannerState === 'rejected'
                                ? 'text-rose-600'
                                : 'text-[#a16207]'
                          }`}>
                            {documentGate.bannerState === 'rejected' ? 'Action required' : 'Typical review time'}
                          </p>
                          <p className={`text-sm md:text-base font-semibold ${
                            documentGate.bannerState === 'unlocked'
                              ? 'text-green-700'
                              : documentGate.bannerState === 'rejected'
                                ? 'text-rose-900'
                                : 'text-[#7c2d12]'
                          }`}>
                            {documentGate.bannerState === 'rejected' ? 'Re-upload needed' : reviewTimeValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <BookingRateContextPanel
                payfRatePerHour={payfRatePerHour}
                displayedRatePerHour={displayedRatePerHour}
                activeBlockTimeSummary={activeBlockTimeSummary}
                cheapestActivePackageRatePerHour={cheapestActivePackageRatePerHour}
              />

              <div
                className={`mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3 ${
                  bookingTypeLocked ? "pointer-events-none select-none" : ""
                }`}
              >
                {/* ── Single day ── */}
                <button
                  type="button"
                  disabled={bookingTypeLocked}
                  onClick={() => handleBookingModeChange("single")}
                  className={`relative overflow-hidden rounded-2xl border-2 p-4 md:p-4 text-left transition-all duration-150 disabled:cursor-not-allowed min-h-[280px] lg:min-h-[300px] cursor-pointer ${
                    bookingTypeLocked
                      ? "border-[#b8c9dd] bg-[#dbeafe]"
                      : bookingMode === "single"
                        ? "border-[#1a4fd6] bg-[#eef4ff] shadow-sm"
                        : "border-dashed border-[#c7d8f5] bg-[#f7fbff] hover:border-[#1a4fd6] hover:bg-[#eef4ff] hover:shadow-sm"
                  }`}
                >
                  {bookingTypeLocked && <div className="absolute inset-0 bg-white/18" />}
                    <div className={`relative z-10 flex h-full flex-col ${bookingTypeLocked ? "text-[#152d5a]" : ""}`}>
                      <div
                        className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full border ${
                          bookingTypeLocked
                              ? "border-[#b9cae1] bg-white/70 text-[#1a4fd6]"
                          : "border-[#c7d8f5] bg-white text-[#1a4fd6]"
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >
                        calendar_month
                      </span>
                    </div>

                    <p
                      className={`text-[17px] font-extrabold tracking-tight leading-tight mb-1.5 ${
                        bookingTypeLocked ? "text-[#152d5a]" : bookingMode === "single" ? "text-[#152d5a]" : "text-[#374151]"
                      }`}
                    >
                      Single day
                    </p>
                    <p className={`text-[13px] leading-relaxed mb-3 ${bookingTypeLocked ? "text-[#4b6390]" : "text-[#6b7280]"}`}>
                      Depart and return on the same date. Billed on actual hours flown.
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                          bookingTypeLocked
                              ? "border border-[#b8c9dd] bg-white/75 text-[#1640b0]"
                            : "bg-[#dde8f5] text-[#1640b0]"
                        }`}
                      >
                        Same-day return
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                          bookingTypeLocked
                              ? "border border-[#b8c9dd] bg-white/75 text-[#1640b0]"
                            : "bg-[#dde8f5] text-[#1640b0]"
                        }`}
                      >
                        No min. hours
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                          bookingTypeLocked
                              ? "border border-[#b8c9dd] bg-white/75 text-[#1640b0]"
                            : "bg-[#dde8f5] text-[#1640b0]"
                        }`}
                      >
                        {formatHourlyRate(displayedRatePerHour)}
                      </span>
                    </div>

                    {bookingTypeLocked ? (
                      <div className="mt-auto pt-4 border-t border-[#b8c9dd] flex items-center justify-center gap-2 text-sm font-semibold text-[#152d5a]">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#b8c9dd] bg-white/75">
                          <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">
                            lock
                          </span>
                        </span>
                        <span>Locked until documents are approved</span>
                      </div>
                    ) : null}
                  </div>
                </button>

                {/* ── Multi-day ── */}
                <button
                  type="button"
                  disabled={bookingTypeLocked}
                  onClick={() => handleBookingModeChange("multi")}
                  className={`relative overflow-hidden rounded-2xl border-2 p-4 md:p-4 text-left transition-all duration-150 disabled:cursor-not-allowed min-h-[280px] lg:min-h-[300px] cursor-pointer ${
                    bookingTypeLocked
                      ? "border-[#b8c9dd] bg-[#dbeafe]"
                      : bookingMode === "multi"
                        ? "border-[#d97706] bg-[#fff8e8] shadow-sm"
                        : "border-dashed border-[#ead7ac] bg-[#fffdf6] hover:border-[#d97706] hover:bg-[#fff8e8] hover:shadow-sm"
                  }`}
                >
                  {bookingTypeLocked && <div className="absolute inset-0 bg-white/18" />}
                  <div className={`relative z-10 flex h-full flex-col ${bookingTypeLocked ? "text-[#152d5a]" : ""}`}>
                    <div
                      className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full border ${
                          bookingTypeLocked
                              ? "border-[#b9cae1] bg-white/70 text-[#1a4fd6]"
                          : "border-[#f1d58f] bg-white text-[#92400e]"
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >
                        calendar_month
                      </span>
                    </div>

                    <p
                      className={`text-[17px] font-extrabold tracking-tight leading-tight mb-1.5 ${
                        bookingTypeLocked ? "text-[#152d5a]" : bookingMode === "multi" ? "text-[#152d5a]" : "text-[#374151]"
                      }`}
                    >
                      Multi-day
                    </p>
                    <p className={`text-[13px] leading-relaxed mb-3 ${bookingTypeLocked ? "text-[#4b6390]" : "text-[#6b7280]"}`}>
                      Aircraft stays with you overnight across multiple consecutive days.
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                          bookingTypeLocked
                              ? "border border-[#b8c9dd] bg-white/75 text-[#1640b0]"
                            : "bg-[#fef3c7] text-[#92400e]"
                        }`}
                      >
                        4 VDO hrs min. per 24h
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                          bookingTypeLocked
                              ? "border border-[#b8c9dd] bg-white/75 text-[#1640b0]"
                            : "bg-[#fee2e2] text-[#991b1b]"
                        }`}
                      >
                        Parking not included
                      </span>
                    </div>

                    {bookingTypeLocked ? (
                      <div className="mt-auto pt-4 border-t border-[#b8c9dd] flex items-center justify-center gap-2 text-sm font-semibold text-[#152d5a]">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#b8c9dd] bg-white/75">
                          <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">
                            lock
                          </span>
                        </span>
                        <span>Locked until documents are approved</span>
                      </div>
                    ) : null}
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div
            className={
              bookingMode === null
                ? "hidden"
                : ""
            }
          >
            {bookingMode === "single" ? (
              <section className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-7 h-7 rounded-full bg-[#1a4fd6] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  1
                </div>
                <span className="text-sm font-semibold text-[#152d5a]">
                  Choose your time
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="text-xs font-medium text-[#6b7280]">
                      Booking date
                    </label>
                    <span className="text-[10px] text-[#9ca3af]">
                      Sydney time (AEST/AEDT)
                    </span>
                  </div>
                  <DateInput
                    value={startDate}
                    min={minDate}
                    onChange={handleStartDateChange}
                  />
                  {startDate && (
                    <p className="text-[11px] text-[#64748b] mt-1.5">
                      {formatDateDisplay(startDate)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#6b7280] mb-1.5">
                    Start time
                  </label>
                  <TimeSelect
                    value={startTime}
                    options={startTimeOptions}
                    disabled={!startDate}
                    placeholder="Select time"
                    onChange={handleStartTimeChange}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#6b7280] mb-1.5">
                    End time
                  </label>
                  <TimeSelect
                    value={endTime}
                    options={endTimeOptions}
                    disabled={!startDate}
                    placeholder="Select time"
                    onChange={setEndTime}
                  />
                  {endIsBeforeStart && (
                    <p className="text-[11px] text-[#e11d48] mt-1.5">
                      Must be after departure
                    </p>
                  )}
                </div>
              </div>

              <AvailabilityStatus
                availability={availability}
                startDT={startDT}
                endDT={endDT}
                endIsBeforeStart={endIsBeforeStart}
              />

              {activeBookingDate && (
                <div className="bg-[#f8faff] border border-[#e2e8f0] rounded-2xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-0.5">
                        Same-day booking
                      </p>
                      <p className="text-base font-semibold text-[#152d5a]">
                        Select your time on{" "}
                        {new Date(
                          `${activeBookingDate}T00:00:00`,
                        ).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between mb-2">
                    {["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"].map(
                      (lbl, i) => (
                        <span key={i} className="text-[10px] text-[#94a3b8]">
                          {lbl}
                        </span>
                      ),
                    )}
                  </div>

                  {(() => {
                    const startPct = timeToPct(startTime || "00:00");
                    const endPct = timeToPct(endTime || "00:00");
                    const tooClose = Math.abs(endPct - startPct) < 10;
                    const conflictSegments =
                      availability.status === "unavailable"
                        ? availability.conflicts
                        : [];

                    return (
                      <div
                        ref={trackRef}
                        className="relative h-14 sm:h-10 rounded-lg overflow-hidden border bg-[#f0fdf4] border-green-200 select-none mb-5"
                        style={{
                          cursor: dragging ? "grabbing" : "default",
                          touchAction: "none",
                        }}
                        onPointerMove={(e) => {
                          if (!dragging) return;
                          const pct = getPctFromPointer(e, trackRef);
                          const newTime = pctToTime(pct);
                          if (dragging === "start") {
                            if (pct < timeToPct(endTime || "17:00") - 2) {
                              setStartTime(newTime);
                            }
                          } else if (
                            pct >
                            timeToPct(startTime || "09:00") + 2
                          ) {
                            setEndTime(newTime);
                          }
                        }}
                        onPointerUp={() => {
                          if (trackRef.current) {
                            try {
                              trackRef.current.releasePointerCapture(
                                (window as any).__timelineCapturedPointerId,
                              );
                            } catch {}
                          }
                          setDragging(null);
                        }}
                      >
                        {conflictSegments.map((segment, i) => {
                          const startMins = sydIsoToMinutes(segment.start_time);
                          const endMins = sydIsoToMinutes(segment.end_time);
                          return (
                            <div
                              key={`${segment.start_time}-${segment.end_time}-${i}`}
                              className="absolute inset-y-0 bg-red-500/60"
                              style={{
                                left: `${(startMins / 1440) * 100}%`,
                                width: `${Math.max(0, ((endMins - startMins) / 1440) * 100)}%`,
                              }}
                              title={segment.label}
                            />
                          );
                        })}
                        {startTime && endTime && (
                          <>
                            <div
                              className="absolute inset-y-0 bg-[#1a4fd6]/20 border-2 border-[#1a4fd6] rounded-lg"
                              style={{
                                left: `${startPct}%`,
                                width: `${Math.max(0, endPct - startPct)}%`,
                              }}
                            />

                            <div
                              className="absolute flex flex-col items-center"
                              style={{
                                left: `${startPct}%`,
                                top: "50%",
                                transform: "translate(-50%, -50%)",
                              }}
                            >
                              <div
                                className="bg-[#1a4fd6] text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-sm mb-1 pointer-events-none"
                                style={{ marginLeft: tooClose ? -32 : 0 }}
                              >
                                {fmtTime(startTime)}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-transparent border-t-[#1a4fd6]" />
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full bg-[#1a4fd6] border-2 border-white shadow-md transition-transform ${
                                  dragging === "start"
                                    ? "scale-125"
                                    : "hover:scale-110"
                                }`}
                                style={{ cursor: "grab", marginTop: 2 }}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (trackRef.current) {
                                    trackRef.current.setPointerCapture(
                                      e.pointerId,
                                    );
                                    (window as any).__timelineCapturedPointerId =
                                      e.pointerId;
                                  }
                                  setDragging("start");
                                }}
                              />
                            </div>

                            <div
                              className="absolute flex flex-col items-center"
                              style={{
                                left: `${endPct}%`,
                                top: "50%",
                                transform: "translate(-50%, -50%)",
                              }}
                            >
                              <div
                                className="bg-[#1a4fd6] text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-sm mb-1 pointer-events-none"
                                style={{ marginLeft: tooClose ? 32 : 0 }}
                              >
                                {fmtTime(endTime)}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-transparent border-t-[#1a4fd6]" />
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full bg-[#1a4fd6] border-2 border-white shadow-md transition-transform ${
                                  dragging === "end"
                                    ? "scale-125"
                                    : "hover:scale-110"
                                }`}
                                style={{ cursor: "grab", marginTop: 2 }}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (trackRef.current) {
                                    trackRef.current.setPointerCapture(
                                      e.pointerId,
                                    );
                                    (window as any).__timelineCapturedPointerId =
                                      e.pointerId;
                                  }
                                  setDragging("end");
                                }}
                              />
                            </div>
                          </>
                        )}

                        {(!startTime || !endTime) && (
                          <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ top: 0 }}
                          >
                            <p className="text-xs text-[#9ca3af]">
                              Select start and end time above to see your slot
                              on the timeline
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex items-start gap-3 bg-[#f0f6ff] border border-[#dde8f5] rounded-xl px-4 py-3">
                    <svg
                      className="w-4 h-4 text-[#1a4fd6] flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm text-[#1a4fd6]">
                      Aircraft reserved{" "}
                      <strong>{fmtTime(startTime || "09:00")}</strong> to{" "}
                      <strong>{fmtTime(endTime || "17:00")}</strong>
                      {startDate
                        ? ` on ${formatDateDisplay(startDate)}.`
                        : "."}{" "}
                      Drag the handles to adjust.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                {/* Section 2 — Booking summary */}
                <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("summary")}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        openSections.summary
                          ? "bg-[#1a4fd6] text-white"
                          : "bg-[#f0f6ff] border border-[#c7d8f5] text-[#1a4fd6]"
                      }`}
                    >
                      2
                    </div>
                    <span className="text-sm font-semibold text-[#152d5a]">
                      Booking summary
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-[#94a3b8] transition-transform ${
                      openSections.summary ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {openSections.summary && (
                  <div className="px-5 pb-5 border-t border-[#f1f5f9]">
                    <div className="flex items-center gap-3 py-4 border-b border-[#f1f5f9]">
                      <svg
                        className="w-4 h-4 text-[#94a3b8] flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <div>
                        <div className="text-sm font-semibold text-[#152d5a]">
                          {activeBookingDate
                            ? formatShortDateDisplay(activeBookingDate)
                            : "—"}
                        </div>
                        <div className="text-xs text-[#6b7280]">
                          {activeBookingDate
                            ? `${new Date(`${activeBookingDate}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long" })}, Single day`
                            : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 py-4 border-b border-[#f1f5f9]">
                      <svg
                        className="w-4 h-4 text-[#94a3b8] flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 7v5l3 2"
                        />
                      </svg>
                      <div>
                        <div className="text-sm font-semibold text-[#152d5a]">
                          {fmtTime(startTime) || "—"}
                        </div>
                        <div className="text-xs text-[#94a3b8]">Start</div>
                      </div>
                      <svg
                        className="w-4 h-4 text-[#94a3b8]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 12h14"
                        />
                      </svg>
                      <div>
                        <div className="text-sm font-semibold text-[#152d5a]">
                          {fmtTime(endTime) || "—"}
                        </div>
                        <div className="text-xs text-[#94a3b8]">End</div>
                      </div>
                      <div className="ml-auto">
                        <div className="text-sm font-bold text-[#1a4fd6]">
                          {bookingSummaryDurationLabel}
                        </div>
                        <div className="text-xs text-[#94a3b8]">Duration</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-3">
                      <svg
                        className="w-3.5 h-3.5 text-[#22c55e]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-xs text-[#6b7280]">
                        Same-day booking
                      </span>
                    </div>
                  </div>
                )}
                </div>

                {/* Section 3 — Pricing summary */}
                <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection("pricing")}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        openSections.pricing
                          ? "bg-[#1a4fd6] text-white"
                          : "bg-[#f0f6ff] border border-[#c7d8f5] text-[#1a4fd6]"
                      }`}
                    >
                      3
                    </div>
                    <span className="text-sm font-semibold text-[#152d5a]">
                      Pricing summary
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-[#94a3b8] transition-transform ${
                      openSections.pricing ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {openSections.pricing && (
                  <div className="px-5 pb-5 border-t border-[#f1f5f9] space-y-3 pt-4">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-[#6b7280]">
                        Billing type
                      </span>
                      <span className="text-sm font-semibold text-[#152d5a]">
                        Actual VDO hours flown
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-[#6b7280]">Hire type</span>
                      <span className="text-sm font-semibold text-[#152d5a]">
                        Wet hire · GST incl.
                      </span>
                    </div>
                    <div className="border-t border-[#f1f5f9] pt-3 flex justify-between items-baseline">
                      <span className="text-sm text-[#6b7280]">Rate</span>
                      <span className="text-lg font-bold text-[#152d5a]">
                        {activeBlockTimeSummary ? (
                          <span className="flex flex-col items-end">
                            <span className="mt-3 text-sm line-through text-[#4b6390]/70">
                              {formatHourlyRate(payfRatePerHour)}
                            </span>
                            <span className="font-serif text-3xl font-normal text-[#1a4fd6]">
                              {formatHourlyRate(displayedRatePerHour)}
                            </span>
                          </span>
                        ) : estimatedHours != null
                          ? `$${getVdoHourlyRate(estimatedHours)}/hr`
                          : "From $290–$330/hr"}
                      </span>
                    </div>
                    <div className="flex items-center pt-1">
                      <p className="text-sm text-[#94a3b8] leading-relaxed">
                        +$28.95 per landing · Final invoice after flight record
                        submitted.
                      </p>
                    </div>
                  </div>
                )}
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="bg-white border border-[#e2e8f0] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-7 h-7 rounded-full bg-[#1a4fd6] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    1
                  </div>
                  <h2
                    className="text-xl font-semibold text-[#152d5a]"
                    style={{ fontFamily: "Newsreader, serif" }}
                  >
                    Your multi-day booking
                  </h2>
                </div>
                <p className="text-sm text-[#6b7280] mb-4">
                  Choose your start and return date &amp; time. Full days in
                  between are reserved automatically.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[32px]">
                      <label className="text-xs font-medium text-[#6b7280]">
                        Start date
                      </label>
                      <span className="text-[10px] text-[#9ca3af] leading-tight text-right">
                        Sydney time (AEST/AEDT)
                      </span>
                    </div>
                    <DateInput
                      value={startDate}
                      min={minDate}
                      onChange={handleStartDateChange}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="block text-xs font-medium text-[#6b7280] mb-1.5 min-h-[32px]">
                      Start time
                    </label>
                    <TimeSelect
                      value={startTime}
                      options={startTimeOptions}
                      disabled={!startDate}
                      placeholder="Select time"
                      onChange={handleStartTimeChange}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="block text-xs font-medium text-[#6b7280] mb-1.5 min-h-[32px]">
                      Return date
                    </label>
                    <DateInput
                      value={returnDate}
                      min={multiReturnMinDate}
                      disabled={!startDate}
                      onChange={handleReturnDateChange}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="block text-xs font-medium text-[#6b7280] mb-1.5 min-h-[32px]">
                      Return time
                    </label>
                    <TimeSelect
                      value={returnTime}
                      options={returnTimeOptions}
                      disabled={!returnDate}
                      placeholder="Select time"
                      onChange={setReturnTime}
                    />
                  </div>
                </div>
              </section>

              {startDate && returnDate && bookingDayCount >= 2 && (
                <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6">
                  <div className={`mb-3 ${bookingDayCount > 4 ? "overflow-x-auto pb-2" : ""}`}>
                    <div className={`flex items-stretch gap-2 ${bookingDayCount > 4 ? "min-w-max" : "justify-between"}`}>
                    {(() => {
                      const dates: Date[] = [];
                      const cur = new Date(`${startDate}T12:00:00`);
                      const end = new Date(`${returnDate}T12:00:00`);
                      while (cur <= end) {
                        dates.push(new Date(cur));
                        cur.setDate(cur.getDate() + 1);
                      }
                      return dates.map((date, i) => {
                        const isFirst = i === 0;
                        const isLast = i === dates.length - 1;
                        const isMiddle = !isFirst && !isLast;
                        const dayLabel = date
                          .toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                          })
                          .toUpperCase();
                        return (
                          <div
                            key={`${date.toISOString()}-${i}`}
                            className={`rounded-xl border p-3 text-center ${bookingDayCount > 4 ? "w-[96px] sm:w-[112px] flex-shrink-0" : "flex-1"} ${isFirst || isLast ? "border-[#1a4fd6] bg-[#f0f6ff]" : "border-[#e2e8f0] bg-[#f8fafc]"}`}
                          >
                            <div className="text-xs font-bold text-[#152d5a] mb-0.5">
                              {dayLabel}
                            </div>
                            {isFirst && (
                              <>
                                <div className="text-[11px] text-[#6b7280]">
                                  Start day
                                </div>
                                <div className="text-xs font-semibold text-[#152d5a]">
                                  {formatTimeLabel(startTime || "09:00")}
                                </div>
                              </>
                            )}
                            {isMiddle && (
                              <>
                                <div className="flex items-center justify-center gap-1 text-[11px] text-[#6b7280]">
                                  <svg
                                    className="w-3 h-3 text-[#94a3b8]"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                    />
                                  </svg>
                                  Full day
                                </div>
                                <div className="text-xs text-[#94a3b8]">
                                  Reserved
                                </div>
                              </>
                            )}
                            {isLast && (
                              <>
                                <div className="text-[11px] text-[#6b7280]">
                                  Return day
                                </div>
                                <div className="text-xs font-semibold text-[#152d5a]">
                                  {formatTimeLabel(returnTime || "17:00")}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      });
                    })()}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3">
                    <svg
                      className="w-4 h-4 text-[#6b7280] flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="text-sm text-[#6b7280]">
                      <div>
                        Bookings over 24 hours are reserved continuously for
                        this period.
                      </div>
                      <div>
                        Billing is based on actual VDO hours flown, with a
                        minimum of 4 VDO hours per 24 hours booked.
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <AvailabilityStatus
                      availability={availability}
                      startDT={startDT}
                      endDT={endDT}
                      endIsBeforeStart={endIsBeforeStart}
                    />
                  </div>
                </div>
              )}

              <div className="bg-white border border-[#e2e8f0] rounded-2xl px-6 py-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-7 h-7 rounded-full bg-[#1a4fd6] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    2
                  </div>
                  <span className="text-sm font-semibold text-[#152d5a]">
                    Pricing summary
                  </span>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8faff] p-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="material-symbols-outlined text-[#94a3b8] text-[18px] flex-shrink-0"
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >
                        calendar_month
                      </span>
                      <div>
                        <div className="text-[13px] text-[#6b7280] md:text-sm">
                          Booking type
                        </div>
                        <div className="text-[15px] font-semibold text-[#152d5a] md:text-base">
                          Multi-day hire
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    ref={multiDayMinimumInfoRef}
                    className="relative rounded-2xl border border-[#e2e8f0] bg-[#f8faff] p-4"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="material-symbols-outlined text-[#94a3b8] text-[18px] flex-shrink-0 mt-0.5"
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >
                        schedule
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-[13px] text-[#6b7280] md:text-sm">
                            Minimum billable VDO
                          </div>
                          <button
                            type="button"
                            onClick={() => setMultiDayMinimumInfoOpen((value) => !value)}
                            aria-label="Explain the minimum billable VDO rule"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#1a4fd6] transition-colors hover:bg-[#e0edff] hover:text-[#1540a8]"
                          >
                            <span
                              className="material-symbols-outlined text-[15px]"
                              style={{ fontVariationSettings: "'wght' 300" }}
                            >
                              info
                            </span>
                          </button>
                        </div>
                        <div className="text-[15px] font-semibold text-[#152d5a] md:text-base">
                          {multiDayMinimumVdoHours
                            ? `${multiDayMinimumVdoHours} VDO hours`
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {multiDayMinimumInfoOpen ? (
                      <div className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-10 rounded-2xl border border-[#152d5a]/15 bg-white p-4 shadow-[0_16px_40px_rgba(21,45,90,0.16)]">
                        <p className="text-[13px] leading-6 text-[#4b6390]">
                          Each day of a multi-day booking is billed a minimum of 4 VDO hours, even if you fly less. If you fly more than 4 hours on a given day, you're billed for the actual hours flown that day. This minimum applies per day, not across the whole booking.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8faff] p-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="material-symbols-outlined text-[#94a3b8] text-[18px] flex-shrink-0"
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >
                        payments
                      </span>
                      <div>
                        <div className="text-[13px] text-[#6b7280] md:text-sm">
                          Final billing
                        </div>
                        <div className="text-[15px] font-semibold text-[#152d5a] md:text-base">
                          Based on actual VDO hours flown
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {hasInvalidMultiDayRange && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                  Return date must be after the departure date.
                </div>
              )}

            </>
          )}

          <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("notes")}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    openSections.notes
                      ? "bg-[#1a4fd6] text-white"
                          : "bg-[#f0f6ff] border border-[#c7d8f5] text-[#1a4fd6]"
                  }`}
                >
                  {bookingMode === "single" ? 4 : 3}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#152d5a]">
                    Optional notes
                  </div>
                  {!openSections.notes && notes && (
                    <div className="text-xs text-[#6b7280] truncate max-w-[200px]">
                      {notes}
                    </div>
                  )}
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-[#94a3b8] transition-transform ${
                  openSections.notes ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {openSections.notes && (
              <div className="px-5 pb-5 border-t border-[#f1f5f9] pt-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any special requests, route intentions, or passenger details here..."
                  maxLength={300}
                  rows={3}
                  className="w-full border border-[#e2e8f0] rounded-xl px-4 py-3 text-sm text-[#152d5a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 focus:border-[#1a4fd6] resize-none"
                />
                <p className="text-[11px] text-[#94a3b8] text-right mt-1">
                  {notes.length} / 300
                </p>
              </div>
            )}
          </div>

          </div>
        </form>

        {/* ── Sticky booking summary footer ── */}
        {bookingMode !== null && (
          <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 z-[60] bg-white border-t border-[#e2e8f0] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)]">
            <div className="max-w-4xl mx-auto px-4 pt-3 pb-3 sm:pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {/* Aircraft thumbnail + name */}
              <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#e2e8f0] bg-[#f0f4fa] flex items-center justify-center">
                  <img
                    src="/Logo/ozrentaplane-logo.png"
                    alt="VH-KZG"
                    className="w-full h-full object-contain p-1"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#152d5a] leading-tight">{aircraftRegistration}</p>
                  <p className="text-[10px] text-[#6b7280]">4 seats</p>
                </div>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-8 bg-[#e2e8f0] flex-shrink-0" />

              {/* Booking details */}
              <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0 overflow-visible">
                {bookingMode === "single" && startDate && (
                  <>
                    <div className="flex-shrink-0">
                      <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Date</p>
                      <p className="text-base font-semibold text-[#152d5a]">
                        {formatDateDisplay(startDate)}
                      </p>
                    </div>
                    {startTime && (
                      <>
                        <svg className="w-3.5 h-3.5 text-[#d1d5db] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <div className="flex-shrink-0">
                          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Start</p>
                          <p className="text-base font-semibold text-[#152d5a]">{fmtTime(startTime)}</p>
                        </div>
                      </>
                    )}
                    {endTime && (
                      <>
                        <svg className="w-3.5 h-3.5 text-[#d1d5db] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <div className="flex-shrink-0">
                          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">End</p>
                          <p className="text-base font-semibold text-[#152d5a]">{fmtTime(endTime)}</p>
                        </div>
                        {estimatedHours && (
                          <>
                            <div className="w-px h-6 bg-[#e2e8f0] flex-shrink-0" />
                            <div className="flex-shrink-0">
                              <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Duration</p>
                              <p className="text-base font-semibold text-[#1a4fd6]">{formatDuration(estimatedHours)}</p>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}

                {bookingMode === "multi" && startDate && (
                  <>
                    <div className="flex-shrink-0">
                      <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Start</p>
                      <p className="text-base font-semibold text-[#152d5a]">
                        {new Date(`${startDate}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        {startTime && <span className="text-[#6b7280] font-normal ml-1">{fmtTime(startTime)}</span>}
                      </p>
                    </div>
                    {returnDate && (
                      <>
                        <svg className="w-3.5 h-3.5 text-[#d1d5db] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <div className="flex-shrink-0">
                          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Return</p>
                          <p className="text-base font-semibold text-[#152d5a]">
                            {new Date(`${returnDate}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                            {returnTime && <span className="text-[#6b7280] font-normal ml-1">{fmtTime(returnTime)}</span>}
                          </p>
                        </div>
                        {bookingDayCount >= 2 && (
                          <>
                            <div className="w-px h-6 bg-[#e2e8f0] flex-shrink-0" />
                            <div className="flex-shrink-0">
                              <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Duration</p>
                              <p className="text-base font-semibold text-[#1a4fd6]">{bookingDayCount} day{bookingDayCount !== 1 ? "s" : ""}</p>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}

                {((bookingMode === "single" && !startDate) || (bookingMode === "multi" && !startDate)) && (
                  <p className="text-sm text-[#9ca3af]">Select your dates to see a summary here</p>
                )}
              </div>

              {/* CTA button */}
              <button
                type="submit"
                form="booking-request-form"
                disabled={!canSubmit}
                className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 bg-[#1a4fd6] hover:bg-[#1540b0] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-7 py-3.5 rounded-xl transition-colors text-base whitespace-nowrap"
              >
                Continue to Review
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Trust line + error */}
            {(submitError || canSubmit) && (
              <div className="max-w-4xl mx-auto px-4 pb-2 flex items-center justify-center sm:justify-end gap-2">
                {submitError ? (
                  <p className="text-xs text-rose-600 flex items-center gap-1.5">
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {submitError}
                  </p>
                ) : (
                  <p className="text-[10px] text-[#6b7280] flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-[#22c55e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Your booking request will be reviewed by our operations team.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
