'use client'

import React from 'react'

export type CloudShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

type AtmoCloudsProps = {
  direction?: 'ltr' | 'rtl'
  density?: 'light' | 'full'
  shapes?: CloudShape[]
  topOffset?: string
  extraDarkCloud?: boolean
}

type CloudShapeDef = {
  viewBox: string
  path: string
  fill: string
}

type CloudRuntimeDef = {
  shape: CloudShape
  opacity: number
  top: string
  duration: number
  delay: number
  width: number
  direction: 'ltr' | 'rtl'
  startMode?: 'edge' | 'mid'
}

const CLOUD_SHAPES: Record<CloudShape, CloudShapeDef> = {
  // Shape 1 — wide flat cumulus (kept as-is)
  A: {
    viewBox: '0 0 420 150',
    path: 'M20 110 C26 93 44 82 66 84 C76 62 100 48 128 52 C140 36 166 28 196 34 C218 20 248 20 272 34 C296 30 320 40 336 56 C356 58 372 72 382 90 C396 94 406 102 410 112 C410 118 404 122 394 122 L36 122 C26 122 20 117 20 110 Z',
    fill: 'rgba(255,255,255,1)',
  },
  // Shape 2 — tall puffy cloud, more vertical with uneven bumps
  B: {
    viewBox: '0 0 290 240',
    path: 'M72 206 C58 182 58 152 76 132 C72 108 86 84 108 72 C120 44 146 30 172 38 C192 28 220 38 230 62 C254 66 270 86 272 112 C286 126 290 150 282 172 C270 194 246 206 216 208 L96 208 C84 208 76 208 72 206 Z',
    fill: 'rgba(245,250,255,1)',
  },
  // Shape 3 — small wispy, thin cirrus-like
  C: {
    viewBox: '0 0 520 100',
    path: 'M12 56 C40 48 78 48 118 52 C152 42 196 40 242 46 C288 40 334 42 378 50 C420 46 462 48 500 58 C476 64 438 66 396 64 C352 70 304 70 258 64 C210 72 160 72 116 66 C72 68 36 66 14 60 C10 58 9 57 12 56 Z',
    fill: 'rgba(255,255,255,1)',
  },
  // Shape 4 — sprawling asymmetric cloud, leans left
  D: {
    viewBox: '0 0 500 200',
    path: 'M24 150 C20 128 30 106 56 92 C70 66 96 50 132 56 C150 38 184 26 220 40 C246 22 288 20 320 38 C356 30 392 48 410 72 C444 74 472 96 484 126 C490 138 486 148 470 152 L52 156 C34 156 26 154 24 150 Z',
    fill: 'rgba(255,255,255,1)',
  },
  // Shape 5 — darker depth cloud
  E: {
    viewBox: '0 0 420 150',
    path: 'M20 110 C26 93 44 82 66 84 C76 62 100 48 128 52 C140 36 166 28 196 34 C218 20 248 20 272 34 C296 30 320 40 336 56 C356 58 372 72 382 90 C396 94 406 102 410 112 C410 118 404 122 394 122 L36 122 C26 122 20 117 20 110 Z',
    fill: 'rgba(26,79,214,0.12)',
  },
  // Shape 6 — medium chunky cloud, 3 even bumps
  F: {
    viewBox: '0 0 360 170',
    path: 'M24 118 C28 100 44 90 64 92 C76 70 100 58 126 64 C148 42 184 40 206 64 C232 58 258 70 270 92 C292 92 310 102 320 118 C324 126 320 132 308 132 L40 132 C30 132 24 126 24 118 Z',
    fill: 'rgba(255,255,255,1)',
  },
}

const STANDARD_CLOUDS: CloudRuntimeDef[] = [
  // Cloud 1
  { shape: 'A', opacity: 0.15, top: '5%', duration: 45, delay: 0, width: 560, direction: 'ltr', startMode: 'edge' },
  // Cloud 2
  { shape: 'C', opacity: 0.10, top: '18%', duration: 60, delay: -15, width: 420, direction: 'rtl', startMode: 'edge' },
  // Cloud 3
  { shape: 'E', opacity: 0.12, top: '28%', duration: 52, delay: -28, width: 520, direction: 'ltr', startMode: 'edge' },
  // Cloud 4
  { shape: 'B', opacity: 0.13, top: '8%', duration: 38, delay: -8, width: 320, direction: 'ltr', startMode: 'mid' },
]

const MIRRORED_CLOUDS: CloudRuntimeDef[] = [
  { shape: 'A', opacity: 0.15, top: '10%', duration: 45, delay: 0, width: 560, direction: 'rtl', startMode: 'edge' },
  { shape: 'C', opacity: 0.10, top: '22%', duration: 60, delay: -15, width: 420, direction: 'ltr', startMode: 'edge' },
  { shape: 'E', opacity: 0.12, top: '35%', duration: 52, delay: -28, width: 520, direction: 'rtl', startMode: 'edge' },
  { shape: 'B', opacity: 0.13, top: '15%', duration: 38, delay: -8, width: 320, direction: 'rtl', startMode: 'mid' },
]

function renderCloud(cloud: CloudRuntimeDef, idx: number, topOffset: string) {
  const shape = CLOUD_SHAPES[cloud.shape]
  const animationName = cloud.direction === 'rtl' ? 'cloudDriftRTL' : 'cloudDriftLTR'
  const initialX = cloud.direction === 'rtl' ? 'calc(100vw + 100%)' : '-100%'
  const leftBase = cloud.startMode === 'mid' ? '40vw' : '0'

  return (
    <div
      key={`${cloud.shape}-${idx}`}
      aria-hidden="true"
      className="atmo-cloud pointer-events-none absolute"
      style={{
        position: 'absolute',
        left: leftBase,
        top: `calc(${cloud.top} + ${topOffset})`,
        width: `${cloud.width}px`,
        opacity: cloud.opacity,
        transform: `translateX(${initialX})`,
        animationName,
        animationDuration: `${cloud.duration}s`,
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
        animationDelay: `${cloud.delay}s`,
      }}
    >
      <svg
        aria-hidden="true"
        viewBox={shape.viewBox}
        fill="none"
        width="100%"
      >
        <path d={shape.path} fill={shape.fill} />
      </svg>
    </div>
  )
}

export function AtmoCloudsMirrored({
  topOffset = '0%',
  extraDarkCloud = false,
}: Pick<AtmoCloudsProps, 'topOffset' | 'extraDarkCloud'>) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden z-0"
      style={{ position: 'absolute', overflow: 'hidden', width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {MIRRORED_CLOUDS.map((cloud, idx) => renderCloud(cloud, idx, topOffset))}
      {extraDarkCloud ? (
        <div
          aria-hidden="true"
          className="atmo-cloud pointer-events-none absolute"
          style={{
            position: 'absolute',
            left: '40vw',
            top: `calc(30% + ${topOffset})`,
            width: '676px',
            opacity: 0.14,
            transform: 'translateX(-100%) scale(1.3)',
            animationName: 'cloudDriftLTR',
            animationDuration: '56s',
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationDelay: '-21s',
            transformOrigin: 'center',
          }}
        >
          <svg
            aria-hidden="true"
            viewBox={CLOUD_SHAPES.E.viewBox}
            fill="none"
            width="100%"
          >
            <path d={CLOUD_SHAPES.E.path} fill={CLOUD_SHAPES.E.fill} />
          </svg>
        </div>
      ) : null}
      <CloudStyles />
    </div>
  )
}

export default function AtmoClouds({
  direction = 'ltr',
  density = 'full',
  shapes,
  topOffset = '0%',
  extraDarkCloud = false,
}: AtmoCloudsProps) {
  const baseClouds = direction === 'rtl' ? MIRRORED_CLOUDS : STANDARD_CLOUDS
  const clouds = density === 'light' ? baseClouds.slice(0, 2) : baseClouds

  // Preserve legacy API compatibility: if shapes are provided, we map them into the first N clouds.
  const mappedClouds = shapes && shapes.length > 0
    ? clouds.map((cloud, i) => ({ ...cloud, shape: shapes[i % shapes.length] }))
    : clouds

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden z-0"
      style={{ position: 'absolute', overflow: 'hidden', width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {mappedClouds.map((cloud, idx) => renderCloud(cloud, idx, topOffset))}
      {extraDarkCloud ? (
        <div
          aria-hidden="true"
          className="atmo-cloud pointer-events-none absolute"
          style={{
            position: 'absolute',
            left: '40vw',
            top: `calc(30% + ${topOffset})`,
            width: '676px',
            opacity: 0.14,
            transform: 'translateX(-100%) scale(1.3)',
            animationName: 'cloudDriftLTR',
            animationDuration: '56s',
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationDelay: '-21s',
            transformOrigin: 'center',
          }}
        >
          <svg
            aria-hidden="true"
            viewBox={CLOUD_SHAPES.E.viewBox}
            fill="none"
            width="100%"
          >
            <path d={CLOUD_SHAPES.E.path} fill={CLOUD_SHAPES.E.fill} />
          </svg>
        </div>
      ) : null}
      <CloudStyles />
    </div>
  )
}

function CloudStyles() {
  return (
    <style jsx global>{`
      @keyframes cloudDriftLTR {
        0%   { transform: translateX(-100%) }
        100% { transform: translateX(calc(100vw + 100%)) }
      }
      @keyframes cloudDriftRTL {
        0%   { transform: translateX(calc(100vw + 100%)) }
        100% { transform: translateX(-100%) }
      }
      @keyframes cessnaPlaneOrbitCW {
        0% { transform: translate(10%, 20%) rotate(0deg); }
        25% { transform: translate(75%, 5%) rotate(15deg); }
        50% { transform: translate(85%, 60%) rotate(180deg); }
        75% { transform: translate(20%, 75%) rotate(195deg); }
        100% { transform: translate(10%, 20%) rotate(360deg); }
      }
      @keyframes cessnaPlaneOrbitCCW {
        0% { transform: translate(76%, 22%) rotate(180deg); }
        25% { transform: translate(20%, 10%) rotate(140deg); }
        50% { transform: translate(12%, 66%) rotate(0deg); }
        75% { transform: translate(68%, 78%) rotate(-35deg); }
        100% { transform: translate(76%, 22%) rotate(-180deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        .atmo-cloud { animation: none !important; }
        .cessna-plane,
        .cessna-contrail {
          animation: none !important;
        }
        .cessna-plane-1,
        .cessna-contrail-1 {
          transform: translate(10%, 20%) rotate(0deg) !important;
        }
        .cessna-plane-2,
        .cessna-contrail-2 {
          transform: translate(76%, 22%) rotate(180deg) !important;
        }
        .cessna-contrail {
          display: none !important;
        }
      }
    `}</style>
  )
}
