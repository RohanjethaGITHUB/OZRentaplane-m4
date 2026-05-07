'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { HOME_HERO_SCROLL_FRAMES } from '@/lib/homeHeroScrollFrames'
import HeroCloudLayers from '@/components/HeroCloudLayers'

const SCROLL_HEIGHT_VH = 430
const SMOOTHING_TAU_MS = 110
const MAX_FRAME_STEP_PER_TICK = 2.1
const INITIAL_PRELOAD_COUNT = 50
const BACKGROUND_PRELOAD_BATCH = 12
const PRELOAD_AHEAD = 80
const PRELOAD_BEHIND = 12
const SETTLE_DIFF_EPS = 0.01
const SETTLE_EPSILON_FRAMES = 0.25
const MIN_VISIBLE_FRAME_DELTA = 0.35
const INTRO_DURATION_MS = 3000
const WORD_FLY_DELAY_MS = 220
const WORD_YOUR_DELAY_MS = 700
const WORD_WAY_DELAY_MS = 1120
const UNDERLINE_DELAY_MS = 1500
// Frame ranges from manifest: S1(50) + S2(40) + S3(70) = 160 total.
const SCENE_1_START = 0
const SCENE_1_END = 49
const SCENE_2_START = 50
const SCENE_2_END = 89
const SCENE_3_START = 90
const SCENE_3_END = 159
const SCENE_BOUNDARY_TRIGGER = 18
const SCENE_WARMUP_COUNT = 32
const CLOUD_FADE_START_FRAME = 22
const CLOUD_FADE_END_FRAME = 34

const SCENE_HEADINGS = [
  { line1: 'FLY', line2: 'YOUR WAY', showCta: true, start: SCENE_1_START, end: SCENE_1_END },
  { line1: 'TRAIN', line2: 'WITH CONFIDENCE', showCta: false, start: SCENE_2_START, end: SCENE_2_END },
  { line1: 'TAKE', line2: 'THE CONTROLS', showCta: false, start: SCENE_3_START, end: SCENE_3_END },
] as const

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export default function HomeHeroScrollSequence() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const cloudWrapRef = useRef<HTMLDivElement | null>(null)
  const ctaWrapRef = useRef<HTMLDivElement | null>(null)

  const rafRef = useRef<number | null>(null)
  const scrollTickRef = useRef<number | null>(null)
  const backgroundPreloadRafRef = useRef<number | null>(null)
  const introTimerRef = useRef<number | null>(null)

  const [introDone, setIntroDone] = useState(false)
  const [sceneIndex, setSceneIndex] = useState(0)
  const introDoneRef = useRef(false)
  const sceneIndexRef = useRef(0)
  const reducedMotionRef = useRef(false)
  const loadedRef = useRef<Set<number>>(new Set())
  const loadingRef = useRef<Set<number>>(new Set())

  const targetFrameRef = useRef(0)
  const currentFrameRef = useRef(0)
  const previousTargetFrameRef = useRef(0)
  const directionRef = useRef<1 | -1>(1)
  const lastRafTimeRef = useRef<number | null>(null)

  const shownFrameRef = useRef(0)

  const sectionTopRef = useRef(0)
  const sectionScrollableRef = useRef(1)

  const frameCount = HOME_HERO_SCROLL_FRAMES.length

  const frameZero = useMemo(() => HOME_HERO_SCROLL_FRAMES[0] ?? '', [])

  function updateSectionMetrics() {
    const section = sectionRef.current
    if (!section) return
    const rect = section.getBoundingClientRect()
    const scrollY = window.scrollY || window.pageYOffset
    const vh = window.innerHeight || 1
    sectionTopRef.current = rect.top + scrollY
    sectionScrollableRef.current = Math.max(1, rect.height - vh)
  }

  function markLoaded(index: number) {
    loadedRef.current.add(index)
    loadingRef.current.delete(index)
  }

  function preloadFrame(index: number) {
    if (index < 0 || index >= frameCount) return
    if (loadedRef.current.has(index) || loadingRef.current.has(index)) return

    const src = HOME_HERO_SCROLL_FRAMES[index]
    if (!src) return

    loadingRef.current.add(index)
    const img = new Image()
    img.onload = () => markLoaded(index)
    img.onerror = () => loadingRef.current.delete(index)
    img.src = src
  }

  function preloadRange(center: number) {
    const behind = directionRef.current > 0 ? PRELOAD_BEHIND : PRELOAD_AHEAD
    const ahead = directionRef.current > 0 ? PRELOAD_AHEAD : PRELOAD_BEHIND
    const from = clamp(center - behind, 0, frameCount - 1)
    const to = clamp(center + ahead, 0, frameCount - 1)
    for (let i = from; i <= to; i += 1) preloadFrame(i)
  }

  function preloadSceneWarmup(center: number) {
    if (directionRef.current > 0) {
      if (center >= SCENE_1_END - SCENE_BOUNDARY_TRIGGER && center <= SCENE_1_END) {
        for (let i = SCENE_2_START; i < Math.min(SCENE_2_START + SCENE_WARMUP_COUNT, SCENE_2_END + 1); i += 1) preloadFrame(i)
      }
      if (center >= SCENE_2_END - SCENE_BOUNDARY_TRIGGER && center <= SCENE_2_END) {
        for (let i = SCENE_3_START; i < Math.min(SCENE_3_START + SCENE_WARMUP_COUNT, SCENE_3_END + 1); i += 1) preloadFrame(i)
      }
    } else {
      if (center >= SCENE_2_START && center <= SCENE_2_START + SCENE_BOUNDARY_TRIGGER) {
        for (let i = Math.max(SCENE_1_END - SCENE_WARMUP_COUNT + 1, SCENE_1_START); i <= SCENE_1_END; i += 1) preloadFrame(i)
      }
      if (center >= SCENE_3_START && center <= SCENE_3_START + SCENE_BOUNDARY_TRIGGER) {
        for (let i = Math.max(SCENE_2_END - SCENE_WARMUP_COUNT + 1, SCENE_2_START); i <= SCENE_2_END; i += 1) preloadFrame(i)
      }
    }
  }

  function updateCloudVisibility(playhead: number) {
    const el = cloudWrapRef.current
    if (!el) return
    let opacity = 1
    if (playhead >= CLOUD_FADE_END_FRAME) opacity = 0
    else if (playhead > CLOUD_FADE_START_FRAME) {
      const t = (playhead - CLOUD_FADE_START_FRAME) / (CLOUD_FADE_END_FRAME - CLOUD_FADE_START_FRAME)
      opacity = 1 - clamp(t, 0, 1)
    }
    el.style.opacity = String(opacity)
  }

  function updateCtaVisibility(playhead: number) {
    const el = ctaWrapRef.current
    if (!el) return
    let opacity = 1
    if (playhead >= CLOUD_FADE_END_FRAME) opacity = 0
    else if (playhead > CLOUD_FADE_START_FRAME) {
      const t = (playhead - CLOUD_FADE_START_FRAME) / (CLOUD_FADE_END_FRAME - CLOUD_FADE_START_FRAME)
      opacity = 1 - clamp(t, 0, 1)
    }
    el.style.opacity = String(opacity)
    el.style.pointerEvents = opacity > 0.08 ? 'auto' : 'none'
  }

  function getSceneIndex(frame: number): number {
    if (frame <= SCENE_1_END) return 0
    if (frame <= SCENE_2_END) return 1
    return 2
  }

  function preloadRemainingInBackground() {
    let start = 0
    function tick() {
      let done = true
      let loadedInBatch = 0
      for (let i = start; i < frameCount && loadedInBatch < BACKGROUND_PRELOAD_BATCH; i += 1) {
        if (!loadedRef.current.has(i) && !loadingRef.current.has(i)) {
          preloadFrame(i)
          loadedInBatch += 1
          done = false
        }
      }
      while (start < frameCount && (loadedRef.current.has(start) || loadingRef.current.has(start))) start += 1
      if (!done && start < frameCount) {
        backgroundPreloadRafRef.current = window.requestAnimationFrame(tick)
      } else {
        backgroundPreloadRafRef.current = null
      }
    }
    if (backgroundPreloadRafRef.current === null) {
      backgroundPreloadRafRef.current = window.requestAnimationFrame(tick)
    }
  }

  function findDirectionalLoaded(target: number): number {
    if (loadedRef.current.has(target)) return target

    // Forward travel: prefer the furthest loaded frame at-or-before target.
    if (directionRef.current > 0) {
      for (let i = target; i >= 0; i -= 1) {
        if (loadedRef.current.has(i)) return i
      }
      // If nothing behind, pick earliest loaded ahead.
      for (let i = target + 1; i < frameCount; i += 1) {
        if (loadedRef.current.has(i)) return i
      }
    } else {
      // Backward travel: prefer the earliest loaded frame at-or-after target.
      for (let i = target; i < frameCount; i += 1) {
        if (loadedRef.current.has(i)) return i
      }
      // If nothing ahead, pick nearest loaded behind.
      for (let i = target - 1; i >= 0; i -= 1) {
        if (loadedRef.current.has(i)) return i
      }
    }
    return shownFrameRef.current
  }

  function applyBestFrame(playhead: number) {
    const imgEl = imgRef.current
    if (!imgEl) return

    const desiredFloat = clamp(playhead, 0, frameCount - 1)
    const shown = shownFrameRef.current
    const remainingToTarget = Math.abs(targetFrameRef.current - desiredFloat)
    const shouldSettleNow = remainingToTarget <= SETTLE_EPSILON_FRAMES

    // Hysteresis avoids a delayed one-frame pop when playhead nearly stops.
    if (!shouldSettleNow && Math.abs(desiredFloat - shown) < MIN_VISIBLE_FRAME_DELTA) return

    let desired = shown
    if (shouldSettleNow) {
      desired = clamp(Math.round(targetFrameRef.current), 0, frameCount - 1)
    } else if (directionRef.current > 0) {
      desired = clamp(Math.floor(desiredFloat), 0, frameCount - 1)
    } else {
      desired = clamp(Math.ceil(desiredFloat), 0, frameCount - 1)
    }

    const best = loadedRef.current.has(desired) ? desired : findDirectionalLoaded(desired)
    const src = HOME_HERO_SCROLL_FRAMES[best]
    if (!src) return
    if (shownFrameRef.current !== best) {
      shownFrameRef.current = best
      imgEl.src = src
    }
  }

  function readScrollAndSetTarget() {
    const scrollY = window.scrollY || window.pageYOffset
    const raw = (scrollY - sectionTopRef.current) / sectionScrollableRef.current
    const progress = clamp(raw, 0, 1)
    targetFrameRef.current = progress * (frameCount - 1)
    const diff = targetFrameRef.current - previousTargetFrameRef.current
    if (Math.abs(diff) > 0.001) directionRef.current = diff > 0 ? 1 : -1
    previousTargetFrameRef.current = targetFrameRef.current
  }

  function renderLoop(ts: number) {
    const prevTs = lastRafTimeRef.current ?? ts
    const dt = Math.max(0, ts - prevTs)
    lastRafTimeRef.current = ts

    readScrollAndSetTarget()
    if (!introDoneRef.current) {
      targetFrameRef.current = 0
      currentFrameRef.current = 0
      applyBestFrame(0)
      updateCloudVisibility(0)
      rafRef.current = window.requestAnimationFrame(renderLoop)
      return
    }

    const diff = targetFrameRef.current - currentFrameRef.current
    const alpha = 1 - Math.exp(-dt / SMOOTHING_TAU_MS)
    const proposed = currentFrameRef.current + diff * alpha

    if (diff > 0) {
      const limited = Math.min(proposed, currentFrameRef.current + MAX_FRAME_STEP_PER_TICK)
      currentFrameRef.current = Math.min(limited, targetFrameRef.current)
    } else if (diff < 0) {
      const limited = Math.max(proposed, currentFrameRef.current - MAX_FRAME_STEP_PER_TICK)
      currentFrameRef.current = Math.max(limited, targetFrameRef.current)
    }

    if (Math.abs(targetFrameRef.current - currentFrameRef.current) < SETTLE_EPSILON_FRAMES) {
      currentFrameRef.current = targetFrameRef.current
    }

    const preloadCenter = clamp(Math.round(targetFrameRef.current), 0, frameCount - 1)
    preloadRange(preloadCenter)
    preloadSceneWarmup(preloadCenter)
    applyBestFrame(currentFrameRef.current)
    const sceneFrame = clamp(Math.round(currentFrameRef.current), 0, frameCount - 1)
    updateCloudVisibility(sceneFrame)
    updateCtaVisibility(sceneFrame)
    const nextSceneIndex = getSceneIndex(sceneFrame)
    if (nextSceneIndex !== sceneIndexRef.current) {
      sceneIndexRef.current = nextSceneIndex
      setSceneIndex(nextSceneIndex)
    }

    const isSettled = Math.abs(targetFrameRef.current - currentFrameRef.current) < SETTLE_DIFF_EPS
    if (!isSettled) {
      rafRef.current = window.requestAnimationFrame(renderLoop)
      return
    }
    rafRef.current = null
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = media.matches

    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
      if (e.matches) {
        introDoneRef.current = true
        setIntroDone(true)
      }
      if (e.matches) {
        if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        lastRafTimeRef.current = null
        shownFrameRef.current = 0
        currentFrameRef.current = 0
        targetFrameRef.current = 0
        if (imgRef.current && frameZero) imgRef.current.src = frameZero
      } else {
        updateSectionMetrics()
        if (rafRef.current === null) rafRef.current = window.requestAnimationFrame(renderLoop)
      }
    }

    media.addEventListener('change', onMotionChange)
    if (media.matches) {
      introDoneRef.current = true
      setIntroDone(true)
    } else {
      introTimerRef.current = window.setTimeout(() => {
        introDoneRef.current = true
        setIntroDone(true)
      }, INTRO_DURATION_MS)
    }

    if (frameZero && imgRef.current) {
      imgRef.current.src = frameZero
      loadedRef.current.add(0)
      shownFrameRef.current = 0
    }

    for (let i = 1; i < Math.min(frameCount, INITIAL_PRELOAD_COUNT); i += 1) preloadFrame(i)
    preloadRemainingInBackground()

    const onScroll = () => {
      if (scrollTickRef.current !== null) return
      scrollTickRef.current = window.requestAnimationFrame(() => {
        scrollTickRef.current = null
      })
    }

    const onResize = () => updateSectionMetrics()

    updateSectionMetrics()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })

    if (!reducedMotionRef.current) rafRef.current = window.requestAnimationFrame(renderLoop)

    return () => {
      if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current)
      media.removeEventListener('change', onMotionChange)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      if (scrollTickRef.current !== null) window.cancelAnimationFrame(scrollTickRef.current)
      if (backgroundPreloadRafRef.current !== null) window.cancelAnimationFrame(backgroundPreloadRafRef.current)
    }
  }, [frameCount, frameZero])

  useEffect(() => {
    if (reducedMotionRef.current) return
    const onScrollKick = () => {
      if (rafRef.current === null) rafRef.current = window.requestAnimationFrame(renderLoop)
    }
    window.addEventListener('scroll', onScrollKick, { passive: true })
    return () => window.removeEventListener('scroll', onScrollKick)
  }, [])

  return (
    <section ref={sectionRef} className="relative" style={{ height: `${SCROLL_HEIGHT_VH}vh` }}>
      <div className="sticky top-0 overflow-hidden min-h-screen min-h-[100svh] min-h-[100dvh]">
        <img
          ref={imgRef}
          src={frameZero}
          alt="Aircraft flying through Sydney twilight"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="sync"
        />

        <div className="absolute inset-0 bg-gradient-to-b from-[#091421]/35 via-[#091421]/25 to-[#091421]/70 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(2,10,30,0.22)', mixBlendMode: 'multiply' }} />
        <HeroCloudLayers innerRef={cloudWrapRef} />

        {!reducedMotionRef.current && (
          <div
            className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-700 ${introDone ? 'opacity-0' : 'opacity-100'}`}
          >
          <div className="absolute left-0 right-0 flex flex-col items-center text-center px-6 md:px-12" style={{ top: '16vh' }}>
            <h1 className="font-serif text-4xl md:text-7xl font-normal leading-[1.04] tracking-[0.015em]">
                <span className="block text-oz-text">
                  <span className="inline-block hero-wind-fly">FLY</span>
                </span>
                <span className="block italic text-oz-blue relative pb-3 hero-your-way-group">
                  <span className="inline-block hero-wind-your">YOUR</span>{' '}
                  <span className="inline-block hero-wind-way">WAY</span>
                  <svg viewBox="0 0 340 20" fill="none" aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 bottom-[-2px] w-[90%] md:w-[85%] h-[14px] md:h-[18px] hero-underline-drift">
                    <path d="M 6 13 C 45 5, 90 18, 145 10 C 200 3, 255 16, 310 10 C 322 8, 330 9, 334 11" stroke="rgba(167,200,255,0.55)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </h1>
            </div>
          </div>
        )}

        <div className="absolute inset-0 z-10 px-6 md:px-12 lg:px-20">
          <div className={`pt-[16vh] text-center transition-opacity duration-500 ${introDone || reducedMotionRef.current ? 'opacity-100' : 'opacity-0'}`}>
            <div key={`${SCENE_HEADINGS[sceneIndex]?.line1}-${SCENE_HEADINGS[sceneIndex]?.line2}`} className="hero-scene-heading-enter">
              <h1 className="font-serif text-4xl font-normal leading-[1.04] tracking-[0.015em] text-[#e8f1ff] md:text-7xl [text-shadow:0_3px_14px_rgba(8,20,40,0.24)]">
                <span className="block">{SCENE_HEADINGS[sceneIndex]?.line1}</span>
                <span className="relative block italic text-[#c7dcff] pb-3">
                  {SCENE_HEADINGS[sceneIndex]?.line2}
                  <svg viewBox="0 0 340 20" fill="none" aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 bottom-[-2px] w-[90%] md:w-[85%] h-[14px] md:h-[18px] hero-scene-underline-drift">
                    <path d="M 6 13 C 45 5, 90 18, 145 10 C 200 3, 255 16, 310 10 C 322 8, 330 9, 334 11" stroke="rgba(167,200,255,0.58)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </h1>
            </div>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 bottom-[12svh] z-20 w-[min(92vw,48rem)] text-center">
            <div
              ref={ctaWrapRef}
              className={`pointer-events-auto transition-opacity duration-500 ${SCENE_HEADINGS[sceneIndex]?.showCta ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <p className="mb-5 font-sans text-sm font-light leading-relaxed text-oz-muted md:mb-7 md:text-lg">
                A modern platform for pilots — rent, fly, enjoy
              </p>
              <a
                href="/pilotRequirements"
                className="inline-block whitespace-nowrap rounded-md bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                SCHEDULE YOUR CHECKOUT FLIGHT
              </a>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#091421] via-[#0b111a]/30 to-transparent" />
        <style jsx>{`
          @keyframes hero-word-reveal {
            0% { opacity: 0; transform: translate3d(0, 8px, 0) skewX(-4deg) rotate(-0.6deg); }
            100% { opacity: 1; transform: translate3d(0, 0, 0) skewX(0deg) rotate(0deg); }
          }
          @keyframes hero-flag-wave-word {
            0% { transform: translate3d(0, 0, 0) skewX(0deg) rotate(0deg); }
            22% { transform: translate3d(1px, -1px, 0) skewX(-3deg) rotate(-0.6deg); }
            50% { transform: translate3d(0, 1px, 0) skewX(2.4deg) rotate(0.5deg); }
            78% { transform: translate3d(-1px, -1px, 0) skewX(-2deg) rotate(-0.4deg); }
            100% { transform: translate3d(0, 0, 0) skewX(0deg) rotate(0deg); }
          }
          @keyframes hero-flag-wave-group {
            0% { transform: translate3d(0, 0, 0) skewX(0deg) rotate(0deg); }
            30% { transform: translate3d(0, -1px, 0) skewX(-2.2deg) rotate(-0.5deg); }
            65% { transform: translate3d(0, 1px, 0) skewX(2deg) rotate(0.5deg); }
            100% { transform: translate3d(0, 0, 0) skewX(0deg) rotate(0deg); }
          }
          @keyframes hero-underline-wave {
            0% { transform: translate3d(-50%, 0, 0) skewX(0deg) scaleX(1); opacity: 0; }
            35% { transform: translate3d(-50%, -1px, 0) skewX(-2deg) scaleX(1.02); opacity: 0.92; }
            70% { transform: translate3d(-50%, 1px, 0) skewX(1.7deg) scaleX(0.99); opacity: 1; }
            100% { transform: translate3d(-50%, 0, 0) skewX(0deg) scaleX(1); opacity: 0.95; }
          }
          @keyframes hero-scene-heading-in {
            0% { opacity: 0; transform: translate3d(0, 7px, 0); filter: blur(2px); }
            100% { opacity: 1; transform: translate3d(0, 0, 0); filter: blur(0); }
          }
          @keyframes hero-scene-underline-wave {
            0% { transform: translate3d(-50%, 0, 0) skewX(0deg) scaleX(1); opacity: 0.86; }
            35% { transform: translate3d(-50%, -1px, 0) skewX(-1.3deg) scaleX(1.01); opacity: 0.98; }
            70% { transform: translate3d(-50%, 1px, 0) skewX(1.1deg) scaleX(0.995); opacity: 0.93; }
            100% { transform: translate3d(-50%, 0, 0) skewX(0deg) scaleX(1); opacity: 0.9; }
          }
          .hero-wind-fly {
            opacity: 0;
            animation:
              hero-word-reveal 0.55s ease-out ${WORD_FLY_DELAY_MS}ms forwards,
              hero-flag-wave-word 2.8s ease-in-out ${WORD_FLY_DELAY_MS + 550}ms infinite;
          }
          .hero-wind-your {
            opacity: 0;
            animation:
              hero-word-reveal 0.55s ease-out ${WORD_YOUR_DELAY_MS}ms forwards,
              hero-flag-wave-word 2.8s ease-in-out ${WORD_YOUR_DELAY_MS + 550}ms infinite;
          }
          .hero-wind-way {
            opacity: 0;
            animation:
              hero-word-reveal 0.55s ease-out ${WORD_WAY_DELAY_MS}ms forwards,
              hero-flag-wave-word 2.8s ease-in-out ${WORD_WAY_DELAY_MS + 550}ms infinite;
          }
          .hero-your-way-group {
            transform-origin: 50% 55%;
            animation: hero-flag-wave-group 3.1s ease-in-out ${WORD_WAY_DELAY_MS + 650}ms infinite;
          }
          .hero-underline-drift {
            opacity: 0;
            transform-origin: 50% 50%;
            animation: hero-underline-wave 3.1s ease-in-out ${UNDERLINE_DELAY_MS}ms infinite;
          }
          .hero-scene-heading-enter {
            animation: hero-scene-heading-in 420ms ease-out forwards;
          }
          .hero-scene-underline-drift {
            animation: hero-scene-underline-wave 3.4s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .hero-wind-fly, .hero-wind-your, .hero-wind-way, .hero-underline-drift {
              animation: none !important;
              opacity: 1 !important;
              transform: none !important;
            }
            .hero-scene-heading-enter, .hero-scene-underline-drift {
              animation: none !important;
              filter: none !important;
            }
          }
        `}</style>
      </div>
    </section>
  )
}
