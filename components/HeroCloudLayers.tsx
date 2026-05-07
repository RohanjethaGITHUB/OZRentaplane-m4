'use client'

import type React from 'react'

const CLOUD_TUNING = {
  mobile: {
    cloudA: 'w-[300%] h-[75%] bottom-[2%]',
    cloudB: 'w-[250%] h-[65%] bottom-[0%]',
  },
  desktop: {
    cloudA: 'md:w-[180%] md:h-[95%] md:bottom-[-2%]',
    cloudB: 'md:w-[150%] md:h-[80%] md:bottom-[-8%]',
  },
}

export default function HeroCloudLayers({
  innerRef,
  className = '',
}: {
  innerRef?: React.Ref<HTMLDivElement>
  className?: string
}) {
  return (
    <div ref={innerRef} className={`absolute inset-0 pointer-events-none z-[8] overflow-hidden ${className}`} aria-hidden="true">
      <div
        className={`hero-cloud-layer-a absolute left-[50%] ${CLOUD_TUNING.mobile.cloudA} ${CLOUD_TUNING.desktop.cloudA} flex items-end justify-center will-change-transform opacity-[0.40] mix-blend-screen`}
        style={{ animation: 'hero-cloud-a 16s ease-in-out infinite alternate', transform: 'translate3d(-50%,0,0)' }}
      >
        <img
          src="/CloudLayerA.webp"
          alt=""
          className="w-full h-full object-cover"
          style={{
            filter: 'brightness(0.90) contrast(1.05) sepia(0.14) hue-rotate(230deg) saturate(1.08)',
            maskImage: 'radial-gradient(ellipse 90% 100% at 50% 100%, black 15%, rgba(0,0,0,0.4) 50%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 100% at 50% 100%, black 15%, rgba(0,0,0,0.4) 50%, transparent 80%)',
          }}
        />
      </div>

      <div
        className={`hero-cloud-layer-b absolute left-[50%] ${CLOUD_TUNING.mobile.cloudB} ${CLOUD_TUNING.desktop.cloudB} flex items-end justify-center will-change-transform opacity-[0.34] mix-blend-screen`}
        style={{ animation: 'hero-cloud-b 13s ease-in-out infinite alternate', transform: 'translate3d(-50%,0,0)' }}
      >
        <img
          src="/CloudLayerB.webp"
          alt=""
          className="w-full h-full object-cover"
          style={{
            filter: 'brightness(0.85) contrast(1.05) sepia(0.18) hue-rotate(230deg) saturate(1.14)',
            maskImage: 'radial-gradient(ellipse 85% 100% at 50% 100%, black 20%, rgba(0,0,0,0.5) 50%, transparent 85%)',
            WebkitMaskImage: 'radial-gradient(ellipse 85% 100% at 50% 100%, black 20%, rgba(0,0,0,0.5) 50%, transparent 85%)',
          }}
        />
      </div>

      <style jsx>{`
        @keyframes hero-cloud-a {
          0% { transform: translate3d(-56%, 0, 0); }
          100% { transform: translate3d(-44%, 0, 0); }
        }
        @keyframes hero-cloud-b {
          0% { transform: translate3d(-45%, 0, 0); }
          100% { transform: translate3d(-55%, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-cloud-layer-a,
          .hero-cloud-layer-b {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
