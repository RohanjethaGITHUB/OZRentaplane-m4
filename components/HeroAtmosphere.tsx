'use client'

import React from 'react'
import { motion } from 'framer-motion'

interface HeroAtmosphereProps {
  isVisible: boolean
}

export default function HeroAtmosphere({ isVisible }: HeroAtmosphereProps) {
  const [propStyle, setPropStyle] = React.useState<React.CSSProperties>({ opacity: 0 })

  React.useEffect(() => {
    function updateProp() {
      const cw = window.innerWidth
      const ch = window.innerHeight
      const iw = 1920
      const ih = 1080
      
      const isMobile = cw < 768
      const layout = isMobile 
        ? { focalX: 0.50, focalY: 0.40, fgScale: 0.60 }
        : { focalX: 0.50, focalY: 0.45, fgScale: 0.50 }

      const containScale = Math.min(cw / iw, ch / ih)
      const coverScale   = Math.max(cw / iw, ch / ih)
      const blendScale   = containScale + (coverScale - containScale) * layout.fgScale
      const fgScale      = Math.max(blendScale, cw / iw, ch / ih)
      const fgW          = iw * fgScale
      const fgH          = ih * fgScale
      const fgX          = (cw - fgW) * layout.focalX
      const fgY          = (ch - fgH) * layout.focalY

      // Precise visual tuning for scn1_000001 (overlapping the real propeller hub)
      const propAnchor = { x: 0.86, y: 0.515 } 
      const hubX = fgX + fgW * propAnchor.x
      const hubY = fgY + fgH * propAnchor.y

      setPropStyle({
        position: 'absolute',
        left: `${hubX}px`,
        top: `${hubY}px`,
        width: `${Math.max(250, fgW * 0.18)}px`,
        height: `${Math.max(250, fgW * 0.18)}px`,
        transform: 'translate(-50%, -50%)',
        opacity: 0.85
      })
    }

    updateProp()
    window.addEventListener('resize', updateProp)
    return () => window.removeEventListener('resize', updateProp)
  }, [])

  return (
    <motion.div
      className="absolute inset-0 z-20 pointer-events-none overflow-hidden"
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
    >
      {/* Gentle Premium Static Tint: navy gradient scrim, no aggressive blend modes */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#020a1c]/70 via-[#06142a]/30 to-[#0e2142]/10 pointer-events-none mix-blend-normal" />

      {/* Dynamic Cloud / Haze Drift Layer derived from organic image */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ x: ['-1.5%', '1.5%'] }}
        transition={{ repeat: Infinity, repeatType: 'mirror', duration: 16, ease: 'linear' }}
      >
        <div 
          className="absolute -inset-[10%] bg-[url('/heroScroll-DarkImages/scn1_000001.webp')] bg-cover bg-bottom opacity-35 pointer-events-none"
          style={{ 
            filter: 'blur(35px) saturate(0.8)',
            maskImage: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 80%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 80%)'
          }}
        />
      </motion.div>

      {/* Procedural Propeller Engine */}
      <div 
        className="mix-blend-screen mix-blend-plus-lighter"
        style={propStyle}
      >
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.12, ease: 'linear' }}
          className="w-full h-full rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.12) 20deg, transparent 40deg, transparent 180deg, rgba(255,255,255,0.12) 200deg, transparent 220deg)',
            filter: 'blur(12px)'
          }}
        />
      </div>
    </motion.div>
  )
}
