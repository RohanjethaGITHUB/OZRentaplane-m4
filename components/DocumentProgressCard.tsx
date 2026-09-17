'use client'

export type DocumentProgressStepStatus = 'not_started' | 'in_progress' | 'complete'

type StepLabel = { label: string; num: number }

type DocumentProgressCardProps = {
  heading: string
  subheading: string
  className?: string
  stepLabels?: StepLabel[]
} & (
  | {
      variant?: 'wizard'
      statuses: DocumentProgressStepStatus[]
    }
  | {
      variant: 'compact'
      percent: number
    }
)

const DEFAULT_STEP_LABELS: StepLabel[] = [
  { label: 'Documents', num: 1 },
  { label: 'Flight & Red Card', num: 2 },
  { label: 'Night VFR', num: 3 },
  { label: 'Terms', num: 4 },
  { label: 'Phone', num: 5 },
]

function stepClasses(status: DocumentProgressStepStatus) {
  if (status === 'complete') {
    return {
      pill: 'bg-green-500/20 text-green-300',
      circle: 'bg-green-500/40 text-green-200',
      connector: 'bg-green-500/30',
    }
  }
  if (status === 'in_progress') {
    return {
      pill: 'bg-[#f59e0b]/20 text-[#f59e0b] ring-1 ring-[#f59e0b]/40',
      circle: 'bg-[#f59e0b]/30 text-[#f59e0b]',
      connector: 'bg-white/15',
    }
  }
  return {
    pill: 'text-white/40',
    circle: 'bg-white/10 text-white/40',
    connector: 'bg-white/15',
  }
}

function CompactProgressRing({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent))

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="3"
          strokeDasharray={`${pct} ${100 - pct}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[16px] font-bold leading-none text-white">{pct}%</span>
        <span className="mt-0.5 text-[11px] text-white/50">Complete</span>
      </div>
    </div>
  )
}

export default function DocumentProgressCard(props: DocumentProgressCardProps) {
  const { heading, subheading, className } = props
  if (props.variant === 'compact') {
    return (
      <div className={`rounded-2xl bg-[#152d5a] px-4 py-4 sm:px-6 sm:py-5 ${className ?? ''}`}>
        <div className="flex items-center gap-3.5 sm:gap-5">
          <CompactProgressRing percent={props.percent} />
          <div>
            <p className="text-[14px] sm:text-[16px] font-semibold leading-snug text-white">{heading}</p>
            <p className="mt-1 text-[12px] sm:text-[13px] text-white/60">{subheading}</p>
          </div>
        </div>
      </div>
    )
  }

  const percent = Math.round(
    (props.statuses.filter((status) => status === 'complete').length / props.statuses.length) * 100,
  )

  return (
    <div className={`rounded-2xl bg-[#152d5a] px-3.5 py-4 sm:px-6 sm:py-5 ${className ?? ''}`}>
      <div className="mb-4 flex items-center gap-3.5 sm:gap-5">
        <CompactProgressRing percent={percent} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] sm:text-[16px] font-semibold leading-snug text-white">{heading}</p>
          <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-[13px] text-white/60 leading-relaxed">{subheading}</p>
        </div>
      </div>

      <div className="flex items-center gap-0 w-full overflow-hidden">
        {(props.stepLabels ?? DEFAULT_STEP_LABELS).map((step, index, arr) => {
          const status = props.statuses[index] ?? 'not_started'
          const classes = stepClasses(status)
          const isComplete = status === 'complete'

          return (
            <div key={step.num} className="flex min-w-0 flex-1 items-center">
              <div
                className={`flex flex-shrink-0 items-center gap-1 sm:gap-2 rounded-full px-1.5 sm:px-3 py-1.5 sm:py-2 text-[11px] font-semibold transition-all ${
                  classes.pill
                }`}
              >
                <div
                  className={`flex h-5 w-5 sm:h-5 sm:w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${classes.circle}`}
                >
                  {isComplete ? (
                    <span
                      className="material-symbols-outlined text-[11px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check
                    </span>
                  ) : (
                    step.num
                  )}
                </div>
                <span className="hidden truncate md:inline">{step.label}</span>
              </div>
              {index < arr.length - 1 && (
                <div className={`mx-0.5 sm:mx-1 h-px flex-1 min-w-[6px] ${classes.connector}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

