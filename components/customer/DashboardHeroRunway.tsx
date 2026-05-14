'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PilotClearanceStatus } from '@/lib/supabase/types'
import type { CheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'

type Props = {
  clearanceStatus: PilotClearanceStatus
  checkoutPaymentDisplayState: CheckoutPaymentDisplayState | null
  activeBooking: { id: string; status: string } | null
  blocked: boolean
}

type NodeDef = {
  key: string
  label: string
  icon: string
}

const PHASE1: NodeDef[] = [
  { key: 'account_created', label: 'ACCOUNT\nCREATED', icon: 'check' },
  { key: 'checkout_requested', label: 'CHECKOUT\nREQUESTED', icon: 'description' },
  { key: 'checkout_flight_booked', label: 'CHECKOUT\nFLIGHT BOOKED', icon: 'calendar_month' },
  { key: 'checkout_result', label: 'CHECKOUT\nRESULT', icon: 'verified_user' },
  { key: 'checkout_payment', label: 'CHECKOUT\nPAYMENT', icon: 'payments' },
  { key: 'ready_to_fly', label: 'READY\nTO FLY', icon: 'flag' },
]

const PHASE2: NodeDef[] = [
  { key: 'book_your_flight', label: 'BOOK YOUR\nFLIGHT', icon: 'flight' },
  { key: 'flight_confirmed', label: 'FLIGHT\nCONFIRMED', icon: 'check_circle' },
  { key: 'submit_flight_records', label: 'SUBMIT POST FLIGHT\nRECORDS', icon: 'assignment' },
  { key: 'flight_payment', label: 'FLIGHT\nPAYMENT', icon: 'payments' },
  { key: 'ready_for_next_flight', label: 'READY FOR\nNEXT FLIGHT', icon: 'star' },
]

// ─── shared progress helpers ─────────────────────────────────────────────────

function phase1Index(status: PilotClearanceStatus, paymentState: CheckoutPaymentDisplayState | null): number {
  if (status === 'checkout_required') return 0
  if (status === 'checkout_requested') return 1
  if (status === 'checkout_confirmed') return 2
  if (status === 'checkout_completed_under_review') return 3
  if (status === 'checkout_payment_required') return 4
  if (status === 'additional_checkout_required') return 3
  if (status === 'checkout_reschedule_required') return 3
  if (status === 'not_currently_eligible') return 3
  if (status === 'cleared_to_fly' && paymentState !== 'paid' && paymentState !== 'waived') return 4
  if (status === 'cleared_to_fly') return 5
  return 4
}

function checkoutResultLabel(status: PilotClearanceStatus): string {
  if (status === 'checkout_completed_under_review') return 'CHECKOUT\nRESULT PENDING'
  if (status === 'cleared_to_fly') return 'CHECKOUT COMPLETED\nSUCCESSFULLY'
  if (status === 'additional_checkout_required') return 'ADDITIONAL CHECKOUT\nREQUIRED'
  if (status === 'checkout_reschedule_required') return 'CHECKOUT RESCHEDULE\nREQUIRED'
  if (status === 'not_currently_eligible') return 'NOT CURRENTLY\nELIGIBLE'
  return 'CHECKOUT\nRESULT'
}

function checkoutPaymentLabel(paymentState: CheckoutPaymentDisplayState | null): string {
  if (paymentState === 'awaiting_payment') return 'PAYMENT\nREQUIRED'
  if (paymentState === 'awaiting_manual_payment_confirmation') return 'AWAITING PAYMENT\nCONFIRMATION'
  if (paymentState === 'paid') return 'PAYMENT\nCOMPLETE'
  if (paymentState === 'waived') return 'PAYMENT\nNOT REQUIRED'
  return 'CHECKOUT\nPAYMENT'
}

function phase2Index(bookingStatus: string | null): number {
  if (!bookingStatus) return 0
  if (['draft', 'pending_confirmation'].includes(bookingStatus)) return 0
  if (['confirmed', 'ready_for_dispatch', 'dispatched'].includes(bookingStatus)) return 1
  if (['awaiting_flight_record', 'flight_record_overdue', 'pending_post_flight_review', 'needs_clarification', 'post_flight_approved'].includes(bookingStatus)) return 2
  if (['invoice_generated', 'payment_pending', 'paid'].includes(bookingStatus)) return 3
  if (bookingStatus === 'completed') return 4
  return 0
}

// ─── desktop-only sub-components ────────────────────────────────────────────

function HangarSvg({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 94 70" className={className} aria-hidden="true">
      <path d="M5 26 L47 6 L89 26 V64 H5 Z" fill="rgba(24,38,61,0.86)" stroke="rgba(142,166,201,0.62)" strokeWidth="1.5" />
      <path d="M28 64 V34 H66 V64" fill="rgba(17,27,44,0.92)" stroke="rgba(126,150,188,0.66)" strokeWidth="1.4" />
      <path d="M32 37 H62" stroke="rgba(112,137,176,0.56)" strokeWidth="1" />
      <circle cx="47" cy="16" r="4" fill="none" stroke="rgba(139,160,194,0.62)" strokeWidth="1.2" />
      <path d="M18 64 H76" stroke="rgba(120,147,186,0.55)" strokeWidth="1" />
    </svg>
  )
}

function PlaneGlyph({ size = '30px' }: { size?: string }) {
  return (
    <span
      className="material-symbols-outlined block leading-none select-none"
      style={{
        fontSize: size,
        color: '#aec7f7',
        fontVariationSettings: "'FILL' 1",
        filter: 'drop-shadow(0 0 8px rgba(174,199,247,0.85))',
      }}
      aria-hidden="true"
    >
      flight
    </span>
  )
}

function Milestone({ x, y, node, state, muted, nodeSize, iconSize, labelOffset, trackHalfHeight, labelAbove }: {
  x: number
  y: number
  node: NodeDef
  state: 'done' | 'active' | 'future'
  muted?: boolean
  nodeSize: number
  iconSize: number
  labelOffset: number
  trackHalfHeight: number
  labelAbove?: boolean
}) {
  const active = state === 'active'
  const done = state === 'done'

  return (
    <div className="absolute" style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}>
      <div
        className={[
          'flex items-center justify-center rounded-full border backdrop-blur-[1px]',
          active ? 'border-[rgba(140,180,255,0.62)] bg-[rgba(15,30,51,0.68)] animate-[runwayPulseBlue_2.2s_ease-in-out_infinite]' : '',
          done ? 'border-[rgba(120,155,220,0.42)] bg-[rgba(15,26,48,0.56)] shadow-[0_0_10px_rgba(90,135,220,0.14)]' : '',
          !active && !done ? (muted ? 'border-[rgba(120,148,186,0.2)] bg-[rgba(10,25,45,0.46)]' : 'border-[rgba(130,160,210,0.26)] bg-[rgba(10,25,45,0.54)]') : '',
        ].join(' ')}
        style={{ width: nodeSize, height: nodeSize }}
      >
        <span
          className={[
            'material-symbols-outlined',
            active ? 'text-[#f4c943]' : '',
            done ? 'text-[#dbbe70]' : '',
            !active && !done ? (muted ? 'text-[rgba(146,168,196,0.52)]' : 'text-[rgba(190,205,230,0.72)]') : '',
          ].join(' ')}
          style={{ fontSize: iconSize, fontVariationSettings: "'FILL' 0, 'wght' 300, 'opsz' 24" }}
        >
          {node.icon}
        </span>
      </div>
      <p
        className={[
          'absolute whitespace-pre text-center uppercase leading-[1.16] text-[12px] font-semibold tracking-[0.12em]',
          active ? 'text-[rgba(200,220,255,0.92)]' : '',
          done ? 'text-[rgba(165,190,235,0.80)]' : '',
          !active && !done ? (muted ? 'text-[rgba(129,150,178,0.82)]' : 'text-[rgba(151,170,196,0.92)]') : '',
        ].join(' ')}
        style={labelAbove
          ? { bottom: `calc(50% + ${trackHalfHeight + labelOffset}px)`, left: '50%', transform: 'translateX(-50%)' }
          : { top: `calc(50% + ${trackHalfHeight + labelOffset}px)`, left: '50%', transform: 'translateX(-50%)' }}
      >
        {node.label}
      </p>
    </div>
  )
}

// ─── mobile milestone data (title-case labels for the new vertical design) ──

type MobileMilestoneDef = { key: string; label: string; icon: string }

const MOBILE_MILESTONES: MobileMilestoneDef[] = [
  { key: 'account_created',            label: 'Account Created',                 icon: 'check' },
  { key: 'checkout_requested',         label: 'Checkout Requested',              icon: 'description' },
  { key: 'checkout_flight_booked',     label: 'Checkout Flight Booked',          icon: 'calendar_month' },
  { key: 'checkout_completed',         label: 'Checkout Completed Successfully', icon: 'verified_user' },
  { key: 'checkout_payment',           label: 'Checkout Payment',                icon: 'payments' },
  { key: 'ready_to_fly',               label: 'Ready to Fly',                    icon: 'flag' },
  { key: 'book_your_flight',           label: 'Book Your Flight',                icon: 'flight' },
  { key: 'flight_confirmed',           label: 'Flight Confirmed',                icon: 'check_circle' },
  { key: 'submit_post_flight_records', label: 'Submit Post Flight Records',      icon: 'assignment' },
  { key: 'flight_payment',             label: 'Flight Payment',                  icon: 'payments' },
  { key: 'ready_for_next_flight',      label: 'Ready For Next Flight',           icon: 'star' },
]

// ─── main component ──────────────────────────────────────────────────────────

export default function DashboardHeroRunway({ clearanceStatus, checkoutPaymentDisplayState, activeBooking, blocked }: Props) {
  const [reduceMotion, setReduceMotion] = useState(true)

  // ── desktop plane animation state ─────────────────────────────────────────
  const [desktopPlaneLength, setDesktopPlaneLength] = useState(0)
  const [desktopPlanePoint, setDesktopPlanePoint] = useState({ x: 95, y: 140 })
  const [desktopPlaneAngle, setDesktopPlaneAngle] = useState(90)
  const desktopPathRef = useRef<SVGPathElement | null>(null)
  const desktopLengthRef = useRef(0)
  const desktopAnimRef = useRef<number | null>(null)
  const TAXI_ANIMATION_MS = 8700

  // ── mobile vertical animation state ───────────────────────────────────────
  const [mobileVisibleCount, setMobileVisibleCount] = useState(0)
  const mobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── derived progress indices ───────────────────────────────────────────────
  const p1 = phase1Index(clearanceStatus, checkoutPaymentDisplayState)
  const p2 = phase2Index(activeBooking?.status ?? null)
  const phase2Unlocked = clearanceStatus === 'cleared_to_fly'
  const isReadyToFlyComplete =
    clearanceStatus === 'cleared_to_fly'
    && (checkoutPaymentDisplayState === null || checkoutPaymentDisplayState === 'paid' || checkoutPaymentDisplayState === 'waived')

  // ── desktop layout constants ───────────────────────────────────────────────
  const topY = 242
  const runwayStroke = 42
  const curveRadius = 62
  const milestoneDiameter = runwayStroke - 2
  const milestoneIconSize = 17
  const milestoneLabelOffsetTop = 20
  const milestoneLabelOffsetBottom = 20
  const topTrackHalfHeight = runwayStroke / 2
  const bottomTrackHalfHeight = runwayStroke / 2
  const curveCenterY = topY + curveRadius
  const bottomY = topY + curveRadius * 2
  const topTrackCenterY = topY
  const bottomTrackCenterY = bottomY
  const startX = 150
  const topNodes = useMemo(() => [292, 442, 592, 742, 892], [])
  const bottomNodes = useMemo(() => [950, 780, 610, 440, 270], [])

  // ── mobile current index (used by both old plane path and new vertical) ───
  const mobileCurrentIndex = phase2Unlocked ? (6 + p2) : Math.min(p1, 5)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduceMotion(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── mobile vertical milestone animation ───────────────────────────────────
  useEffect(() => {
    if (reduceMotion) {
      setMobileVisibleCount(MOBILE_MILESTONES.length)
      return
    }
    setMobileVisibleCount(0)
    const scheduleNext = (i: number) => {
      if (i > MOBILE_MILESTONES.length) return
      mobileTimerRef.current = setTimeout(() => {
        setMobileVisibleCount(i)
        scheduleNext(i + 1)
      }, i === 0 ? 300 : 160)
    }
    scheduleNext(1)
    return () => { if (mobileTimerRef.current) clearTimeout(mobileTimerRef.current) }
  }, [reduceMotion])

  const topTargetX = topNodes[p1] ?? topNodes[0]
  const bottomTargetX = bottomNodes[p2] ?? bottomNodes[0]
  const finalReadyTarget = { x: 1086, y: curveCenterY - 28 }
  const topSectionCompleted = phase2Unlocked || p1 >= 5
  const curveSectionCompleted = phase2Unlocked || p1 >= 5
  const DEBUG_ALIGNMENT = false
  const desktopPlaneWidth = 36
  const desktopPlaneHeight = 36
  const assetOffsetDeg = 90
  const desktopHeadingRad = (desktopPlaneAngle * Math.PI) / 180
  const desktopNoseOffset = 14
  const desktopSpritePoint = {
    x: desktopPlanePoint.x - Math.cos(desktopHeadingRad) * desktopNoseOffset,
    y: desktopPlanePoint.y - Math.sin(desktopHeadingRad) * desktopNoseOffset,
  }

  useEffect(() => {
    const path = desktopPathRef.current
    if (!path) return
    const total = path.getTotalLength()

    const sampleTarget = phase2Unlocked ? { x: bottomTargetX, y: bottomY } : { x: topTargetX, y: topY }
    let bestLen = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i <= 800; i++) {
      const len = (total * i) / 800
      const pt = path.getPointAtLength(len)
      const d2 = (pt.x - sampleTarget.x) ** 2 + (pt.y - sampleTarget.y) ** 2
      if (d2 < bestDist) {
        bestDist = d2
        bestLen = len
      }
    }

    const startLen = 0
    const duration = reduceMotion ? 0 : TAXI_ANIMATION_MS
    if (desktopAnimRef.current) cancelAnimationFrame(desktopAnimRef.current)
    desktopLengthRef.current = 0
    setDesktopPlaneLength(0)

    const setFromLen = (len: number) => {
      const current = path.getPointAtLength(len)
      const next = path.getPointAtLength(Math.min(total, len + 3))
      const angle = (Math.atan2(next.y - current.y, next.x - current.x) * 180) / Math.PI
      setDesktopPlaneLength(len)
      setDesktopPlanePoint({ x: current.x, y: current.y })
      setDesktopPlaneAngle(angle)
    }
    setFromLen(0)

    if (duration === 0) {
      desktopLengthRef.current = bestLen
      setFromLen(bestLen)
      return
    }

    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const len = startLen + (bestLen - startLen) * eased
      desktopLengthRef.current = len
      setFromLen(len)
      if (p < 1) desktopAnimRef.current = requestAnimationFrame(tick)
    }
    desktopAnimRef.current = requestAnimationFrame(tick)
    return () => {
      if (desktopAnimRef.current) cancelAnimationFrame(desktopAnimRef.current)
    }
  }, [bottomTargetX, bottomY, phase2Unlocked, reduceMotion, topTargetX, topY])

  const phase1Nodes = useMemo<NodeDef[]>(() => ([
    PHASE1[0],
    PHASE1[1],
    PHASE1[2],
    { ...PHASE1[3], label: checkoutResultLabel(clearanceStatus) },
    { ...PHASE1[4], label: checkoutPaymentLabel(checkoutPaymentDisplayState) },
    PHASE1[5],
  ]), [checkoutPaymentDisplayState, clearanceStatus])

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mt-0 w-full max-w-[1420px]">

      {/* ── DESKTOP: original runway/SVG layout ── */}
      <div className="relative hidden h-[530px] md:block">
        <svg viewBox="0 0 1200 560" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="rw-base" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(12,24,42,0.72)" />
              <stop offset="100%" stopColor="rgba(9,20,35,0.78)" />
            </linearGradient>
            <linearGradient id="trail-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(245,252,255,0.96)" />
              <stop offset="100%" stopColor="rgba(210,232,255,0.06)" />
            </linearGradient>
            <filter id="trail-glow" x="-8%" y="-900%" width="116%" height="1900%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          <path d={`M${startX} ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="url(#rw-base)" strokeWidth={runwayStroke} fill="none" strokeLinecap="butt" />
          <path d={`M${startX} ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(130,160,210,0.20)" strokeWidth="1.1" fill="none" strokeLinecap="butt" />
          <path d={`M${startX} ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(120,160,255,0.08)" strokeWidth={runwayStroke} fill="none" strokeLinecap="butt" />

          {/* Taxiway */}
          <path d={`M95 160 L95 ${topY} H${startX}`} stroke="rgba(108,140,200,0.28)" strokeWidth="22" fill="none" strokeLinecap="butt" strokeLinejoin="round" />
          <path d={`M95 160 L95 ${topY} H${startX}`} stroke="rgba(11,20,40,0.96)" strokeWidth="20" fill="none" strokeLinecap="butt" strokeLinejoin="round" />
          {/* Hangar */}
          <path d="M52 160 L52 134 L95 112 L138 134 L138 160 Z" fill="rgba(16,28,50,0.94)" stroke="rgba(124,154,200,0.52)" strokeWidth="1.5" />
          <path d="M52 160 H138" stroke="rgba(86,116,164,0.34)" strokeWidth="0.8" />
          <path d="M62 160 V134 H128 V160 Z" fill="rgba(5,10,20,0.99)" />
          <path d="M63 159 V135 H127 V159 Z" fill="rgba(12,22,42,0.92)" />
          <path d="M52 134 H62 V160 H52 Z" fill="rgba(20,34,58,0.96)" stroke="rgba(100,130,178,0.28)" strokeWidth="0.8" />
          <path d="M128 134 H138 V160 H128 Z" fill="rgba(20,34,58,0.96)" stroke="rgba(100,130,178,0.28)" strokeWidth="0.8" />
          <circle cx="95" cy="122" r="3.5" fill="none" stroke="rgba(114,144,190,0.48)" strokeWidth="1.2" />

          <path d={`M${startX} ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(212,225,242,0.35)" strokeWidth="1.2" strokeDasharray="9 15" fill="none" strokeLinecap="butt" />

          {/* Trail glow */}
          <path d={`M95 160 L95 ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(186,219,255,0.18)" strokeWidth="26" fill="none" strokeLinecap="round" strokeDasharray={`${desktopPlaneLength} 99999`} filter="url(#trail-glow)" />
          <path d={`M95 160 L95 ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(226,240,255,0.11)" strokeWidth="38" fill="none" strokeLinecap="round" strokeDasharray={`${desktopPlaneLength} 99999`} filter="url(#trail-glow)" />
          <path ref={desktopPathRef} d={`M95 140 L95 ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="transparent" strokeWidth="1" fill="none" />

          {/* Top runway lights */}
          {Array.from({ length: 22 }).map((_, i) => {
            const x = 170 + i * 38
            const done = topSectionCompleted || x <= topTargetX
            return (
              <g key={`tl-${i}`}>
                {done ? (
                  <>
                    <circle cx={x} cy={topY - 22} r="3.6" fill="#5888dc" opacity="0.18" />
                    <circle cx={x} cy={topY - 22} r="2.2" fill="#90b8f8" opacity="0.52" />
                    <circle cx={x} cy={topY - 22} r="1.2" fill="#e4f2ff" opacity="0.98" />
                    <circle cx={x} cy={topY + 22} r="3.6" fill="#5888dc" opacity="0.18" />
                    <circle cx={x} cy={topY + 22} r="2.2" fill="#90b8f8" opacity="0.52" />
                    <circle cx={x} cy={topY + 22} r="1.2" fill="#e4f2ff" opacity="0.98" />
                  </>
                ) : (
                  <>
                    <circle cx={x} cy={topY - 22} r="3.6" fill="#5888dc" opacity="0.09" />
                    <circle cx={x} cy={topY - 22} r="2.2" fill="#7aa8f8" opacity="0.15" />
                    <circle cx={x} cy={topY - 22} r="1.2" fill="#b8d0ff" opacity="0.72" />
                    <circle cx={x} cy={topY + 22} r="3.6" fill="#5888dc" opacity="0.09" />
                    <circle cx={x} cy={topY + 22} r="2.2" fill="#7aa8f8" opacity="0.15" />
                    <circle cx={x} cy={topY + 22} r="1.2" fill="#b8d0ff" opacity="0.72" />
                  </>
                )}
              </g>
            )
          })}
          {/* Bottom runway lights */}
          {Array.from({ length: 22 }).map((_, i) => {
            const x = 154 + i * 39
            const done = phase2Unlocked && x >= bottomTargetX
            return (
              <g key={`bl-${i}`}>
                {done ? (
                  <>
                    <circle cx={x} cy={bottomY - 22} r="3.6" fill="#5888dc" opacity="0.18" />
                    <circle cx={x} cy={bottomY - 22} r="2.2" fill="#90b8f8" opacity="0.52" />
                    <circle cx={x} cy={bottomY - 22} r="1.2" fill="#e4f2ff" opacity="0.98" />
                    <circle cx={x} cy={bottomY + 22} r="3.6" fill="#5888dc" opacity="0.18" />
                    <circle cx={x} cy={bottomY + 22} r="2.2" fill="#90b8f8" opacity="0.52" />
                    <circle cx={x} cy={bottomY + 22} r="1.2" fill="#e4f2ff" opacity="0.98" />
                  </>
                ) : (
                  <>
                    <circle cx={x} cy={bottomY - 22} r="3.6" fill="#4870b8" opacity="0.08" />
                    <circle cx={x} cy={bottomY - 22} r="2.2" fill="#6888cc" opacity="0.12" />
                    <circle cx={x} cy={bottomY - 22} r="1.2" fill="#a8c0e8" opacity="0.65" />
                    <circle cx={x} cy={bottomY + 22} r="3.6" fill="#4870b8" opacity="0.08" />
                    <circle cx={x} cy={bottomY + 22} r="2.2" fill="#6888cc" opacity="0.12" />
                    <circle cx={x} cy={bottomY + 22} r="1.2" fill="#a8c0e8" opacity="0.65" />
                  </>
                )}
              </g>
            )
          })}
          {/* U-turn outer lights */}
          {Array.from({ length: 7 }).map((_, i) => {
            const a = -Math.PI / 2 + (Math.PI * i) / 6
            const x = 1030 + Math.cos(a) * (curveRadius + 18)
            const y = curveCenterY + Math.sin(a) * (curveRadius + 18)
            return (
              <g key={`cl-o-${i}`}>
                {curveSectionCompleted ? (
                  <>
                    <circle cx={x} cy={y} r="3.6" fill="#5888dc" opacity="0.18" />
                    <circle cx={x} cy={y} r="2.2" fill="#90b8f8" opacity="0.52" />
                    <circle cx={x} cy={y} r="1.2" fill="#e4f2ff" opacity="0.98" />
                  </>
                ) : (
                  <>
                    <circle cx={x} cy={y} r="3.6" fill="#4870b8" opacity="0.08" />
                    <circle cx={x} cy={y} r="2.2" fill="#6888cc" opacity="0.12" />
                    <circle cx={x} cy={y} r="1.2" fill="#a8c0e8" opacity="0.65" />
                  </>
                )}
              </g>
            )
          })}
          {/* U-turn inner lights */}
          {Array.from({ length: 5 }).map((_, i) => {
            const a = -Math.PI / 2 + (Math.PI * i) / 4
            const x = 1030 + Math.cos(a) * (curveRadius - 18)
            const y = curveCenterY + Math.sin(a) * (curveRadius - 18)
            return (
              <g key={`cl-i-${i}`}>
                {curveSectionCompleted ? (
                  <>
                    <circle cx={x} cy={y} r="3.6" fill="#5888dc" opacity="0.18" />
                    <circle cx={x} cy={y} r="2.2" fill="#90b8f8" opacity="0.52" />
                    <circle cx={x} cy={y} r="1.2" fill="#e4f2ff" opacity="0.98" />
                  </>
                ) : (
                  <>
                    <circle cx={x} cy={y} r="3.6" fill="#4870b8" opacity="0.07" />
                    <circle cx={x} cy={y} r="2.2" fill="#6888cc" opacity="0.10" />
                    <circle cx={x} cy={y} r="1.2" fill="#98b0d8" opacity="0.55" />
                  </>
                )}
              </g>
            )
          })}

          {/* Plane sprite */}
          <g transform={`rotate(${desktopPlaneAngle + assetOffsetDeg} ${desktopSpritePoint.x} ${desktopSpritePoint.y})`}>
            <foreignObject
              x={desktopSpritePoint.x - desktopPlaneWidth / 2}
              y={desktopSpritePoint.y - desktopPlaneHeight / 2}
              width={desktopPlaneWidth}
              height={desktopPlaneHeight}
            >
              <div className="h-full w-full flex items-center justify-center">
                <PlaneGlyph size="36px" />
              </div>
            </foreignObject>
          </g>

          {DEBUG_ALIGNMENT && (
            <g>
              <circle cx={desktopPlanePoint.x} cy={desktopPlanePoint.y} r="3.2" fill="#ef4444" />
              <circle cx={desktopPlanePoint.x} cy={desktopPlanePoint.y} r="2.1" fill="#22c55e" />
              <circle cx={desktopSpritePoint.x} cy={desktopSpritePoint.y} r="2.1" fill="#3b82f6" />
            </g>
          )}
        </svg>

        {topNodes.map((x, i) => (
          <Milestone
            key={phase1Nodes[i].key}
            x={x}
            y={topTrackCenterY}
            node={phase1Nodes[i]}
            state={i === p1 ? 'active' : i < p1 ? 'done' : 'future'}
            nodeSize={milestoneDiameter}
            iconSize={milestoneIconSize}
            labelOffset={milestoneLabelOffsetTop}
            trackHalfHeight={topTrackHalfHeight}
            labelAbove
          />
        ))}

        {/* Ready-to-fly marker on the curved segment */}
        <div className="absolute" style={{ left: finalReadyTarget.x, top: finalReadyTarget.y, transform: 'translate(-50%, -50%)' }}>
          <div
            className={[
              'flex items-center justify-center rounded-full border backdrop-blur-[1px]',
              isReadyToFlyComplete ? 'border-[rgba(140,180,255,0.62)] bg-[rgba(15,30,51,0.68)] animate-[runwayPulseBlue_2.2s_ease-in-out_infinite]' : 'border-[rgba(120,148,186,0.2)] bg-[rgba(10,25,45,0.46)]',
            ].join(' ')}
            style={{ width: milestoneDiameter, height: milestoneDiameter }}
          >
            <span
              className={[
                'material-symbols-outlined',
                isReadyToFlyComplete ? 'text-[#f4c943]' : 'text-[rgba(146,168,196,0.52)]',
              ].join(' ')}
              style={{ fontSize: milestoneIconSize, fontVariationSettings: "'FILL' 0, 'wght' 300, 'opsz' 24" }}
            >
              {phase1Nodes[5].icon}
            </span>
          </div>
          <p
            className={[
              'absolute whitespace-pre text-left uppercase leading-[1.16] text-[12px] font-semibold tracking-[0.12em]',
              isReadyToFlyComplete ? 'text-[rgba(200,220,255,0.92)]' : 'text-[rgba(129,150,178,0.82)]',
            ].join(' ')}
            style={{ left: `calc(50% + ${runwayStroke + 8}px)`, top: 'calc(50% - 6px)', transform: 'translateY(-50%)' }}
          >
            {phase1Nodes[5].label}
          </p>
        </div>

        {bottomNodes.map((x, i) => (
          <Milestone
            key={PHASE2[i].key}
            x={x}
            y={bottomTrackCenterY}
            node={PHASE2[i]}
            state={phase2Unlocked && i === p2 ? 'active' : phase2Unlocked && i < p2 ? 'done' : 'future'}
            muted={!phase2Unlocked}
            nodeSize={milestoneDiameter}
            iconSize={milestoneIconSize}
            labelOffset={milestoneLabelOffsetBottom}
            trackHalfHeight={bottomTrackHalfHeight}
          />
        ))}

        {blocked && <div className="absolute right-5 top-4 rounded-full border border-red-400/35 bg-red-500/12 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-red-200">Restricted</div>}
      </div>

      {/* ── MOBILE: new clean vertical journey card ── */}
      <div className="md:hidden px-3 pb-8 pt-2">
        <div
          className="mx-auto w-full max-w-[420px] rounded-2xl border border-[rgba(80,120,200,0.22)] bg-[rgba(8,18,36,0.72)] backdrop-blur-md px-5 py-6"
          style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.04)' }}
        >
          {blocked && (
            <div className="mb-4 rounded-full border border-red-400/35 bg-red-500/12 px-3 py-1 text-center text-[10px] uppercase tracking-[0.16em] text-red-200">
              Restricted
            </div>
          )}

          <div className="relative">
            {/* Base track line */}
            <div className="absolute left-[19px] top-[28px] bottom-[28px] w-px bg-[rgba(80,120,200,0.18)]" />

            {/* Illuminated portion up to current step */}
            {mobileCurrentIndex > 0 && (
              <div
                className="absolute left-[19px] top-[28px] w-px transition-all duration-700"
                style={{
                  height: `calc(${mobileCurrentIndex} * 64px)`,
                  background: 'linear-gradient(180deg, rgba(160,195,255,0.65) 0%, rgba(100,155,255,0.30) 100%)',
                  boxShadow: '0 0 8px rgba(140,180,255,0.35)',
                }}
              />
            )}

            <div className="space-y-0">
              {MOBILE_MILESTONES.map((milestone, i) => {
                const isActive = i === mobileCurrentIndex
                const isDone = i < mobileCurrentIndex
                const isVisible = i < mobileVisibleCount

                return (
                  <div
                    key={milestone.key}
                    className="relative flex items-center gap-4 py-2"
                    style={{
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? 'translateX(0)' : 'translateX(-6px)',
                      transition: 'opacity 0.35s ease, transform 0.35s ease',
                    }}
                  >
                    {/* Node circle */}
                    <div
                      className="relative z-10 flex-shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 38,
                        height: 38,
                        border: isActive
                          ? '2px solid rgba(244,201,67,0.85)'
                          : isDone
                          ? '1.5px solid rgba(120,160,240,0.55)'
                          : '1.5px solid rgba(80,110,170,0.25)',
                        background: isActive
                          ? 'rgba(244,201,67,0.12)'
                          : isDone
                          ? 'rgba(20,40,80,0.65)'
                          : 'rgba(10,22,42,0.52)',
                        boxShadow: isActive
                          ? '0 0 0 3px rgba(244,201,67,0.12), 0 0 18px rgba(244,201,67,0.30)'
                          : isDone
                          ? '0 0 10px rgba(100,150,240,0.18)'
                          : 'none',
                      }}
                    >
                      {isDone ? (
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 16, color: '#7aabf0', fontVariationSettings: "'FILL' 1, 'wght' 400" }}
                        >
                          check
                        </span>
                      ) : (
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: 16,
                            color: isActive ? '#f4c943' : 'rgba(100,130,180,0.45)',
                            fontVariationSettings: "'FILL' 0, 'wght' 300, 'opsz' 24",
                          }}
                        >
                          {milestone.icon}
                        </span>
                      )}
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[13.5px] leading-[1.3] font-medium"
                        style={{
                          color: isActive
                            ? 'rgba(230,240,255,0.96)'
                            : isDone
                            ? 'rgba(165,190,235,0.80)'
                            : 'rgba(100,125,165,0.70)',
                        }}
                      >
                        {milestone.label}
                      </p>
                      {isActive && (
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: '#f4c943' }}>
                          Current Step
                        </p>
                      )}
                      {isDone && (
                        <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'rgba(100,140,200,0.60)' }}>
                          Completed
                        </p>
                      )}
                      {!isActive && !isDone && (
                        <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'rgba(80,105,145,0.55)' }}>
                          Upcoming
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>

      <style jsx>{`
        @keyframes runwayPulseBlue {
          0%, 100% { box-shadow: 0 0 0 2px rgba(120,170,255,0.14), 0 0 22px rgba(100,155,255,0.40); }
          50%       { box-shadow: 0 0 0 3px rgba(140,190,255,0.22), 0 0 34px rgba(110,165,255,0.58); }
        }
      `}</style>
    </div>
  )
}
