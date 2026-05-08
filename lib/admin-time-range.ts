import type { TimeRangeValue } from '@/app/admin/components/AdminUi'

export function getRangeStartIso(range: TimeRangeValue): string | null {
  const now = new Date()
  if (range === 'today') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (range === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (range === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  if (range === '6m') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 6)
    return d.toISOString()
  }
  return null
}
