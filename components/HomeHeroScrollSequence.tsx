'use client'

import { useEffect, useMemo, useRef } from 'react'
import { HOME_HERO_SCROLL_FRAMES } from '@/lib/homeHeroScrollFrames'

const SECTION_VH = 280
const LERP = 0.14
const INITIAL_PRELOAD = 24
const WINDOW_BEHIND = 8
const WINDOW_AHEAD = 24

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export default function HomeHeroScrollSequence() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const rafRef = useRef<number | null>(null)
  const scrollTickRef = useRef<number | null>(null)

  const reducedMotionRef = useRef(false)
  const loadedRef = useRef<Set<number>>(new Set())
  const loadingRef = useRef<Set<number>>(new Set())

  const targetFrameRef = useRef(0)
  const currentFrameRef = useRef(0)
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
    const from = clamp(center - WINDOW_BEHIND, 0, frameCount - 1)
    const to = clamp(center + WINDOW_AHEAD, 0, frameCount - 1)
    for (let i = from; i <= to; i += 1) preloadFrame(i)
  }

  function findClosestLoaded(target: number): number {
    if (loadedRef.current.has(target)) return target
    for (let dist = 1; dist < frameCount; dist += 1) {
      const left = target - dist
      const right = target + dist
      if (left >= 0 && loadedRef.current.has(left)) return left
      if (right < frameCount && loadedRef.current.has(right)) return right
    }
    return shownFrameRef.current
  }

  function applyBestFrame(index: number) {
    const imgEl = imgRef.current
    if (!imgEl) return
    const best = findClosestLoaded(index)
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
  }

  function renderLoop() {
    readScrollAndSetTarget()

    currentFrameRef.current += (targetFrameRef.current - currentFrameRef.current) * LERP
    const displayIndex = clamp(Math.round(currentFrameRef.current), 0, frameCount - 1)

    preloadRange(displayIndex)
    applyBestFrame(displayIndex)

    rafRef.current = window.requestAnimationFrame(renderLoop)
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = media.matches

    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
      if (e.matches) {
        if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
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

    if (frameZero && imgRef.current) {
      imgRef.current.src = frameZero
      loadedRef.current.add(0)
      shownFrameRef.current = 0
    }

    for (let i = 1; i < Math.min(frameCount, INITIAL_PRELOAD); i += 1) preloadFrame(i)

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

    if (!reducedMotionRef.current) {
      rafRef.current = window.requestAnimationFrame(renderLoop)
    }

    return () => {
      media.removeEventListener('change', onMotionChange)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      if (scrollTickRef.current !== null) window.cancelAnimationFrame(scrollTickRef.current)
    }
  }, [frameCount, frameZero])

  return (
    <section ref={sectionRef} className="relative" style={{ height: `${SECTION_VH}vh` }}>
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

        <div className="relative z-10 flex h-full flex-col justify-between px-6 pb-[13vh] pt-[16vh] md:px-12 lg:px-20">
          <div className="text-center">
            <h1 className="font-serif text-4xl font-black leading-tight text-oz-text md:text-7xl">
              <span className="block">FLY</span>
              <span className="block italic text-oz-blue">YOUR WAY</span>
            </h1>
          </div>

          <div className="pointer-events-auto mx-auto max-w-md text-center">
            <p className="mb-5 font-sans text-sm font-light leading-relaxed text-oz-muted md:mb-7 md:text-lg">
              A modern platform for pilots — rent, fly, and enjoy
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/pilotRequirements"
                className="inline-block rounded-md bg-gradient-to-r from-[#4168a6] to-[#172c4a] px-8 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-xl shadow-[#4168a6]/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#4168a6]/50 active:scale-95"
              >
                Schedule your checkout Flight
              </a>
              <a
                href="/fleet"
                className="inline-block rounded-md border border-white/20 px-8 py-3 text-sm font-bold uppercase tracking-widest text-white/80 transition-all duration-300 hover:border-white/40 hover:text-white"
              >
                Our Fleet
              </a>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#091421] via-[#0b111a]/30 to-transparent" />
      </div>
    </section>
  )
}
