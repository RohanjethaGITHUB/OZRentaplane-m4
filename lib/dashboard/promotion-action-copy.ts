import type { DashboardActionState } from '@/lib/dashboard/dashboard-action-state'

/**
 * Black Friday (block time promotion) wording for the customer dashboard.
 *
 * The journey logic in dashboard-action-state.ts stays the single source of truth
 * for *what* the pilot must do next. This only re-words the hero and the
 * "Your next step" card when the pilot bought a promo package, so they can see
 * their free checkout and bonus hours at every step.
 */
export type DashboardPromoContext = {
  /** Package bought under the promotion (most recent active/pending one). */
  packageName: string
  paidHours: number
  bonusHours: number
  /** An unused free checkout credit exists for this pilot. */
  hasFreeCheckoutCredit: boolean
}

function hoursLabel(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function totalLine(ctx: DashboardPromoContext): string {
  const total = ctx.paidHours + ctx.bonusHours
  return ctx.bonusHours > 0
    ? `${hoursLabel(total)} hours (${hoursLabel(ctx.paidHours)} + ${hoursLabel(ctx.bonusHours)} bonus)`
    : `${hoursLabel(total)} hours`
}

const CHECKOUT_IN_PROGRESS = new Set([
  'checkout_requested',
  'checkout_reschedule_requested',
  'checkout_time_proposed',
  'checkout_confirmed',
  'checkout_reschedule_required',
  'checkout_outcome_under_review',
])

export function applyPromotionDashboardCopy(
  state: DashboardActionState,
  ctx: DashboardPromoContext | null,
): DashboardActionState {
  if (!ctx) return state
  const badge = 'Black Friday package'
  const hours = totalLine(ctx)

  // New pilot: bought before checkout, free checkout not booked yet.
  if (state.statusKey === 'checkout_required' && ctx.hasFreeCheckoutCredit) {
    return {
      ...state,
      promoBadge: badge,
      heroLabel: 'Free Checkout Included',
      heroMessage: `Your ${ctx.packageName} is secured with ${hours}. Book your free checkout flight to start using them.`,
      actionHeading: 'Book your free checkout flight',
      actionDescription:
        'Your Black Friday package includes a free checkout flight — there is nothing to pay for it. Choose a time, then complete your documents, terms and flight details in the same request.',
      primaryAction: state.primaryAction ? { ...state.primaryAction, label: 'Book Free Checkout' } : state.primaryAction,
      nextMilestone: `Once the instructor clears you to fly, your ${hours} are ready for normal aircraft bookings.`,
    }
  }

  // Checkout booked / flown — keep the step, remind them it is free.
  if (CHECKOUT_IN_PROGRESS.has(state.statusKey) && ctx.hasFreeCheckoutCredit) {
    return {
      ...state,
      promoBadge: badge,
      actionDescription: `${state.actionDescription} This checkout is free with your Black Friday package.`,
      nextMilestone: `${state.nextMilestone ? `${state.nextMilestone} ` : ''}After you are cleared, your ${hours} are ready to use.`,
    }
  }

  // Cleared pilot with a promo package.
  if (state.statusKey === 'cleared_ready_to_book') {
    return {
      ...state,
      promoBadge: badge,
      heroMessage: `You are cleared to fly. Your ${ctx.packageName} has ${hours} ready to book.`,
      actionDescription: `Your Black Friday package is active with ${hours}. Book an aircraft and the hours are drawn from your package.`,
    }
  }

  // Any other step: just show the badge so the purchase is visible.
  return { ...state, promoBadge: badge }
}
