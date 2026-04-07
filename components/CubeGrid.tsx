'use client'

import { useEffect, useRef, useCallback } from 'react'

// ─── Props ─────────────────────────────────────────────────────────────────────
interface CubeGridProps {
  gridSize?:   number   // number of cubes per side  (default 11)
  maxAngle?:   number   // peak rotation in degrees  (default 25)
  radius?:     number   // influence radius in cells (default 4)
  faceColor?:  string   // cube face background      (default dark navy)
  borderColor?: string  // cube face border          (default subtle blue)
  gapPercent?: number   // gap between cubes as %    (default 3)
  speed?:      number   // wandering speed 0-1       (default 0.012)
}

// ─── Easing approximation (power3.out) ────────────────────────────────────────
const EASE_ENTER = 'cubic-bezier(0.215, 0.61, 0.355, 1)'
const EASE_LEAVE = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

// ─── Six face transforms (matching ReactBits Cubes.css exactly) ───────────────
const FACES: string[] = [
  'translateY(-50%) rotateX(90deg)',             // top
  'translateY(50%) rotateX(-90deg)',             // bottom
  'translateX(-50%) rotateY(-90deg)',            // left
  'translateX(50%) rotateY(90deg)',              // right
  'rotateY(-90deg) translateX(50%) rotateY(90deg)', // front
  'rotateY(-90deg) translateX(50%) rotateY(90deg)', // back
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function CubeGrid({
  gridSize    = 11,
  maxAngle    = 25,
  radius      = 4,
  faceColor   = '#0c1e35',
  borderColor = 'rgba(174,199,247,0.06)',
  gapPercent  = 3,
  speed       = 0.012,
}: CubeGridProps) {
  const sceneRef     = useRef<HTMLDivElement>(null)
  const simPosRef    = useRef({ x: 0,                    y: 0 })
  const simTargetRef = useRef({ x: Math.random() * gridSize, y: Math.random() * gridSize })
  const rafRef       = useRef<number | null>(null)

  // ── Tilt all cubes relative to a virtual focal point ──────────────────────
  const tiltAt = useCallback(
    (rowCenter: number, colCenter: number) => {
      if (!sceneRef.current) return
      const cubes = sceneRef.current.querySelectorAll<HTMLDivElement>('[data-cgrow]')
      cubes.forEach((cube) => {
        const r    = Number(cube.dataset.cgrow)
        const c    = Number(cube.dataset.cgcol)
        const dist = Math.hypot(r - rowCenter, c - colCenter)

        if (dist <= radius) {
          const pct   = 1 - dist / radius
          const angle = pct * maxAngle
          cube.style.transition = `transform 0.3s ${EASE_ENTER}`
          cube.style.transform  = `rotateX(${-angle}deg) rotateY(${angle}deg)`
        } else {
          cube.style.transition = `transform 0.6s ${EASE_LEAVE}`
          cube.style.transform  = 'rotateX(0deg) rotateY(0deg)'
        }
      })
    },
    [radius, maxAngle]
  )

  // ── Wandering auto-animate loop (no user input needed) ────────────────────
  useEffect(() => {
    simPosRef.current = {
      x: Math.random() * gridSize,
      y: Math.random() * gridSize,
    }

    const loop = () => {
      const pos = simPosRef.current
      const tgt = simTargetRef.current

      pos.x += (tgt.x - pos.x) * speed
      pos.y += (tgt.y - pos.y) * speed

      tiltAt(pos.y, pos.x)

      // Pick a new target once we arrive
      if (Math.hypot(pos.x - tgt.x, pos.y - tgt.y) < 0.15) {
        simTargetRef.current = {
          x: Math.random() * gridSize,
          y: Math.random() * gridSize,
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [gridSize, speed, tiltAt])

  // ── Shared face style ──────────────────────────────────────────────────────
  const faceStyle = (transform: string): React.CSSProperties => ({
    position:   'absolute',
    inset:      0,
    background: faceColor,
    border:     `1px solid ${borderColor}`,
    transform,
  })

  const cells = Array.from({ length: gridSize })
  const gap   = `${gapPercent}%`

  return (
    <div
      aria-hidden="true"
      style={{
        position:      'absolute',
        inset:         0,
        pointerEvents: 'none',
        overflow:      'hidden',
      }}
    >
      <div
        ref={sceneRef}
        style={{
          display:               'grid',
          width:                 '100%',
          height:                '100%',
          gridTemplateColumns:   `repeat(${gridSize}, 1fr)`,
          gridTemplateRows:      `repeat(${gridSize}, 1fr)`,
          columnGap:             gap,
          rowGap:                gap,
          // Large perspective = near-orthographic, matches original intent
          perspective:           '9999px',
        }}
      >
        {cells.map((_, r) =>
          cells.map((__, c) => (
            <div
              key={`${r}-${c}`}
              data-cgrow={r}
              data-cgcol={c}
              style={{
                position:       'relative',
                width:          '100%',
                height:         '100%',
                aspectRatio:    '1 / 1',
                transformStyle: 'preserve-3d',
                willChange:     'transform',
              }}
            >
              {FACES.map((transform, fi) => (
                <div key={fi} style={faceStyle(transform)} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
