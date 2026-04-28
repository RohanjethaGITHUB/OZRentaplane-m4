'use client'

import React from 'react'

/**
 * Abstract flight-corridor background for the timeline section.
 *
 * Pure CSS + SVG — no photos, no heavy textures.
 * Everything is at ultra-low opacity to stay atmospheric without
 * competing with the cards, nodes, or spine.
 *
 * Elements:
 *  1. Wide soft corridor glow — behind the centre spine
 *  2. Perspective guide lines — converge toward a vanishing point
 *     far below, evoking a flight path or instrument approach corridor
 *  3. Navigation beacon dots — tiny circles along the outer lines
 *     at regular intervals, like runway edge-light spacing
 */
export default function TimelineBackground() {
  // SVG coordinate space — viewBox wide matches a 1440px reference.
  // preserveAspectRatio="xMidYTop slice" scales to fill the container
  // from the top while clipping the bottom, so lines always extend
  // correctly regardless of the section's actual height.
  const W = 1440
  const VP = { x: 720, y: 2600 } // vanishing point — far below content

  // Guide lines: start X on the top edge, all converge to VP
  const guideLines: Array<{ x: number; opacity: number }> = [
    { x: 0,    opacity: 0.022 }, // far left
    { x: 195,  opacity: 0.032 }, // mid-left outer
    { x: 420,  opacity: 0.044 }, // near-left
    { x: 620,  opacity: 0.035 }, // very near left  — gentle taper toward spine
    { x: 820,  opacity: 0.035 }, // very near right
    { x: 1020, opacity: 0.044 }, // near-right
    { x: 1245, opacity: 0.032 }, // mid-right outer
    { x: W,    opacity: 0.022 }, // far right
  ]

  // Navigation beacon dots — along the two outermost lines only
  const dotYPositions = [280, 590, 900, 1210, 1520, 1830, 2140]

  // Interpolate X along outer lines at each Y
  const beaconDots = dotYPositions.flatMap((y) => {
    const t = y / VP.y
    return [
      { key: `L${y}`, cx: 0    + (VP.x - 0)    * t, cy: y }, // left outer
      { key: `R${y}`, cx: W    + (VP.x - W)    * t, cy: y }, // right outer
    ]
  })

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ zIndex: 0 }}
    >

      {/* ── 1. Central corridor glow ─────────────────────────────── */}
      {/* A wide vertical radial gradient that sits behind the spine */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{
          width: '520px',
          background: [
            'radial-gradient(ellipse 100% 45% at 50% 20%, rgba(174,199,247,0.032) 0%, transparent 100%)',
            'radial-gradient(ellipse 60%  80% at 50% 60%, rgba(174,199,247,0.018) 0%, transparent 100%)',
          ].join(', '),
        }}
      />

      {/* ── 2 + 3. Perspective guide lines + beacon dots (SVG) ────── */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${W} 2800`}
        preserveAspectRatio="xMidYTop slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Guide lines — converge to vanishing point */}
        {guideLines.map((gl, i) => (
          <line
            key={i}
            x1={gl.x} y1={0}
            x2={VP.x} y2={VP.y}
            stroke="#aec7f7"
            strokeWidth={0.6}
            strokeOpacity={gl.opacity}
          />
        ))}

        {/* Beacon dots — outer left + outer right, at regular Y intervals */}
        {beaconDots.map((dot) => (
          <circle
            key={dot.key}
            cx={dot.cx}
            cy={dot.cy}
            r={2.5}
            fill="#aec7f7"
            fillOpacity={0.11}
          />
        ))}
      </svg>

    </div>
  )
}
