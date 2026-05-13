'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PilotClearanceStatus } from '@/lib/supabase/types'

type BookingLike = {
  id: string
  status: string
}

type Props = {
  clearanceStatus: PilotClearanceStatus
  activeBooking: BookingLike | null
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
  { key: 'checkout_scheduled', label: 'CHECKOUT\nSCHEDULED', icon: 'calendar_month' },
  { key: 'final_review', label: 'CHECKOUT\nOUTCOME PENDING', icon: 'verified_user' },
  { key: 'ready_to_fly', label: 'READY\nTO FLY', icon: 'flag' },
]

const PHASE2: NodeDef[] = [
  { key: 'choose_aircraft', label: 'CHOOSE\nAIRCRAFT', icon: 'flight' },
  { key: 'booking_confirmed', label: 'BOOKING\nCONFIRMED', icon: 'assignment' },
  { key: 'flight_day', label: 'FLIGHT\nDAY', icon: 'calendar_today' },
  { key: 'flight_returned', label: 'FLIGHT\nRETURNED', icon: 'flight_land' },
  { key: 'complete', label: 'COMPLETE', icon: 'star' },
]

function phase1Index(status: PilotClearanceStatus): number {
  if (status === 'checkout_required') return 0
  if (status === 'checkout_requested') return 1
  if (status === 'checkout_confirmed') return 2
  if (status === 'checkout_completed_under_review' || status === 'checkout_payment_required') return 3
  if (status === 'additional_checkout_required') return 3
  if (status === 'checkout_reschedule_required') return 2
  if (status === 'not_currently_eligible') return 3
  return 4
}

function phase2Index(bookingStatus: string | null): number {
  if (!bookingStatus) return 0
  if (['pending_confirmation', 'draft'].includes(bookingStatus)) return 0
  if (['confirmed', 'ready_for_dispatch'].includes(bookingStatus)) return 1
  if (bookingStatus === 'dispatched') return 2
  if (['awaiting_flight_record', 'flight_record_overdue', 'pending_post_flight_review', 'needs_clarification', 'post_flight_approved', 'invoice_generated', 'payment_pending', 'paid'].includes(bookingStatus)) return 3
  if (bookingStatus === 'completed') return 4
  return 0
}

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

export default function DashboardHeroRunway({ clearanceStatus, activeBooking, blocked }: Props) {
  const [reduceMotion, setReduceMotion] = useState(true)
  const [desktopPlaneLength, setDesktopPlaneLength] = useState(0)
  const [desktopPlanePoint, setDesktopPlanePoint] = useState({ x: 95, y: 140 })
  const [desktopPlaneAngle, setDesktopPlaneAngle] = useState(90)
  const [mobilePlaneLength, setMobilePlaneLength] = useState(0)
  const [mobilePlanePoint, setMobilePlanePoint] = useState({ x: 104, y: 136 })
  const [mobilePlaneAngle, setMobilePlaneAngle] = useState(90)
  const desktopPathRef = useRef<SVGPathElement | null>(null)
  const mobilePathRef = useRef<SVGPathElement | null>(null)
  const desktopLengthRef = useRef(0)
  const mobileLengthRef = useRef(0)
  const desktopAnimRef = useRef<number | null>(null)
  const mobileAnimRef = useRef<number | null>(null)
  const TAXI_ANIMATION_MS = 8700

  const p1 = phase1Index(clearanceStatus)
  const p2 = phase2Index(activeBooking?.status ?? null)
  const phase2Unlocked = clearanceStatus === 'cleared_to_fly'

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
  const mobileMilestoneSize = 46
  const mobileMilestoneIconSize = 17

  const topNodes = useMemo(() => [320, 500, 680, 860, 1000], [])
  const bottomNodes = useMemo(() => [950, 775, 600, 425, 250], [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduceMotion(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const topTargetX = topNodes[p1] ?? topNodes[0]
  const bottomTargetX = bottomNodes[p2] ?? bottomNodes[0]
  const DEBUG_ALIGNMENT = false
  const desktopPlaneWidth = 36
  const desktopPlaneHeight = 36
  const mobilePlaneWidth = 27
  const mobilePlaneHeight = 27
  const assetOffsetDeg = 90
  const desktopHeadingRad = (desktopPlaneAngle * Math.PI) / 180
  const mobileHeadingRad = (mobilePlaneAngle * Math.PI) / 180
  const desktopNoseOffset = 14
  const mobileNoseOffset = 10
  const desktopSpritePoint = {
    x: desktopPlanePoint.x - Math.cos(desktopHeadingRad) * desktopNoseOffset,
    y: desktopPlanePoint.y - Math.sin(desktopHeadingRad) * desktopNoseOffset,
  }
  const mobileSpritePoint = {
    x: mobilePlanePoint.x - Math.cos(mobileHeadingRad) * mobileNoseOffset,
    y: mobilePlanePoint.y - Math.sin(mobileHeadingRad) * mobileNoseOffset,
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

  useEffect(() => {
    const path = mobilePathRef.current
    if (!path) return
    const total = path.getTotalLength()

    const phase1Y = [248, 328, 408, 488, 568][p1] ?? 248
    const phase2Y = [670, 736, 802, 868, 934][p2] ?? 670
    const sampleTarget = phase2Unlocked ? { x: 67, y: phase2Y } : { x: 67, y: phase1Y }
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
    if (mobileAnimRef.current) cancelAnimationFrame(mobileAnimRef.current)
    mobileLengthRef.current = 0
    setMobilePlaneLength(0)

    const setFromLen = (len: number) => {
      const current = path.getPointAtLength(len)
      const next = path.getPointAtLength(Math.min(total, len + 3))
      const angle = (Math.atan2(next.y - current.y, next.x - current.x) * 180) / Math.PI
      setMobilePlaneLength(len)
      setMobilePlanePoint({ x: current.x, y: current.y })
      setMobilePlaneAngle(angle)
    }
    setFromLen(0)

    if (duration === 0) {
      mobileLengthRef.current = bestLen
      setFromLen(bestLen)
      return
    }

    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const len = startLen + (bestLen - startLen) * eased
      mobileLengthRef.current = len
      setFromLen(len)
      if (p < 1) mobileAnimRef.current = requestAnimationFrame(tick)
    }
    mobileAnimRef.current = requestAnimationFrame(tick)
    return () => {
      if (mobileAnimRef.current) cancelAnimationFrame(mobileAnimRef.current)
    }
  }, [p1, p2, phase2Unlocked, reduceMotion])

  return (
    <div className="mt-2 w-full max-w-[1420px]">
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

          {/* ── Hangar + taxiway ─────────────────────────────────────── */}
          {/* Taxiway edge outline (1px wider on each side) */}
          <path d={`M95 160 L95 ${topY} H${startX}`} stroke="rgba(108,140,200,0.28)" strokeWidth="22" fill="none" strokeLinecap="butt" strokeLinejoin="round" />
          {/* Taxiway road fill — 20 units, lighter than runway */}
          <path d={`M95 160 L95 ${topY} H${startX}`} stroke="rgba(11,20,40,0.96)" strokeWidth="20" fill="none" strokeLinecap="butt" strokeLinejoin="round" />
          {/* Hangar building — A-frame, base at y=160 */}
          <path d="M52 160 L52 134 L95 112 L138 134 L138 160 Z" fill="rgba(16,28,50,0.94)" stroke="rgba(124,154,200,0.52)" strokeWidth="1.5" />
          {/* Ground baseline */}
          <path d="M52 160 H138" stroke="rgba(86,116,164,0.34)" strokeWidth="0.8" />
          {/* Wide open door — dark interior void (66 units, ~77% of building width) */}
          <path d="M62 160 V134 H128 V160 Z" fill="rgba(5,10,20,0.99)" />
          {/* Interior back-wall depth hint */}
          <path d="M63 159 V135 H127 V159 Z" fill="rgba(12,22,42,0.92)" />
          {/* Left door pillar */}
          <path d="M52 134 H62 V160 H52 Z" fill="rgba(20,34,58,0.96)" stroke="rgba(100,130,178,0.28)" strokeWidth="0.8" />
          {/* Right door pillar */}
          <path d="M128 134 H138 V160 H128 Z" fill="rgba(20,34,58,0.96)" stroke="rgba(100,130,178,0.28)" strokeWidth="0.8" />
          {/* Roof vent / detail */}
          <circle cx="95" cy="122" r="3.5" fill="none" stroke="rgba(114,144,190,0.48)" strokeWidth="1.2" />
          {/* ─────────────────────────────────────────────────────────── */}

          <path d={`M${startX} ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(212,225,242,0.35)" strokeWidth="1.2" strokeDasharray="9 15" fill="none" strokeLinecap="butt" />

          {/* White trail follows the same taxi + runway geometry as the aircraft */}
          <path d={`M95 140 L95 ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(186,219,255,0.18)" strokeWidth="26" fill="none" strokeLinecap="round" strokeDasharray={`${desktopPlaneLength} 99999`} filter="url(#trail-glow)" />
          <path d={`M95 140 L95 ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="rgba(226,240,255,0.11)" strokeWidth="38" fill="none" strokeLinecap="round" strokeDasharray={`${desktopPlaneLength} 99999`} filter="url(#trail-glow)" />
          <path ref={desktopPathRef} d={`M95 140 L95 ${topY} H1030 A${curveRadius} ${curveRadius} 0 0 1 1030 ${bottomY} H150`} stroke="transparent" strokeWidth="1" fill="none" />

          {/* Top runway lights — brightness gate driven by topTargetX (current milestone x) */}
          {Array.from({ length: 22 }).map((_, i) => {
            const x = 170 + i * 38
            const done = x <= topTargetX
            return (
              <g key={`tl-${i}`}>
                {done ? (
                  <>
                    <circle cx={x} cy={topY - 22} r="15.6" fill="#3a68c8" opacity="0.12" />
                    <circle cx={x} cy={topY - 22} r="9.6"  fill="#5888dc" opacity="0.36" />
                    <circle cx={x} cy={topY - 22} r="5.8"  fill="#90b8f8" opacity="0.72" />
                    <circle cx={x} cy={topY - 22} r="2.1"  fill="#e4f2ff" opacity="0.98" />
                    <circle cx={x} cy={topY + 22} r="15.6" fill="#3a68c8" opacity="0.12" />
                    <circle cx={x} cy={topY + 22} r="9.6"  fill="#5888dc" opacity="0.36" />
                    <circle cx={x} cy={topY + 22} r="5.8"  fill="#90b8f8" opacity="0.72" />
                    <circle cx={x} cy={topY + 22} r="2.1"  fill="#e4f2ff" opacity="0.98" />
                  </>
                ) : (
                  <>
                    <circle cx={x} cy={topY - 22} r="4.8" fill="#5888dc" opacity="0.09" />
                    <circle cx={x} cy={topY - 22} r="3.1" fill="#7aa8f8" opacity="0.15" />
                    <circle cx={x} cy={topY - 22} r="1.6" fill="#b8d0ff" opacity="0.72" />
                    <circle cx={x} cy={topY + 22} r="4.8" fill="#5888dc" opacity="0.09" />
                    <circle cx={x} cy={topY + 22} r="3.1" fill="#7aa8f8" opacity="0.15" />
                    <circle cx={x} cy={topY + 22} r="1.6" fill="#b8d0ff" opacity="0.72" />
                  </>
                )}
              </g>
            )
          })}
          {Array.from({ length: 22 }).map((_, i) => {
            const x = 154 + i * 39
            return (
              <g key={`bl-${i}`}>
                <circle cx={x} cy={bottomY - 22} r="4.6" fill="#4870b8" opacity="0.08" />
                <circle cx={x} cy={bottomY - 22} r="2.8" fill="#6888cc" opacity="0.12" />
                <circle cx={x} cy={bottomY - 22} r="1.4" fill="#a8c0e8" opacity="0.65" />
                <circle cx={x} cy={bottomY + 22} r="4.6" fill="#4870b8" opacity="0.08" />
                <circle cx={x} cy={bottomY + 22} r="2.8" fill="#6888cc" opacity="0.12" />
                <circle cx={x} cy={bottomY + 22} r="1.4" fill="#a8c0e8" opacity="0.65" />
              </g>
            )
          })}
          {/* U-turn outer lights — radius curveRadius+18, 7 lights at 30° steps (~40-unit arc spacing) */}
          {Array.from({ length: 7 }).map((_, i) => {
            const a = -Math.PI / 2 + (Math.PI * i) / 6
            const x = 1030 + Math.cos(a) * (curveRadius + 18)
            const y = curveCenterY + Math.sin(a) * (curveRadius + 18)
            return (
              <g key={`cl-o-${i}`}>
                <circle cx={x} cy={y} r="4.6" fill="#4870b8" opacity="0.08" />
                <circle cx={x} cy={y} r="2.8" fill="#6888cc" opacity="0.12" />
                <circle cx={x} cy={y} r="1.4" fill="#a8c0e8" opacity="0.65" />
              </g>
            )
          })}
          {/* U-turn inner lights — radius curveRadius-18, 5 lights at 45° steps (~31-unit arc spacing) */}
          {Array.from({ length: 5 }).map((_, i) => {
            const a = -Math.PI / 2 + (Math.PI * i) / 4
            const x = 1030 + Math.cos(a) * (curveRadius - 18)
            const y = curveCenterY + Math.sin(a) * (curveRadius - 18)
            return (
              <g key={`cl-i-${i}`}>
                <circle cx={x} cy={y} r="3.6" fill="#4870b8" opacity="0.07" />
                <circle cx={x} cy={y} r="2.2" fill="#6888cc" opacity="0.10" />
                <circle cx={x} cy={y} r="1.2" fill="#98b0d8" opacity="0.55" />
              </g>
            )
          })}
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
            key={PHASE1[i].key}
            x={x}
            y={topTrackCenterY}
            node={PHASE1[i]}
            state={i === p1 ? 'active' : i < p1 ? 'done' : 'future'}
            nodeSize={milestoneDiameter}
            iconSize={milestoneIconSize}
            labelOffset={milestoneLabelOffsetTop}
            trackHalfHeight={topTrackHalfHeight}
            labelAbove
          />
        ))}

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

      <div className="relative h-[980px] md:hidden">
        <svg viewBox="0 0 390 980" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="m-base" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(12,24,42,0.72)" />
              <stop offset="100%" stopColor="rgba(9,20,35,0.78)" />
            </linearGradient>
            <filter id="m-trail-glow" x="-18%" y="-18%" width="136%" height="136%">
              <feGaussianBlur stdDeviation="6.8" />
            </filter>
          </defs>
          <path d="M106 190 H302 A41 41 0 0 1 302 272 V488 A41 41 0 0 1 261 529 H108 A41 41 0 0 0 67 570 V914" stroke="url(#m-base)" strokeWidth="60" fill="none" strokeLinecap="round" />
          <path d="M106 190 H302 A41 41 0 0 1 302 272 V488 A41 41 0 0 1 261 529 H108 A41 41 0 0 0 67 570 V914" stroke="rgba(130,160,210,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M106 190 H302 A41 41 0 0 1 302 272 V488 A41 41 0 0 1 261 529 H108 A41 41 0 0 0 67 570 V914" stroke="rgba(212,225,242,0.38)" strokeWidth="1.5" strokeDasharray="9 15" fill="none" strokeLinecap="round" />
          <path d="M104 136 V190 H302 A41 41 0 0 1 302 272 V488 A41 41 0 0 1 261 529 H108 A41 41 0 0 0 67 570 V914" stroke="rgba(186,219,255,0.2)" strokeWidth="18" fill="none" strokeLinecap="round" strokeDasharray={`${mobilePlaneLength} 99999`} filter="url(#m-trail-glow)" />
          <path d="M104 136 V190 H302 A41 41 0 0 1 302 272 V488 A41 41 0 0 1 261 529 H108 A41 41 0 0 0 67 570 V914" stroke="rgba(226,240,255,0.12)" strokeWidth="26" fill="none" strokeLinecap="round" strokeDasharray={`${mobilePlaneLength} 99999`} filter="url(#m-trail-glow)" />
          <path ref={mobilePathRef} d="M104 136 V190 H302 A41 41 0 0 1 302 272 V488 A41 41 0 0 1 261 529 H108 A41 41 0 0 0 67 570 V914" stroke="transparent" strokeWidth="1" fill="none" />
          {Array.from({ length: 8 }).map((_, i) => {
            const x = 110 + i * 26
            return (
              <g key={`mg-${i}`}>
                <circle cx={x} cy={162} r="3.8" fill="#5888dc" opacity="0.12" />
                <circle cx={x} cy={162} r="2.2" fill="#90b8f8" opacity="0.28" />
                <circle cx={x} cy={162} r="1.2" fill="#e8f2ff" opacity="0.85" />
                <circle cx={x} cy={218} r="3.8" fill="#5888dc" opacity="0.12" />
                <circle cx={x} cy={218} r="2.2" fill="#90b8f8" opacity="0.28" />
                <circle cx={x} cy={218} r="1.2" fill="#e8f2ff" opacity="0.85" />
              </g>
            )
          })}
          <g transform={`rotate(${mobilePlaneAngle + assetOffsetDeg} ${mobileSpritePoint.x} ${mobileSpritePoint.y})`}>
            <foreignObject
              x={mobileSpritePoint.x - mobilePlaneWidth / 2}
              y={mobileSpritePoint.y - mobilePlaneHeight / 2}
              width={mobilePlaneWidth}
              height={mobilePlaneHeight}
            >
              <div className="h-full w-full flex items-center justify-center">
                <PlaneGlyph size="27px" />
              </div>
            </foreignObject>
          </g>

          {DEBUG_ALIGNMENT && (
            <g>
              <circle cx={mobilePlanePoint.x} cy={mobilePlanePoint.y} r="3.2" fill="#ef4444" />
              <circle cx={mobilePlanePoint.x} cy={mobilePlanePoint.y} r="2.1" fill="#22c55e" />
              <circle cx={mobileSpritePoint.x} cy={mobileSpritePoint.y} r="2.1" fill="#3b82f6" />
            </g>
          )}
        </svg>

        <div className="absolute left-[42px] top-[138px] h-[74px] w-[98px]"><HangarSvg className="h-full w-full" /></div>

        <Milestone x={54} y={248} node={PHASE1[0]} state={p1 === 0 ? 'active' : p1 > 0 ? 'done' : 'future'} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={16} trackHalfHeight={30} />
        <Milestone x={54} y={328} node={PHASE1[1]} state={p1 === 1 ? 'active' : p1 > 1 ? 'done' : 'future'} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={16} trackHalfHeight={30} />
        <Milestone x={54} y={408} node={PHASE1[2]} state={p1 === 2 ? 'active' : p1 > 2 ? 'done' : 'future'} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={16} trackHalfHeight={30} />
        <Milestone x={54} y={488} node={PHASE1[3]} state={p1 === 3 ? 'active' : p1 > 3 ? 'done' : 'future'} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={16} trackHalfHeight={30} />
        <Milestone x={54} y={568} node={PHASE1[4]} state={p1 === 4 ? 'active' : p1 > 4 ? 'done' : 'future'} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={16} trackHalfHeight={30} />

        <Milestone x={54} y={670} node={PHASE2[0]} state={phase2Unlocked && p2 === 0 ? 'active' : phase2Unlocked && p2 > 0 ? 'done' : 'future'} muted={!phase2Unlocked} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={14} trackHalfHeight={30} />
        <Milestone x={54} y={736} node={PHASE2[1]} state={phase2Unlocked && p2 === 1 ? 'active' : phase2Unlocked && p2 > 1 ? 'done' : 'future'} muted={!phase2Unlocked} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={14} trackHalfHeight={30} />
        <Milestone x={54} y={802} node={PHASE2[2]} state={phase2Unlocked && p2 === 2 ? 'active' : phase2Unlocked && p2 > 2 ? 'done' : 'future'} muted={!phase2Unlocked} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={14} trackHalfHeight={30} />
        <Milestone x={54} y={868} node={PHASE2[3]} state={phase2Unlocked && p2 === 3 ? 'active' : phase2Unlocked && p2 > 3 ? 'done' : 'future'} muted={!phase2Unlocked} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={14} trackHalfHeight={30} />
        <Milestone x={54} y={934} node={PHASE2[4]} state={phase2Unlocked && p2 === 4 ? 'active' : 'future'} muted={!phase2Unlocked} nodeSize={mobileMilestoneSize} iconSize={mobileMilestoneIconSize} labelOffset={14} trackHalfHeight={30} />
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
