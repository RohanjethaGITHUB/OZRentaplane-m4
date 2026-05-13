'use client'

import React from 'react'
import { motion } from 'framer-motion'

// Unified physics for a premium, cinematic feel
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1] // Custom ease matching premium Apple/editorial styles

type WrapperProps = {
  children: React.ReactNode
  className?: string
  delay?: number
  duration?: number
  viewportMargin?: string
  staggerDelay?: number
  hoverY?: number
  hoverScale?: number
}

/**
 * FadeUp:
 * A standardized, slow fading block that triggers slightly upward when it enters the viewport.
 * Suitable for standalone elements, large images, or distinct section blocks.
 */
export function FadeUp({ children, className = '', delay = 0, duration = 0.85, viewportMargin = '-24px' }: WrapperProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: viewportMargin as any }}
      transition={{ 
        duration, 
        ease: EASE_OUT,
        delay,
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * StaggerContainer:
 * Implements a cascading reveal for its direct StaggerItem children.
 * E.g., Headers, text columns, or a sequence of cards.
 */
export function StaggerContainer({ children, className = '', staggerDelay = 0.14, viewportMargin = '-24px' }: WrapperProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: viewportMargin as any }}
      variants={{
        visible: {
          transition: {
            staggerChildren: staggerDelay, // Subtle delay between children reveals
          },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * StaggerItem:
 * Inherits the "hidden" and "visible" state cues from StaggerContainer.
 */
export function StaggerItem({ children, className = '', duration = 0.75 }: WrapperProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { 
          opacity: 1, 
          y: 0, 
          transition: { 
            duration, 
            ease: EASE_OUT 
          } 
        },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * HoverEmphasize:
 * A premium wrapper that softly lifts and scales upon hover, with a refined shadow ease.
 */
export function HoverEmphasize({ children, className = '', hoverY = -4, hoverScale = 1.01, duration = 0.5 }: WrapperProps) {
  return (
    <motion.div
      className={className}
      whileHover={{ 
        y: hoverY,
        scale: hoverScale,
        transition: { duration, ease: EASE_OUT }
      }}
      whileTap={{ scale: 0.99 }}
    >
      {children}
    </motion.div>
  )
}
