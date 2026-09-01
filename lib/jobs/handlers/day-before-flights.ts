import type { JobDefinition, JobContext } from '../types'
import { runUpcomingFlightRemindersSweep } from './upcoming-flight-reminders'
import { emailOutboxJob } from './email-outbox'

export const dayBeforeFlightsJob: JobDefinition = {
  id: 'day-before-flights',
  description: 'Enqueues 48-hour and 12-hour reminder emails for upcoming Checkout and Rental flights and drains outbox',
  async run(ctx: JobContext) {
    const { admin, now } = ctx
    console.info(`[job:day-before-flights] Running upcoming flight reminders sweep at ${now.toISOString()}`)

    const stats: any = await runUpcomingFlightRemindersSweep(admin, now)

    // Drain the newly generated reminder emails and any pending outbox items immediately
    try {
      const outboxDrainResult = await emailOutboxJob.run(ctx)
      stats.emailOutboxDrain = outboxDrainResult
    } catch (err: any) {
      console.error('[job:day-before-flights] Outbox drain failed:', err)
      stats.emailOutboxDrain = { ok: false, error: err?.message || String(err) }
    }

    console.info('[job:day-before-flights] Sweep complete:', JSON.stringify(stats))

    return {
      ok: true,
      stats,
    }
  },
}
