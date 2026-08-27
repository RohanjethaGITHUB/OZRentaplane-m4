import type { JobDefinition, JobContext } from '../types'
import { runUpcomingFlightRemindersSweep } from './upcoming-flight-reminders'

export const dayBeforeFlightsJob: JobDefinition = {
  id: 'day-before-flights',
  description: 'Enqueues 48-hour and 12-hour reminder emails for upcoming Checkout and Rental flights',
  async run(ctx: JobContext) {
    const { admin, now } = ctx
    console.info(`[job:day-before-flights] Running upcoming flight reminders sweep at ${now.toISOString()}`)

    const stats = await runUpcomingFlightRemindersSweep(admin, now)

    console.info('[job:day-before-flights] Sweep complete:', JSON.stringify(stats))

    return {
      ok: true,
      stats,
    }
  },
}
