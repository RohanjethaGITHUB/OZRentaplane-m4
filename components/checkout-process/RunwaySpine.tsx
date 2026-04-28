'use client'

import React from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

interface RunwaySpineProps {
  containerRef: React.RefObject<HTMLDivElement>
}

export default function RunwaySpine({ containerRef }: RunwaySpineProps) {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 50%', 'end 50%'],
  })

  const progress = scrollYProgress

  /* Plane position: 0% → 98% of container height */
  const planeTop = useTransform(progress, [0, 1], ['0%', '98%'])

  /* Illuminated runway segment grows behind the plane */
  const completedHeight = useTransform(progress, [0, 1], ['0%', '94%'])

  /*
   * Takeoff & Landing sequence
   *
   * The key fix for the "jumpy" animation is to spread the scale curve
   * across a LONG range with many intermediate keyframes so no single
   * scroll increment produces a large jump.
   *
   * Phase map (progress 0 → 1):
   *   0.00 – 0.45  taxi / ground roll  — scale 1.0, y 0px
   *   0.45 – 0.58  rotation / liftoff  — scale eases up to 3.0
   *   0.58 – 0.68  climb               — scale eases up to 5.5, lift –60px
   *   0.68 – 0.78  cruise              — scale holds 5.5, lift –90px
   *   0.78 – 0.88  descent             — scale eases down to 3.0, lift –40px
   *   0.88 – 1.00  landing roll        — scale eases back to 1.0, y 0px
   */
  const planeRotate = 180

  const scaleKeys   = [0,    0.45, 0.52, 0.60, 0.68, 0.78, 0.85, 0.92, 1.0]
  const scaleVals   = [1.0,  1.0,  2.2,  4.2,  5.5,  5.5,  3.5,  1.8,  1.0]

  const liftKeys    = [0,    0.45, 0.52, 0.60, 0.68, 0.78, 0.85, 0.92, 1.0]
  const liftVals    = ['0px','0px','-20px','-55px','-85px','-85px','-50px','-15px','0px']

  const planeScale = useTransform(progress, scaleKeys, scaleVals)
  const planeLiftY = useTransform(progress, liftKeys,  liftVals)

  /* Shadow — fades out as plane lifts, restores on landing */
  const shadowKeys = [0,    0.45, 0.60, 0.68, 0.88, 1.0]
  const shadowVals = [0.72, 0.72, 0.15, 0.0,  0.15, 0.72]
  const planeShadowOpacity       = useTransform(progress, shadowKeys, shadowVals)

  const flightShadowKeys = [0, 0.52, 0.65, 0.78, 0.88, 1.0]
  const flightShadowVals = [0, 0,    0.7,  0.7,  0.2,  0]
  const planeFlightShadowOpacity = useTransform(progress, flightShadowKeys, flightShadowVals)

  return (
    <>
      {/* ── RUNWAY GRAPHICS (Underneath content) ─────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{ zIndex: 1 }}
      >
        {/* Ambient corridor glow */}
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2"
          style={{
            width: '180px',
            background: 'linear-gradient(to right, transparent, rgba(174,199,247,0.03) 50%, transparent)',
          }}
        />

        {/* Runway strip */}
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2"
          style={{
            width: '48px',
            background: 'linear-gradient(to bottom, #16202e 0%, #0f172a 50%, #16202e 100%)',
            borderLeft: '1px solid rgba(174,199,247,0.2)',
            borderRight: '1px solid rgba(174,199,247,0.2)',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
          }}
        >
          {/* Top Threshold Markings */}
          <div className="absolute top-0 w-full flex justify-center gap-[3px] pt-4 opacity-50">
            <div className="w-1 h-8 bg-white"></div>
            <div className="w-1 h-8 bg-white"></div>
            <div className="w-1 h-8 bg-white"></div>
            <div className="w-1 h-8 bg-white"></div>
          </div>

          {/* Runway Centerline */}
          <div className="absolute inset-y-0 w-full flex justify-center items-center opacity-60">
            <div
              className="w-[2px] h-full"
              style={{
                background: 'repeating-linear-gradient(to bottom, #ffffff 0, #ffffff 16px, transparent 16px, transparent 32px)',
              }}
            />
          </div>

          {/* Edge Lights (Left) */}
          <div
            className="absolute left-0 inset-y-0 w-[4px] h-full opacity-90"
            style={{
              background: 'repeating-linear-gradient(to bottom, #818cf8 0, #818cf8 4px, transparent 4px, transparent 40px)',
              filter: 'drop-shadow(0 0 6px #818cf8)',
            }}
          />

          {/* Edge Lights (Right) */}
          <div
            className="absolute right-0 inset-y-0 w-[4px] h-full opacity-90"
            style={{
              background: 'repeating-linear-gradient(to bottom, #818cf8 0, #818cf8 4px, transparent 4px, transparent 40px)',
              filter: 'drop-shadow(0 0 6px #818cf8)',
            }}
          />

          {/* Bottom Threshold Markings */}
          <div className="absolute bottom-0 w-full flex justify-center gap-[3px] pb-4 opacity-50">
            <div className="w-1 h-8 bg-white"></div>
            <div className="w-1 h-8 bg-white"></div>
            <div className="w-1 h-8 bg-white"></div>
            <div className="w-1 h-8 bg-white"></div>
          </div>

          {/* Illuminated completed path */}
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 overflow-visible"
            style={{
              width: '48px',
              height: completedHeight,
              background: 'linear-gradient(to bottom, rgba(174,199,247,0.0) 0%, rgba(174,199,247,0.15) 100%)',
            }}
          >
            {/* Misty atmospheric trail just behind the plane */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90px] h-[140px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at bottom, rgba(147,180,255,0.38) 0%, rgba(147,180,255,0.10) 45%, transparent 70%)',
                filter: 'blur(9px)',
                opacity: 0.9,
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* ── PLANE (Above content) ─────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none hidden md:block"
        aria-hidden="true"
        style={{ zIndex: 30 }}
      >
        <motion.div
          className="absolute left-1/2 pointer-events-none"
          style={{
            top: planeTop,
            x: '-50%',
            y: '-50%',
            rotate: planeRotate,
            scale: planeScale,
            opacity: 1,
          }}
        >
          <motion.div style={{ y: planeLiftY }} className="relative">
            {/* Ambient halo */}
            <div
              style={{
                position: 'absolute',
                inset: '-14px',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(174,199,247,0.15) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            {/* Plane icon */}
            <span
              className="material-symbols-outlined relative z-10 block leading-none"
              style={{
                fontSize: '19px',
                color: '#aec7f7',
                fontVariationSettings: "'FILL' 1",
              }}
            >
              flight

              {/* Ground shadow */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  opacity: planeShadowOpacity,
                  filter: 'drop-shadow(0 0 7px rgba(174,199,247,0.85))',
                  zIndex: -1,
                  color: 'transparent',
                }}
              >
                <span
                  className="material-symbols-outlined block leading-none"
                  style={{
                    fontSize: '19px',
                    fontVariationSettings: "'FILL' 1",
                    color: '#aec7f7',
                  }}
                >
                  flight
                </span>
              </motion.div>

              {/* Flight altitude shadow */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  opacity: planeFlightShadowOpacity,
                  filter:
                    'drop-shadow(-18px 22px 10px rgba(5,15,27,0.65)) drop-shadow(0 0 12px rgba(174,199,247,0.25))',
                  zIndex: -1,
                  color: 'transparent',
                }}
              >
                <span
                  className="material-symbols-outlined block leading-none"
                  style={{
                    fontSize: '19px',
                    fontVariationSettings: "'FILL' 1",
                    color: '#aec7f7',
                  }}
                >
                  flight
                </span>
              </motion.div>
            </span>
          </motion.div>
        </motion.div>
      </div>
    </>
  )
}
