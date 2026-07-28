import { randomUUID } from 'crypto'

export const PERF_LOG_ENABLED = process.env.PERF_LOG === '1'

type UserRole = 'admin' | 'customer' | 'unknown'

type PerfBase = {
  route: string
  role?: UserRole
  operationId?: string
}

type PerfMeta = {
  rowCount?: number | null
}

type PerfStatus = 'success' | 'failure'

type PerfLogEntry = {
  type: 'perf_timing'
  timestamp: string
  operationId: string
  route: string
  role: UserRole
  operationName: string
  phase: string
  durationMs: number
  status: PerfStatus
  rowCount?: number | null
  errorCategory?: string
}

function operationId() {
  return randomUUID()
}

function durationMs(start: number) {
  return Math.round((performance.now() - start) * 100) / 100
}

function errorCategory(error: unknown) {
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; name?: unknown; message?: unknown }
    if (typeof value.code === 'string' && value.code) return value.code
    if (typeof value.name === 'string' && value.name) return value.name
    if (typeof value.message === 'string' && value.message) {
      const [prefix] = value.message.split(':')
      return prefix ? prefix.slice(0, 80) : 'Error'
    }
  }
  return 'unknown'
}

function emit(entry: PerfLogEntry) {
  console.log(JSON.stringify(entry))
}

export function rowCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') {
    const count = (value as { count?: unknown }).count
    const data = (value as { data?: unknown }).data
    if (typeof count === 'number') return count
    if (Array.isArray(data)) return data.length
    if (data) return 1
  }
  return null
}

export function createPerfLogger(base: PerfBase) {
  const id = PERF_LOG_ENABLED ? base.operationId ?? operationId() : base.operationId ?? 'disabled'
  const role = base.role ?? 'unknown'

  function log(
    operationName: string,
    phase: string,
    duration: number,
    status: PerfStatus,
    meta?: PerfMeta,
    error?: unknown,
  ) {
    if (!PERF_LOG_ENABLED) return
    const entry: PerfLogEntry = {
      type: 'perf_timing',
      timestamp: new Date().toISOString(),
      operationId: id,
      route: base.route,
      role,
      operationName,
      phase,
      durationMs: duration,
      status,
    }
    if (typeof meta?.rowCount === 'number' || meta?.rowCount === null) entry.rowCount = meta.rowCount
    if (status === 'failure') entry.errorCategory = errorCategory(error)
    emit(entry)
  }

  return {
    id,
    start(operationName: string, phase: string) {
      const start = PERF_LOG_ENABLED ? performance.now() : 0
      return (meta?: PerfMeta) => {
        if (!PERF_LOG_ENABLED) return
        log(operationName, phase, durationMs(start), 'success', meta)
      }
    },
    async time<T>(
      operationName: string,
      phase: string,
      fn: () => PromiseLike<T>,
      meta?: PerfMeta | ((result: T) => PerfMeta),
    ): Promise<T> {
      if (!PERF_LOG_ENABLED) return fn()
      const start = performance.now()
      try {
        const result = await fn()
        const resolvedMeta = typeof meta === 'function' ? meta(result) : meta
        log(operationName, phase, durationMs(start), 'success', resolvedMeta)
        return result
      } catch (error) {
        log(operationName, phase, durationMs(start), 'failure', undefined, error)
        throw error
      }
    },
    timeSync<T>(
      operationName: string,
      phase: string,
      fn: () => T,
      meta?: PerfMeta | ((result: T) => PerfMeta),
    ): T {
      if (!PERF_LOG_ENABLED) return fn()
      const start = performance.now()
      try {
        const result = fn()
        const resolvedMeta = typeof meta === 'function' ? meta(result) : meta
        log(operationName, phase, durationMs(start), 'success', resolvedMeta)
        return result
      } catch (error) {
        log(operationName, phase, durationMs(start), 'failure', undefined, error)
        throw error
      }
    },
  }
}
