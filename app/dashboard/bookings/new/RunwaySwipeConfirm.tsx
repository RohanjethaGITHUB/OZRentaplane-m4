"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Plane } from "lucide-react";

type Props = {
  onConfirm: () => Promise<void>;
  onError?: (message: string) => void;
  label?: string;
};

const HANDLE_WIDTH = 58;
const CONFIRM_THRESHOLD = 0.94;

export default function RunwaySwipeConfirm({
  onConfirm,
  onError,
  label = "Slide to confirm booking",
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const pointerIdRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const maxTravelRef = useRef(0);

  const [position, setPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    function recomputeBounds() {
      const track = trackRef.current;
      if (!track) return;
      const maxTravel = Math.max(0, track.clientWidth - HANDLE_WIDTH);
      maxTravelRef.current = maxTravel;
      setPosition((current) => Math.min(current, maxTravel));
    }

    recomputeBounds();
    window.addEventListener("resize", recomputeBounds);
    return () => window.removeEventListener("resize", recomputeBounds);
  }, []);

  async function confirmIfReachedEnd(nextPosition: number) {
    const maxTravel = maxTravelRef.current;
    const isConfirmed = maxTravel > 0 && nextPosition >= maxTravel * CONFIRM_THRESHOLD;

    if (!isConfirmed) {
      if (mountedRef.current) setPosition(0);
      return;
    }

    if (mountedRef.current) setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      onError?.(message);
      if (mountedRef.current) {
        setPosition(0);
      }
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
        pointerIdRef.current = null;
        setIsDragging(false);
      }
    }
  }

  function updatePositionFromPointer(clientX: number) {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const maxTravel = Math.max(0, rect.width - HANDLE_WIDTH);
    maxTravelRef.current = maxTravel;
    const next = Math.min(maxTravel, Math.max(0, clientX - rect.left - dragOffsetRef.current));
    setPosition(next);
    return next;
  }

  function resetInteraction() {
    pointerIdRef.current = null;
    setIsDragging(false);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (isProcessing) return;
    const track = trackRef.current;
    if (!track) return;

    pointerIdRef.current = event.pointerId;
    const rect = track.getBoundingClientRect();
    dragOffsetRef.current = Math.min(HANDLE_WIDTH, Math.max(0, event.clientX - rect.left - position));
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!isDragging || pointerIdRef.current !== event.pointerId || isProcessing) return;
    const nextPosition = updatePositionFromPointer(event.clientX);
    if (nextPosition >= maxTravelRef.current * CONFIRM_THRESHOLD) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  async function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== event.pointerId || isProcessing) return;
    const nextPosition = updatePositionFromPointer(event.clientX);
    resetInteraction();
    await confirmIfReachedEnd(nextPosition);
  }

  function handlePointerCancel() {
    if (isProcessing) return;
    setPosition(0);
    resetInteraction();
  }

  const statusLabel = isProcessing
    ? "Confirming booking..."
    : isDragging
      ? "Release near the end to confirm"
      : label;

  return (
    <div className="w-full">
      <p className={`mb-2 text-sm font-medium transition-colors ${isDragging ? "text-[#1a4fd6]" : "text-[#4b6390]"}`}>
        {statusLabel}
      </p>

      <div className="relative">
        <div
          ref={trackRef}
          className="relative h-16 overflow-hidden rounded-2xl border border-slate-400/70 bg-[linear-gradient(180deg,#424b57_0%,#2f3742_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.28),0_12px_28px_rgba(15,23,42,0.18)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_42%),linear-gradient(90deg,rgba(255,255,255,0.03),transparent_18%,transparent_82%,rgba(255,255,255,0.03))]" />
          <div className="absolute inset-x-3 top-2 h-px bg-white/45" />
          <div className="absolute inset-x-3 bottom-2 h-px bg-white/25" />
          <div className="absolute inset-x-4 top-1.5 flex items-center justify-between">
            {Array.from({ length: 11 }).map((_, index) => (
              <span
                key={`top-edge-${index}`}
                className="h-1.5 w-1.5 rounded-full bg-[#ffdca8] shadow-[0_0_8px_rgba(255,220,168,0.7)]"
              />
            ))}
          </div>
          <div className="absolute inset-x-4 bottom-1.5 flex items-center justify-between">
            {Array.from({ length: 11 }).map((_, index) => (
              <span
                key={`bottom-edge-${index}`}
                className="h-1.5 w-1.5 rounded-full bg-[#fff4d6] shadow-[0_0_8px_rgba(255,244,214,0.65)]"
              />
            ))}
          </div>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-white/60" />
            <span className="h-px w-5 bg-white/50" />
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="h-px w-5 bg-white/50" />
            <span className="h-2 w-2 rounded-full bg-white/60" />
          </div>
          <div className="absolute inset-x-[18%] top-1/2 h-1.5 -translate-y-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.92)_0_12px,rgba(255,255,255,0)_12px_22px)] opacity-80 blur-[0.15px]" />
          <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-white/10 to-transparent" />
          <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-white/10 to-transparent" />
          <div className="absolute left-4 top-2 text-[10px] font-bold tracking-[0.35em] text-white/45">09</div>
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.12),rgba(255,255,255,0.45),rgba(255,255,255,0.12))] blur-[0.3px] transition-[width,opacity] duration-75"
            style={{ width: `${Math.max(0, position + HANDLE_WIDTH * 0.35)}px`, opacity: position > 0 ? 0.8 : 0 }}
          />

          <button
            ref={handleRef}
            type="button"
            aria-label="Drag to confirm booking"
            disabled={isProcessing}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className="absolute left-0 top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[#152d5a] shadow-[0_10px_24px_rgba(15,23,42,0.28)] transition-transform duration-75 touch-none disabled:cursor-not-allowed"
            style={{ transform: `translateX(${position}px) translateY(-50%)` }}
          >
            <Plane className="h-5 w-5 rotate-45" />
          </button>
        </div>

        {isProcessing ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/10 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full border border-[#1a4fd6]/20 bg-white px-4 py-2 text-sm font-semibold text-[#1a4fd6] shadow-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1a4fd6]/25 border-t-[#1a4fd6]" />
              Confirming...
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
