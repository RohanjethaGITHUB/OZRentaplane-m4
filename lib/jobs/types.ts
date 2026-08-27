import type { SupabaseClient } from '@supabase/supabase-js'
import type { createPerfLogger } from '@/lib/perf/timing'

export type JobContext = {
  admin: SupabaseClient
  now: Date
  perf: ReturnType<typeof createPerfLogger>
  params: Record<string, string>
}

export type JobResult = {
  ok: boolean
  stats?: Record<string, unknown>
  error?: string
}

export type JobDefinition = {
  id: string
  description: string
  run: (ctx: JobContext) => Promise<JobResult>
}

export type JobRunSummary = {
  ok: boolean
  job: string
  durationMs: number
  stats?: Record<string, unknown>
  error?: string
}
