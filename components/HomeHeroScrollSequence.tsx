'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { HOME_HERO_SCROLL_FRAMES } from '@/lib/homeHeroScrollFrames'
import { HOME_HERO_SCROLL_MOBILE_FRAMES } from '@/lib/homeHeroScrollMobileFrames'
import { HOME_HERO_SCROLL_FRAMES_JPEG } from '@/lib/homeHeroScrollFramesJPEG'
import { HOME_HERO_SCROLL_MOBILE_FRAMES_JPEG } from '@/lib/homeHeroScrollMobileFramesJPEG'
import HeroCloudLayers from '@/components/HeroCloudLayers'

const SCROLL_HEIGHT_VH = 430
const FULL_MOTION_SMOOTHING_TAU_MS = 110
const REDUCED_MOTION_SMOOTHING_TAU_MS = 60
const MOBILE_FULL_MOTION_SMOOTHING_TAU_MS = 120
const MOBILE_REDUCED_MOTION_SMOOTHING_TAU_MS = 70
const DESKTOP_MAX_FRAME_STEP_PER_TICK = 2.1
const MOBILE_MAX_FRAME_STEP_PER_TICK = 1.8
const INTRO_DURATION_MS = 3000
const WORD_FLY_DELAY_MS = 220
const WORD_YOUR_DELAY_MS = 700
const WORD_WAY_DELAY_MS = 1120
const UNDERLINE_DELAY_MS = 1500
const CLOUD_FADE_START_FRAME = 22
const CLOUD_FADE_END_FRAME = 34

const HERO_TEXT = { line1: 'FLY', line2: 'YOUR WAY', showCta: true } as const

const INITIAL_PRELOAD_COUNT = 30
const MOBILE_INITIAL_PRELOAD_COUNT = 50
const PRELOAD_AHEAD = 40
const PRELOAD_BEHIND = 12
const SCENE_BOUNDARY_TRIGGER = 18
const SCENE_WARMUP_COUNT = 45
const SAFARI_SCENE_BOUNDARY_TRIGGER = 35
const SAFARI_SCENE_WARMUP_COUNT = 45
const MOBILE_FRAME_SWAP_INTERVAL_MS = 33
const MIN_VISIBLE_FRAME_DELTA = 0.5
const MIN_TARGET_FRAME_DELTA = 0.08
const SETTLE_EPSILON_FRAMES = 0.25
const SETTLE_DIFF_EPS = 0.01
const BACKGROUND_PRELOAD_BATCH = 3
const MOBILE_BACKGROUND_PRELOAD_BATCH = 2

type ActiveSequence = {
  key: 'mobile' | 'desktop'
  frames: readonly string[]
  scenes: { start: number; end: number }[]
  totalFrames: number
}

function deriveSceneMetadata(frames: readonly string[]) {
  return {
    scenes: [
      { start: 0, end: 49 },
      { start: 50, end: 89 },
      { start: 90, end: 159 },
    ],
    totalFrames: frames.length,
  }
}


type MotionMode = 'full' | 'reduced'
type ScrollLockSnapshot = {
  scrollY: number
  htmlOverflow: string
  htmlOverscrollBehavior: string
  bodyOverflow: string
  bodyPosition: string
  bodyTop: string
  bodyLeft: string
  bodyRight: string
  bodyWidth: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

const IS_SAFARI =
  typeof navigator !== 'undefined' &&
  /Safari\//.test(navigator.userAgent) &&
  !/Chrome\//.test(navigator.userAgent)

export default function HomeHeroScrollSequence() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const imgBufferRef = useRef<HTMLImageElement | null>(null)
  const cloudWrapRef = useRef<HTMLDivElement | null>(null)
  const ctaWrapRef = useRef<HTMLDivElement | null>(null)
  const sceneHeadingRef = useRef<HTMLDivElement | null>(null)

  const rafRef = useRef<number | null>(null)
  const scrollTickRef = useRef<number | null>(null)
  const introTimerRef = useRef<number | null>(null)
  const backgroundPreloadRafRef = useRef<number | null>(null)

  const [introDone, setIntroDone] = useState(false)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [preloadProgress, setPreloadProgress] = useState(0)
  const [preloadComplete, setPreloadComplete] = useState(false)
  
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })

  const activeSequence = useMemo<ActiveSequence>(() => {
    const frames = isMobileViewport
      ? (IS_SAFARI 
          ? HOME_HERO_SCROLL_MOBILE_FRAMES_JPEG 
          : HOME_HERO_SCROLL_MOBILE_FRAMES)
      : (IS_SAFARI 
          ? HOME_HERO_SCROLL_FRAMES_JPEG 
          : HOME_HERO_SCROLL_FRAMES)
    const meta = deriveSceneMetadata(frames)
    return {
      key: isMobileViewport ? 'mobile' : 'desktop',
      frames,
      scenes: meta.scenes,
      totalFrames: meta.totalFrames,
    }
  }, [isMobileViewport])

  const activeSequenceRef = useRef(activeSequence)
  useEffect(() => {
    activeSequenceRef.current = activeSequence
  }, [activeSequence])

  const introDoneRef = useRef(false)
  const sceneIndexRef = useRef(0)
  const motionModeRef = useRef<MotionMode>('full')

  const targetFrameRef = useRef(0)
  const currentFrameRef = useRef(0)
  const previousTargetFrameRef = useRef(0)
  const directionRef = useRef<1 | -1>(1)
  const lastRafTimeRef = useRef<number | null>(null)

  const loadedRef = useRef<Set<number>>(new Set())
  const loadingRef = useRef<Set<number>>(new Set())
  const shownFrameRef = useRef<number>(0)
  const lastVisibleSwapTsRef = useRef<number>(0)
  const preloadCompleteRef = useRef(false)
  const lastFallbackUsedRef = useRef(false)

  const sectionTopRef = useRef(0)
  const sectionScrollableRef = useRef(1)

  const [debugEnabled, setDebugEnabled] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [forceMotion, setForceMotion] = useState(false)
  const [forceReducedMotion, setForceReducedMotion] = useState(false)
  const [motionMode, setMotionMode] = useState<MotionMode>('full')
  const [coarsePointer, setCoarsePointer] = useState(false)
  const [debugTick, setDebugTick] = useState(0)
  const debugIntervalRef = useRef<number | null>(null)
  const fpsAccumMsRef = useRef(0)
  const fpsFramesRef = useRef(0)
  const avgFpsRef = useRef(0)
  const longFrameCountRef = useRef(0)
  const viewportRef = useRef({ width: 0, height: 0 })
  const scrollProgressRawRef = useRef(0)
  const scrollProgressClampedRef = useRef(0)
  const scrollLockSnapshotRef = useRef<ScrollLockSnapshot | null>(null)
  const sceneHeadings = useMemo(
    () =>
      activeSequence.scenes.map((scene, idx) => ({
        line1: idx === 0 ? HERO_TEXT.line1 : '',
        line2: idx === 0 ? HERO_TEXT.line2 : '',
        showCta: idx === 0 ? HERO_TEXT.showCta : false,
        start: scene.start,
        end: scene.end,
      })),
    [],
  )
  const cloudFadeEnabled = true
  const ctaFadeEnabled = true
  const decorativeTextWaveEnabled = motionMode === 'full'
  const underlineWaveEnabled = motionMode === 'full'
  const cloudDriftEnabled = motionMode === 'full'
  const lowPowerDevice =
    coarsePointer ||
    (typeof navigator !== 'undefined' && (navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4)
  const liteCloudFx = motionMode === 'reduced' || isMobileViewport || lowPowerDevice
  const reducedMotionStatusOn = forceReducedMotion || (!forceMotion && prefersReducedMotion)
  const browserLabel = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Unknown'
    const ua = navigator.userAgent
    if (/Edg\//.test(ua)) return 'Edge'
    if (/Firefox\//.test(ua)) return 'Firefox'
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome'
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
    return 'Unknown'
  }, [])

  function updateSectionMetrics() {
    const section = sectionRef.current
    if (!section) return
    const rect = section.getBoundingClientRect()
    const scrollY = window.scrollY || window.pageYOffset
    const vh = window.innerHeight || 1
    sectionTopRef.current = rect.top + scrollY
    sectionScrollableRef.current = Math.max(1, rect.height - vh)
    viewportRef.current = { width: window.innerWidth || 0, height: vh }
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

  function updateSceneHeading(newSceneIndex: number) {
    const el = sceneHeadingRef.current
    if (!el) return
    
    // Update text content directly — no React re-render
    const heading = sceneHeadings[newSceneIndex]
    if (!heading) return
    
    const line1El = el.querySelector('[data-line="1"]')
    const line2El = el.querySelector('[data-line="2"]')
    if (line1El) line1El.textContent = heading.line1 ?? ''
    if (line2El) line2El.textContent = heading.line2 ?? ''
    
    // Retrigger animation without remounting
    el.classList.remove('hero-scene-heading-enter')
    // Force reflow to restart animation
    void el.offsetHeight
    el.classList.add('hero-scene-heading-enter')
  }

  function getSceneIndex(frame: number): number {
    const scenes = activeSequenceRef.current.scenes
    if (frame <= scenes[0].end) return 0
    if (frame <= scenes[1].end) return 1
    return 2
  }


  function markLoaded(index: number) {
    loadedRef.current.add(index)
    loadingRef.current.delete(index)
    const total = activeSequenceRef.current.totalFrames
    const loaded = loadedRef.current.size
    const pct = Math.min(100, Math.round((loaded / total) * 100))
    setPreloadProgress(pct)
    if (pct >= 100 && !preloadCompleteRef.current) {
      preloadCompleteRef.current = true
      setPreloadComplete(true)
      // Ensure intro is done when preload completes
      // so scroll is immediately available after overlay fades
      if (!introDoneRef.current) {
        introDoneRef.current = true
        setIntroDone(true)
        unlockPageScroll()
      }
    }
  }

  function preloadFrame(index: number) {
    const sequence = activeSequenceRef.current
    const frameTotal = sequence.totalFrames
    if (index < 0 || index >= frameTotal) return
    if (loadedRef.current.has(index) || loadingRef.current.has(index)) return
    const src = sequence.frames[index]
    if (!src) return
    const sequenceKeyAtStart = sequence.key
    loadingRef.current.add(index)
    const img = new Image()
    img.onload = () => {
      if (sequenceKeyAtStart !== activeSequenceRef.current.key) return
      markLoaded(index)
      // On Safari, force browser to decode the image immediately
      // by drawing it to a temporary canvas — this pre-warms
      // the image decoder so src swaps are instant
      if (IS_SAFARI) {
        const offscreen = document.createElement('canvas')
        offscreen.width = 1
        offscreen.height = 1
        const ctx = offscreen.getContext('2d')
        if (ctx) ctx.drawImage(img, 0, 0, 1, 1)
      }
    }
    img.onerror = () => {
      if (sequenceKeyAtStart !== activeSequenceRef.current.key) return
      loadingRef.current.delete(index)
    }
    img.src = src
  }

  function findDirectionalLoaded(desired: number): number {
    const sequence = activeSequenceRef.current
    const frameTotal = sequence.totalFrames
    const dir = directionRef.current
    for (let offset = 1; offset < frameTotal; offset++) {
      const fwd = clamp(desired + offset * dir, 0, frameTotal - 1)
      if (loadedRef.current.has(fwd)) return fwd
      const bwd = clamp(desired - offset * dir, 0, frameTotal - 1)
      if (loadedRef.current.has(bwd)) return bwd
    }
    return 0
  }

  function preloadRange(center: number) {
    const frameTotal = activeSequenceRef.current.totalFrames
    const behind = directionRef.current > 0 ? PRELOAD_BEHIND : PRELOAD_AHEAD
    const ahead = directionRef.current > 0 ? PRELOAD_AHEAD : PRELOAD_BEHIND
    const from = clamp(center - behind, 0, frameTotal - 1)
    const to = clamp(center + ahead, 0, frameTotal - 1)
    for (let i = from; i <= to; i += 1) preloadFrame(i)
  }

  function preloadSceneWarmup(center: number) {
    const boundaryTrigger = IS_SAFARI 
      ? SAFARI_SCENE_BOUNDARY_TRIGGER 
      : SCENE_BOUNDARY_TRIGGER
    const warmupCount = IS_SAFARI
      ? SAFARI_SCENE_WARMUP_COUNT
      : SCENE_WARMUP_COUNT

    const scenes = activeSequenceRef.current.scenes
    if (directionRef.current > 0) {
      const scene1 = scenes[0]
      const scene2 = scenes[1]
      const scene3 = scenes[2]
      if (center >= scene1.end - boundaryTrigger && 
          center <= scene1.end) {
        for (let i = scene2.start; 
             i < Math.min(scene2.start + warmupCount, scene2.end + 1); 
             i++) preloadFrame(i)
      }
      if (center >= scene2.end - boundaryTrigger && 
          center <= scene2.end) {
        for (let i = scene3.start; 
             i < Math.min(scene3.start + warmupCount, scene3.end + 1); 
             i++) preloadFrame(i)
      }
    } else {
      const scene1 = scenes[0]
      const scene2 = scenes[1]
      const scene3 = scenes[2]
      if (center >= scene2.start && 
          center <= scene2.start + boundaryTrigger) {
        for (let i = Math.max(scene1.end - warmupCount + 1, 
                              scene1.start); 
             i <= scene1.end; i++) preloadFrame(i)
      }
      if (center >= scene3.start && 
          center <= scene3.start + boundaryTrigger) {
        for (let i = Math.max(scene2.end - warmupCount + 1, 
                              scene2.start); 
             i <= scene2.end; i++) preloadFrame(i)
      }
    }
  }

  function preloadRemainingInBackground() {
    const sequenceKeyAtStart = activeSequenceRef.current.key
    let start = 0
    const scheduleIdle =
      typeof window.requestIdleCallback === 'function'
        ? (cb: () => void) => 
            window.requestIdleCallback(() => cb(), { timeout: 180 })
        : (cb: () => void) => window.setTimeout(cb, 80)
    function tick() {
      if (sequenceKeyAtStart !== activeSequenceRef.current.key) {
        backgroundPreloadRafRef.current = null
        return
      }
      const frameTotal = activeSequenceRef.current.totalFrames
      let done = true
      let loadedInBatch = 0
      const preloadBatch = activeSequenceRef.current.key === 'mobile' 
        ? MOBILE_BACKGROUND_PRELOAD_BATCH 
        : BACKGROUND_PRELOAD_BATCH
      for (let i = start; i < frameTotal && loadedInBatch < preloadBatch; i++) {
        if (!loadedRef.current.has(i) && !loadingRef.current.has(i)) {
          preloadFrame(i)
          loadedInBatch++
          done = false
        }
      }
      while (start < frameTotal && 
             (loadedRef.current.has(start) || 
              loadingRef.current.has(start))) start++
      if (!done && start < frameTotal) {
        scheduleIdle(() => {
          backgroundPreloadRafRef.current = 
            window.requestAnimationFrame(tick)
        })
      } else {
        backgroundPreloadRafRef.current = null
      }
    }
    if (backgroundPreloadRafRef.current === null) {
      backgroundPreloadRafRef.current = 
        window.requestAnimationFrame(tick)
    }
  }

  function applyBestFrame(playhead: number, nowTs: number) {
    const sequence = activeSequenceRef.current
    const imgEl = imgRef.current
    const bufferEl = imgBufferRef.current
    if (!imgEl) return

    const desiredFloat = clamp(playhead, 0, sequence.totalFrames - 1)
    const shown = shownFrameRef.current
    const remainingToTarget = Math.abs(targetFrameRef.current - desiredFloat)
    const shouldSettleNow = remainingToTarget <= SETTLE_EPSILON_FRAMES

    if (!shouldSettleNow && 
        Math.abs(desiredFloat - shown) < MIN_VISIBLE_FRAME_DELTA) return

    let desired = shown
    if (shouldSettleNow) {
      desired = clamp(
        Math.round(targetFrameRef.current), 
        0, sequence.totalFrames - 1
      )
    } else if (directionRef.current > 0) {
      desired = clamp(Math.floor(desiredFloat), 0, sequence.totalFrames - 1)
    } else {
      desired = clamp(Math.ceil(desiredFloat), 0, sequence.totalFrames - 1)
    }

    const best = loadedRef.current.has(desired) 
      ? desired 
      : findDirectionalLoaded(desired)
    const src = sequence.frames[best]
    if (!src) return
    lastFallbackUsedRef.current = best !== desired
    if (!loadedRef.current.has(best) && 
        shownFrameRef.current !== best) return

    const shouldThrottleMobileSwap =
      sequence.key === 'mobile' &&
      !shouldSettleNow &&
      nowTs - lastVisibleSwapTsRef.current < MOBILE_FRAME_SWAP_INTERVAL_MS
    if (shouldThrottleMobileSwap) return

    if (shownFrameRef.current === best) return

    shownFrameRef.current = best
    lastVisibleSwapTsRef.current = nowTs

    // Safari: skip decode() entirely — direct src swap is faster
    // since frames are already in browser memory from preload
    if (IS_SAFARI) {
      imgEl.src = src
    } else if (bufferEl && typeof bufferEl.decode === 'function') {
      bufferEl.src = src
      let settled = false
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        imgEl.src = src
      }, 12)
      bufferEl.decode().then(() => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (shownFrameRef.current !== best) return
        imgEl.src = src
      }).catch(() => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        imgEl.src = src
      })
    } else {
      imgEl.src = src
    }
  }


  function readScrollAndSetTarget() {
    const scrollY = window.scrollY || window.pageYOffset
    const raw = (scrollY - sectionTopRef.current) / sectionScrollableRef.current
    const progress = clamp(raw, 0, 1)
    scrollProgressRawRef.current = raw
    scrollProgressClampedRef.current = progress
    const nextTarget = progress * (activeSequenceRef.current.totalFrames - 1)
    const diff = nextTarget - previousTargetFrameRef.current
    if (Math.abs(diff) < MIN_TARGET_FRAME_DELTA) return
    targetFrameRef.current = nextTarget
    if (Math.abs(diff) > 0.001) directionRef.current = diff > 0 ? 1 : -1
    previousTargetFrameRef.current = targetFrameRef.current
  }

  function lockPageScroll() {
    if (typeof window === 'undefined') return
    if (scrollLockSnapshotRef.current) return
    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY || window.pageYOffset || 0
    scrollLockSnapshotRef.current = {
      scrollY,
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    // Do NOT set body position:fixed — causes Safari iOS scroll position loss
    // Touch-action is handled via the touchmove preventDefault in the useEffect
  }

  function unlockPageScroll() {
    if (typeof window === 'undefined') return
    const snapshot = scrollLockSnapshotRef.current
    if (!snapshot) return
    const html = document.documentElement
    const body = document.body
    html.style.overflow = snapshot.htmlOverflow
    html.style.overscrollBehavior = snapshot.htmlOverscrollBehavior
    // Restore body styles that may have been set previously
    // (body.style.position etc are left at their natural values since we
    // no longer set them in lockPageScroll)
    body.style.overflow = snapshot.bodyOverflow
    body.style.position = snapshot.bodyPosition
    body.style.top = snapshot.bodyTop
    body.style.left = snapshot.bodyLeft
    body.style.right = snapshot.bodyRight
    body.style.width = snapshot.bodyWidth
    scrollLockSnapshotRef.current = null
    // No scrollTo needed — body was never moved, so scroll position is preserved
  }

  function renderLoop(ts: number) {
    const prevTs = lastRafTimeRef.current ?? ts
    const dt = Math.max(0, ts - prevTs)
    lastRafTimeRef.current = ts
    fpsAccumMsRef.current += dt
    fpsFramesRef.current += 1
    if (dt > 50) longFrameCountRef.current += 1
    if (fpsAccumMsRef.current >= 1000) {
      avgFpsRef.current = (fpsFramesRef.current * 1000) / fpsAccumMsRef.current
      fpsAccumMsRef.current = 0
      fpsFramesRef.current = 0
    }

    readScrollAndSetTarget()
    if (!introDoneRef.current) {
      targetFrameRef.current = 0
      currentFrameRef.current = 0
      applyBestFrame(0, ts)
      updateCloudVisibility(0)
      rafRef.current = window.requestAnimationFrame(renderLoop)
      return
    }

    const diff = targetFrameRef.current - currentFrameRef.current
    const smoothingTauMs =
      activeSequenceRef.current.key === 'mobile'
        ? (motionModeRef.current === 'reduced'
          ? MOBILE_REDUCED_MOTION_SMOOTHING_TAU_MS
          : MOBILE_FULL_MOTION_SMOOTHING_TAU_MS)
        : (motionModeRef.current === 'reduced'
          ? REDUCED_MOTION_SMOOTHING_TAU_MS
          : FULL_MOTION_SMOOTHING_TAU_MS)

    const maxFrameStep = 
      activeSequenceRef.current.key === 'mobile' 
        ? MOBILE_MAX_FRAME_STEP_PER_TICK 
        : DESKTOP_MAX_FRAME_STEP_PER_TICK
    const alpha = 1 - Math.exp(-dt / smoothingTauMs)
    const proposed = currentFrameRef.current + diff * alpha

    if (diff > 0) {
      const limited = Math.min(proposed, currentFrameRef.current + maxFrameStep)
      currentFrameRef.current = Math.min(limited, targetFrameRef.current)
    } else if (diff < 0) {
      const limited = Math.max(proposed, currentFrameRef.current - maxFrameStep)
      currentFrameRef.current = Math.max(limited, targetFrameRef.current)
    }

    if (Math.abs(targetFrameRef.current - currentFrameRef.current) < 0.25) {
      currentFrameRef.current = targetFrameRef.current
    }

    applyBestFrame(currentFrameRef.current, ts)
    const preloadCenter = Math.round(currentFrameRef.current)
    preloadRange(preloadCenter)
    preloadSceneWarmup(preloadCenter)
    const sceneFrame = clamp(Math.round(currentFrameRef.current), 0, activeSequenceRef.current.totalFrames - 1)
    updateCloudVisibility(sceneFrame)
    updateCtaVisibility(sceneFrame)
    const nextSceneIndex = getSceneIndex(sceneFrame)
    if (nextSceneIndex !== sceneIndexRef.current) {
      sceneIndexRef.current = nextSceneIndex
      setSceneIndex(nextSceneIndex)
      updateSceneHeading(nextSceneIndex)
    }

    const isSettled = Math.abs(targetFrameRef.current - currentFrameRef.current) < 0.01
    if (!isSettled) {
      rafRef.current = window.requestAnimationFrame(renderLoop)
      return
    }
    rafRef.current = null
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const syncViewport = () => setIsMobileViewport(media.matches)
    syncViewport()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncViewport)
      return () => media.removeEventListener('change', syncViewport)
    }
    media.addListener(syncViewport)
    return () => media.removeListener(syncViewport)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)')
    const sync = () => setCoarsePointer(media.matches)
    sync()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync)
      return () => media.removeEventListener('change', sync)
    }
    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setDebugEnabled(params.get('debugMode') === 'true' || params.get('heroDebug') === '1')
  }, [])

  useEffect(() => {
    if (!debugEnabled) {
      if (debugIntervalRef.current !== null) window.clearInterval(debugIntervalRef.current)
      debugIntervalRef.current = null
      return
    }
    debugIntervalRef.current = window.setInterval(() => {
      setDebugTick((v) => v + 1)
    }, 250)
    return () => {
      if (debugIntervalRef.current !== null) window.clearInterval(debugIntervalRef.current)
      debugIntervalRef.current = null
    }
  }, [debugEnabled])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const deriveMotionMode = (prefers: boolean) => {
      const params = new URLSearchParams(window.location.search)
      const forceFull = params.get('heroForceMotion') === '1'
      const forceReduced = params.get('heroForceReducedMotion') === '1'
      let nextMode: MotionMode = prefers ? 'reduced' : 'full'
      if (forceFull) nextMode = 'full'
      else if (forceReduced) nextMode = 'reduced'
      return { nextMode, forceFull, forceReduced }
    }

    const applyMotionState = (prefers: boolean) => {
      const { nextMode, forceFull, forceReduced } = deriveMotionMode(prefers)
      setPrefersReducedMotion(prefers)
      setForceMotion(forceFull)
      setForceReducedMotion(forceReduced)
      motionModeRef.current = nextMode
      setMotionMode(nextMode)
    }

    const onMotionChange = (e: MediaQueryListEvent) => {
      applyMotionState(e.matches)
      updateSectionMetrics()
      if (rafRef.current === null) rafRef.current = window.requestAnimationFrame(renderLoop)
    }

    if (typeof media.addEventListener === 'function') media.addEventListener('change', onMotionChange)
    else media.addListener(onMotionChange as (this: MediaQueryList, ev: MediaQueryListEvent) => any)
    applyMotionState(media.matches)

    if (motionModeRef.current === 'reduced') {
      introDoneRef.current = true
      setIntroDone(true)
    } else {
      // Start intro timer immediately so it runs during 
      // overlay loading — not after it
      // Use a shorter duration since overlay already 
      // gives visual context
      introTimerRef.current = window.setTimeout(() => {
        introDoneRef.current = true
        setIntroDone(true)
      }, Math.min(INTRO_DURATION_MS, 1500))
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (backgroundPreloadRafRef.current !== null) {
      window.cancelAnimationFrame(backgroundPreloadRafRef.current)
      backgroundPreloadRafRef.current = null
    }

    updateSectionMetrics()
    const scrollY = window.scrollY || window.pageYOffset
    const raw = (scrollY - sectionTopRef.current) / sectionScrollableRef.current
    const progress = clamp(raw, 0, 1)
    const frameCount = activeSequence.totalFrames
    const startFrame = clamp(
      Math.round(progress * (frameCount - 1)), 
      0, frameCount - 1
    )
    
    sceneIndexRef.current = getSceneIndex(startFrame)
    setSceneIndex(sceneIndexRef.current)
    targetFrameRef.current = startFrame
    currentFrameRef.current = startFrame
    previousTargetFrameRef.current = startFrame

    loadedRef.current.clear()
    loadingRef.current.clear()
    preloadCompleteRef.current = false
    setPreloadComplete(false)
    setPreloadProgress(0)

    const initialPreloadCount = 
      activeSequence.key === 'mobile' 
        ? MOBILE_INITIAL_PRELOAD_COUNT 
        : INITIAL_PRELOAD_COUNT
    for (let i = 0; i < Math.min(frameCount, initialPreloadCount); i++) {
      preloadFrame(i)
    }

    preloadRemainingInBackground()
    shownFrameRef.current = startFrame
    lastVisibleSwapTsRef.current = performance.now()

    const frameZero = activeSequence.frames[0]
    if (imgRef.current && frameZero) {
      imgRef.current.src = frameZero
    }

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

    rafRef.current = window.requestAnimationFrame(renderLoop)

    return () => {
      if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current)
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onMotionChange)
      else media.removeListener(onMotionChange as (this: MediaQueryList, ev: MediaQueryListEvent) => any)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      if (scrollTickRef.current !== null) window.cancelAnimationFrame(scrollTickRef.current)
      if (backgroundPreloadRafRef.current !== null) window.cancelAnimationFrame(backgroundPreloadRafRef.current)
    }
  }, [isMobileViewport, motionMode, activeSequence])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const shouldLock = motionMode !== 'reduced' && !introDone
    if (!shouldLock) {
      unlockPageScroll()
      return
    }

    lockPageScroll()
    const blockedKeys = new Set([
      ' ',
      'PageUp',
      'PageDown',
      'End',
      'Home',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ])

    const preventScrollInput = (e: Event) => e.preventDefault()
    const onKeyDown = (e: KeyboardEvent) => {
      if (blockedKeys.has(e.key)) e.preventDefault()
    }

    window.addEventListener('wheel', preventScrollInput, { passive: false })
    window.addEventListener('touchmove', preventScrollInput, { passive: false })
    window.addEventListener('keydown', onKeyDown, { passive: false })

    return () => {
      window.removeEventListener('wheel', preventScrollInput)
      window.removeEventListener('touchmove', preventScrollInput)
      window.removeEventListener('keydown', onKeyDown)
      unlockPageScroll()
    }
  }, [introDone, motionMode])

  useEffect(() => {
    const onScrollKick = () => {
      if (rafRef.current === null) rafRef.current = window.requestAnimationFrame(renderLoop)
    }
    window.addEventListener('scroll', onScrollKick, { passive: true })
    return () => window.removeEventListener('scroll', onScrollKick)
  }, [])

  return (
    <section ref={sectionRef} className="relative bg-deep-ink" style={{ height: `${SCROLL_HEIGHT_VH}dvh` }} data-motion-mode={motionMode}>
      <div className="sticky top-0 overflow-hidden min-h-[100svh] min-h-[100dvh] bg-deep-ink">
                <img
          ref={imgRef}
          src=""
          alt="Aircraft flying through Sydney twilight"
          className={`absolute inset-0 h-full w-full object-cover ${
            isMobileViewport ? 'object-[50%_38%]' : 'object-center'
          }`}
          loading="eager"
          decoding="async"
        />
        <img
          ref={imgBufferRef}
          src=""
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          style={{ opacity: 0, visibility: 'hidden' }}
          decoding="async"
        />



        <div className="absolute inset-0 bg-gradient-to-b from-[#091421]/35 via-[#091421]/25 to-[#091421]/70 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(2,10,30,0.22)', mixBlendMode: 'multiply' }} />
        <HeroCloudLayers
          innerRef={cloudWrapRef}
          className={isMobileViewport ? '-translate-y-[4%]' : ''}
          cloudDriftEnabled={cloudDriftEnabled}
          liteEffects={liteCloudFx}
        />

        {decorativeTextWaveEnabled && (
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
          <div className={`pt-[16vh] text-center transition-opacity duration-500 ${introDone || motionMode === 'reduced' ? 'opacity-100' : 'opacity-0'}`}>
            {sceneHeadings[0]?.line2 ? (
              <div
                ref={sceneHeadingRef}
                className={`hero-scene-heading-enter ${motionMode === 'reduced' ? 'hero-scene-heading-enter-reduced' : ''}`}
              >
              <h1 className="font-serif text-4xl font-normal leading-[1.04] tracking-[0.015em] text-[#e8f1ff] md:text-7xl [text-shadow:0_3px_14px_rgba(8,20,40,0.24)]">
                <span className="block" data-line="1">{sceneHeadings[0]?.line1}</span>
                <span className="relative block italic text-[#c7dcff] pb-3" data-line="2">
                  {sceneHeadings[0]?.line2}
                  <svg
                    viewBox="0 0 340 20"
                    fill="none"
                    aria-hidden="true"
                    className={`absolute left-1/2 -translate-x-1/2 bottom-[-2px] w-[90%] md:w-[85%] h-[14px] md:h-[18px] ${underlineWaveEnabled ? 'hero-scene-underline-drift' : ''}`}
                  >
                    <path d="M 6 13 C 45 5, 90 18, 145 10 C 200 3, 255 16, 310 10 C 322 8, 330 9, 334 11" stroke="rgba(167,200,255,0.58)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </h1>
              </div>
            ) : null}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 bottom-[12svh] z-20 w-[min(92vw,48rem)] text-center">
            <div
              ref={ctaWrapRef}
              className={`pointer-events-auto transition-opacity duration-500 ${sceneHeadings[sceneIndex]?.showCta ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <p className="mb-5 font-sans text-sm font-light leading-relaxed text-oz-muted md:mb-7 md:text-lg">
                A modern platform for pilots — rent, fly, enjoy
              </p>
              <a
                href="/pilotRequirements"
                className="inline-block whitespace-nowrap rounded-md bg-gradient-to-r from-clearsky to-panel-deep text-ink-deep font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-clearsky/20 transition-all active:scale-95 hover:brightness-110"
              >
                SCHEDULE YOUR CHECKOUT FLIGHT
              </a>
            </div>
          </div>
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-20 pointer-events-none"
            style={{
              opacity: preloadComplete ? 1 : 0,
              transition: 'opacity 0.5s ease-out 0.3s',
            }}
          >
            <span
              className="text-white/50 uppercase tracking-widest"
              style={{ fontSize: '10px' }}
            >
              SCROLL
            </span>
            <span
              className="material-symbols-outlined text-white/50 animate-bounce"
              style={{ fontSize: '20px' }}
            >
              keyboard_arrow_down
            </span>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#091421] via-[#0b111a]/30 to-transparent" />

        {debugEnabled && (
          <div
            className="fixed left-3 z-[9999] max-w-[calc(100vw-24px)] overflow-hidden rounded border border-white/20 bg-[rgba(2,8,23,0.88)] p-2 text-[10px] leading-tight text-white pointer-events-none sm:text-[11px]"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
            }}
          >
            <div>Sequence: {isMobileViewport ? 'Mobile' : 'Desktop'}</div>
            <div>Reduced Motion: {reducedMotionStatusOn ? 'On' : 'Off'}</div>
            <div>Cloud Fade: {cloudFadeEnabled ? 'On' : 'Off'}</div>
            <div>CTA Fade: {ctaFadeEnabled ? 'On' : 'Off'}</div>
            <div>Text Wave: {decorativeTextWaveEnabled ? 'On' : 'Off'}</div>
            <div>Cloud Drift: {cloudDriftEnabled ? 'On' : 'Off'}</div>
            <div>FPS: {avgFpsRef.current.toFixed(0)}</div>
            <div>Scene: {sceneIndex + 1}</div>
            <div>Device: {browserLabel}</div>
            <div>Frame: {Math.round(currentFrameRef.current) + 1}/{activeSequenceRef.current.totalFrames}</div>
            <div className="hidden">{debugTick}</div>
          </div>
        )}

        {/* Full overlay loader — covers hero while frames preload */}
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center transition-opacity duration-700 ease-out"
          style={{
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            backgroundColor: 'rgba(10, 20, 50, 0.75)',
            opacity: preloadComplete ? 0 : 1,
            pointerEvents: preloadComplete ? 'none' : 'auto',
          }}
          aria-hidden="true"
        >
          {/* Logo */}
          <img
            src="/Logo/ozrentaplane-transparent-bg.png"
            alt=""
            style={{ height: '140px', width: 'auto', marginBottom: '48px' }}
          />

          {/* Progress bar track */}
          <div
            style={{
              width: '280px',
              height: '2px',
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${preloadProgress}%`,
                backgroundColor: '#f59e0b',
                borderRadius: '999px',
                transition: 'width 0.2s ease-out',
              }}
            />
          </div>

          {/* Loading text */}
          <span
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: '12px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-manrope, sans-serif)',
            }}
          >
            Loading {preloadProgress}%
          </span>
        </div>

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
          .hero-scene-heading-enter-reduced {
            animation: hero-scene-heading-in 140ms linear forwards;
          }
          .hero-scene-underline-drift {
            animation: hero-scene-underline-wave 3.4s ease-in-out infinite;
          }
          section[data-motion-mode='reduced'] .hero-wind-fly,
          section[data-motion-mode='reduced'] .hero-wind-your,
          section[data-motion-mode='reduced'] .hero-wind-way,
          section[data-motion-mode='reduced'] .hero-underline-drift {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          section[data-motion-mode='reduced'] .hero-scene-underline-drift {
            animation: none !important;
          }
          section[data-motion-mode='reduced'] .hero-scene-heading-enter {
            filter: none !important;
          }
        `}</style>
      </div>
    </section>
  )
}
