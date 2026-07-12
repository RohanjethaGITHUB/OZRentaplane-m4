export type TimeRangeValue = 'today' | '7d' | '30d' | '6m' | 'max'

export const TIME_RANGE_OPTIONS: Array<{ label: string; value: TimeRangeValue }> = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '6 months', value: '6m' },
  { label: 'Max', value: 'max' },
]

