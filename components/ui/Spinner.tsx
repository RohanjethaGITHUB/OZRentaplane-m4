import type { ReactNode } from 'react'

type SpinnerSize = 'sm' | 'md' | 'lg'
type SpinnerVariant = 'icon' | 'ring'

type SpinnerProps = {
  size?: SpinnerSize
  className?: string
  variant?: SpinnerVariant
}

const ICON_SIZE: Record<SpinnerSize, string> = {
  sm: 'text-[14px]',
  md: 'text-base',
  lg: 'text-2xl',
}

const RING_SIZE: Record<SpinnerSize, string> = {
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-4 w-4 border-2',
  lg: 'h-6 w-6 border-[3px]',
}

/** Shared loading spinner — Material Symbol icon (default) or CSS ring for dark buttons. */
export default function Spinner({
  size = 'md',
  className = '',
  variant = 'icon',
}: SpinnerProps) {
  if (variant === 'ring') {
    return (
      <span
        aria-hidden
        className={`inline-block shrink-0 animate-spin rounded-full border-white/20 border-t-white ${RING_SIZE[size]} ${className}`}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`material-symbols-outlined animate-spin shrink-0 ${ICON_SIZE[size]} ${className}`}
    >
      progress_activity
    </span>
  )
}

/** Button interior helper: spinner + label while loading, otherwise children. */
export function LoadingButtonContent({
  loading,
  loadingLabel,
  children,
  spinnerVariant = 'icon',
  spinnerSize = 'sm',
  spinnerClassName = '',
}: {
  loading: boolean
  loadingLabel?: ReactNode
  children: ReactNode
  spinnerVariant?: SpinnerVariant
  spinnerSize?: SpinnerSize
  spinnerClassName?: string
}) {
  if (!loading) return <>{children}</>

  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Spinner size={spinnerSize} variant={spinnerVariant} className={spinnerClassName} />
      {loadingLabel ?? children}
    </span>
  )
}
