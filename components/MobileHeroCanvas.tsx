'use client'

import { useEffect, useRef, useCallback } from 'react'

const TOTAL_FRAMES = 160
const BATCH_SIZE = 8
const BATCH_INTERVAL_MS = 60

// Frame URL builder — matches exact naming pattern of MobileHomeHeroJPEG
function getFrameUrl(index: number): string {
  // index is 0-based (0–159)
  // Files: MS1_000001.jpg (frames 0–49, scene 1, 50 frames)
  //        MS2_000001.jpg (frames 50–89, scene 2, 40 frames)
  //        MS3_000001.jpg (frames 90–159, scene 3, 70 frames)
  let scene: string
  let frameNum: number
  if (index < 50) {
    scene = 'MS1'
    frameNum = index + 1
  } else if (index < 90) {
    scene = 'MS2'
    frameNum = index - 50 + 1
  } else {
    scene = 'MS3'
    frameNum = index - 90 + 1
  }
  const padded = String(frameNum).padStart(6, '0')
  return `/MobileHomeHeroJPEG/${scene}_${padded}.jpg`
}

interface Props {
  onFrameCallback: (register: (frame: number) => void) => void
  onReady: () => void    // called when first batch is loaded and ready to paint
  onError: () => void    // called if loading fails entirely
}

export default function MobileHeroCanvas({ onFrameCallback, onReady, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imagesRef = useRef<(HTMLImageElement | null)[]>(
    Array(TOTAL_FRAMES).fill(null)
  )
  const loadedCountRef = useRef(0)
  const isReadyRef = useRef(false)
  const onReadyCalledRef = useRef(false)
  const lastPaintedFrameRef = useRef(-1)
  const rafRef = useRef<number | null>(null)

  // Paint a specific frame to the canvas
  const paintFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = imagesRef.current[frameIndex]
    if (!img || !img.complete || img.naturalWidth === 0) return
    if (lastPaintedFrameRef.current === frameIndex) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Cover crop: center the image to fill canvas
    const cw = canvas.width
    const ch = canvas.height
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const scale = Math.max(cw / iw, ch / ih)
    const sw = iw * scale
    const sh = ih * scale
    const sx = (cw - sw) / 2
    const sy = (ch - sh) / 2

    ctx.drawImage(img, sx, sy, sw, sh)
    lastPaintedFrameRef.current = frameIndex
  }, [])

  // Preload all frames in staggered batches
  useEffect(() => {
    let cancelled = false
    let batchTimer: ReturnType<typeof setTimeout> | null = null

    const loadBatch = (startIndex: number) => {
      if (cancelled) return
      const end = Math.min(startIndex + BATCH_SIZE, TOTAL_FRAMES)

      for (let i = startIndex; i < end; i++) {
        if (imagesRef.current[i]) continue
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => {
          if (cancelled) return
          loadedCountRef.current += 1

          // Paint frame 0 as soon as it's ready
          if (i === 0 && !onReadyCalledRef.current) {
            paintFrame(0)
            isReadyRef.current = true
            onReadyCalledRef.current = true
            onReady()
          }
        }
        img.onerror = () => {
          if (cancelled) return
          loadedCountRef.current += 1
          if (loadedCountRef.current >= TOTAL_FRAMES && !onReadyCalledRef.current) {
            onError()
          }
        }
        img.src = getFrameUrl(i)
        imagesRef.current[i] = img
      }

      if (end < TOTAL_FRAMES) {
        batchTimer = setTimeout(() => loadBatch(end), BATCH_INTERVAL_MS)
      }
    }

    loadBatch(0)

    // Fallback: force ready after 8 seconds regardless
    const fallback = setTimeout(() => {
      if (!onReadyCalledRef.current) {
        onReadyCalledRef.current = true
        isReadyRef.current = true
        onReady()
      }
    }, 8000)

    return () => {
      cancelled = true
      if (batchTimer) clearTimeout(batchTimer)
      clearTimeout(fallback)
    }
  }, [onReady, onError, paintFrame])

  // Register paint callback with parent so renderLoop drives us directly
  useEffect(() => {
    onFrameCallback((frame: number) => {
      if (!isReadyRef.current) return
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        paintFrame(frame)
      })
    })
    return () => {
      onFrameCallback(() => {})
    }
  }, [onFrameCallback, paintFrame])

  // Size canvas to device pixel ratio for sharp rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
      // Repaint after resize
      const lastFrame = lastPaintedFrameRef.current
      lastPaintedFrameRef.current = -1
      paintFrame(lastFrame >= 0 ? lastFrame : 0)
    }
    setSize()
    window.addEventListener('resize', setSize)
    return () => window.removeEventListener('resize', setSize)
  }, [paintFrame])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  )
}
