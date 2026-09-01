import { getJob } from './registry'
import type { JobRunSummary } from './types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPerfLogger } from '@/lib/perf/timing'

/**
 * Executes a registered job by ID with timing, isolated error handling, and structured metrics.
 */
export async function runJob(
  jobId: string,
  params: Record<string, string> = {},
): Promise<JobRunSummary> {
  const startTime = Date.now()
  const job = getJob(jobId)

  if (!job) {
    console.warn(`[cron-runner] Job '${jobId}' not found in registry`)
    return {
      ok: false,
      job: jobId,
      durationMs: 0,
      error: 'job_not_found',
    }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database admin client initialization failed'
    console.error(`[cron-runner] Failed to initialize admin client for job '${jobId}':`, message)
    return {
      ok: false,
      job: jobId,
      durationMs: Date.now() - startTime,
      error: 'admin_client_initialization_failed',
    }
  }

  const perf = createPerfLogger({ route: `cron:${jobId}`, role: 'unknown' })

  try {
    const result = await job.run({
      admin,
      now: new Date(),
      perf,
      params,
    })

    const durationMs = Date.now() - startTime
    console.info(`[cron-runner] Job '${jobId}' finished in ${durationMs}ms with ok=${result.ok}`)

    return {
      ok: result.ok,
      job: jobId,
      durationMs,
      stats: result.stats,
      error: result.error,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'Unknown execution error'
    console.error(`[cron-runner] Job '${jobId}' failed with uncaught exception after ${durationMs}ms:`, message)

    return {
      ok: false,
      job: jobId,
      durationMs,
      error: message,
    }
  }
}
