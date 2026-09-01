import type { JobDefinition } from './types'
import { emailOutboxJob } from './handlers/email-outbox'
import { dayBeforeFlightsJob } from './handlers/day-before-flights'
import { dailyMaintenanceJob } from './handlers/daily-maintenance'
import { adminWeeklyDigestJob } from './handlers/admin-weekly-digest'

const registeredJobs = new Map<string, JobDefinition>()

/**
 * Register built-in cron jobs into the registry.
 */
export function registerJob(job: JobDefinition) {
  registeredJobs.set(job.id, job)
}

export function getJob(id: string): JobDefinition | undefined {
  return registeredJobs.get(id)
}

export function listJobs(): JobDefinition[] {
  return Array.from(registeredJobs.values())
}

// Register core system jobs
registerJob(emailOutboxJob)
registerJob(dayBeforeFlightsJob)
registerJob(dailyMaintenanceJob)
registerJob(adminWeeklyDigestJob)

