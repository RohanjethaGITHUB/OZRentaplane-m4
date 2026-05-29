'use client'

import { useEffect, useRef } from 'react'

interface Cloud {
  x: number
  y: number
  width: number
  height: number
  opacity: number
  speedX: number
  speedY: number
  blur: number
}

export function CloudBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cloudsRef = useRef<Cloud[]>([])
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    cloudsRef.current = Array.from({ length: 6 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      width: 300 + Math.random() * 250,
      height: 120 + Math.random() * 100,
      opacity: 0.04 + Math.random() * 0.04,
      speedX: (0.08 + Math.random() * 0.12) * (Math.random() > 0.5 ? 1 : -1),
      speedY: (0.03 + Math.random() * 0.05) * (Math.random() > 0.5 ? 1 : -1),
      blur: 40 + Math.random() * 30,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      cloudsRef.current.forEach((cloud) => {
        cloud.x += cloud.speedX
        cloud.y += cloud.speedY

        if (cloud.x > canvas.width + cloud.width) cloud.x = -cloud.width
        if (cloud.x < -cloud.width) cloud.x = canvas.width + cloud.width
        if (cloud.y > canvas.height + cloud.height) cloud.y = -cloud.height
        if (cloud.y < -cloud.height) cloud.y = canvas.height + cloud.height

        ctx.save()
        ctx.filter = `blur(${cloud.blur}px)`
        const grad = ctx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.width / 2)
        grad.addColorStop(0, `rgba(255, 255, 255, ${cloud.opacity})`)
        grad.addColorStop(0.4, `rgba(220, 232, 248, ${cloud.opacity * 0.6})`)
        grad.addColorStop(1, 'rgba(220, 232, 248, 0)')

        ctx.beginPath()
        ctx.ellipse(cloud.x, cloud.y, cloud.width / 2, cloud.height / 2, 0, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.restore()
      })

      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
