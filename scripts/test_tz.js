function sydneyLocalToUTC(dtLocalValue) {
  if (!dtLocalValue || !dtLocalValue.includes('T')) return null
  const [dateStr, timeStr] = dtLocalValue.split('T')
  const naive = new Date(`${dateStr}T${timeStr}:00`)
  const sydneyEquiv = new Date(
    naive.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }),
  )
  const offsetMs = naive.getTime() - sydneyEquiv.getTime()
  return new Date(naive.getTime() + offsetMs).toISOString()
}

console.log('08:00 ->', sydneyLocalToUTC('2026-04-21T08:00'))
console.log('13:00 ->', sydneyLocalToUTC('2026-04-21T13:00'))
console.log('00:00 ->', sydneyLocalToUTC('2026-04-21T00:00'))
console.log('23:59 ->', sydneyLocalToUTC('2026-04-21T23:59'))
