// Server-side timezone helpers. The Vercel runtime is UTC; every clinic on
// the platform operates in IST. Calling `new Date().getDay()/.getHours()`
// directly on the server gives a 5h30 offset — a Monday 23:00 IST request
// renders as Tuesday 17:30 and looks up the wrong day's working_hours.
//
// Intl.DateTimeFormat with `timeZone: 'Asia/Kolkata'` is the canonical fix.
// `formatToParts` lets us pull weekday/hour/minute in one pass.

/**
 * Day-key (`'sun'..'sat'` matching the working_hours JSON), hour, and minute
 * of the given moment, expressed in IST. Pass `new Date()` for "now".
 */
export function istDayTime(now: Date): { dayKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const weekday = parts.find(p => p.type === 'weekday')?.value.toLowerCase() ?? 'sun'
  const rawHour = parts.find(p => p.type === 'hour')?.value ?? '00'
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  // hour12:false occasionally returns '24' for midnight on some engines —
  // normalise to 0 so 24*60 + minute can't yield 1440+ minute totals.
  const hourNum = parseInt(rawHour, 10)
  const hour = hourNum === 24 ? 0 : hourNum
  return { dayKey: weekday, hour, minute }
}

export function isOpenNowFromHours(working_hours: any): boolean {
  if (!working_hours) return false
  const { dayKey, hour, minute } = istDayTime(new Date())
  const dayHours = working_hours[dayKey]
  if (!dayHours?.is_open) return false
  const [openH, openM] = (dayHours.open_time || '09:00').split(':').map(Number)
  const [closeH, closeM] = (dayHours.close_time || '19:00').split(':').map(Number)
  const currentMins = hour * 60 + minute
  const openMins = openH * 60 + openM
  const closeMins = closeH * 60 + closeM
  return currentMins >= openMins && currentMins < closeMins
}
