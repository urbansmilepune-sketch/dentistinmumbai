// Open/closed computation for the public dentist profile.
//
// Builds on istDayTime() (src/lib/time.ts) so "now" is always evaluated in
// IST regardless of the UTC Vercel runtime. Returns a structured status the
// profile's open/closed banner renders directly:
//   - state 'open'   → "Open now · closes 7:30 PM"
//   - state 'closed' → "Closed · opens 9:00 AM"  (or "opens Mon 9:00 AM")
//   - state 'none'   → no usable hours at all; the banner is hidden entirely.

import { istDayTime } from './time'

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const DAY_SHORT: Record<string, string> = {
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
}

export type OpenStatus =
  | { state: 'open'; label: string; closeTime: string }
  | { state: 'closed'; label: string }
  | { state: 'none' }

/** "19:00" → "7:00 PM", "09:30" → "9:30 AM". Tolerates already-clean input. */
export function formatTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [hStr, mStr = '00'] = String(hhmm).split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (!Number.isFinite(h)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const mm = Number.isFinite(m) && m > 0 ? `:${String(m).padStart(2, '0')}` : ':00'
  return `${h12}${mm} ${period}`
}

function dayHours(working_hours: any, key: string): { is_open?: boolean; open_time?: string; close_time?: string } | null {
  const dh = working_hours?.[key]
  return dh && typeof dh === 'object' ? dh : null
}

function hasAnyHours(working_hours: any): boolean {
  if (!working_hours || typeof working_hours !== 'object') return false
  return DAY_ORDER.some(k => dayHours(working_hours, k)?.is_open)
}

export function getOpenStatus(working_hours: any): OpenStatus {
  if (!hasAnyHours(working_hours)) return { state: 'none' }

  const { dayKey, hour, minute } = istDayTime(new Date())
  const nowMins = hour * 60 + minute
  const today = dayHours(working_hours, dayKey)

  if (today?.is_open) {
    const [oH, oM] = (today.open_time || '09:00').split(':').map(Number)
    const [cH, cM] = (today.close_time || '19:00').split(':').map(Number)
    const openMins = oH * 60 + oM
    const closeMins = cH * 60 + cM
    if (nowMins >= openMins && nowMins < closeMins) {
      return { state: 'open', label: `Open now · closes ${formatTime12(today.close_time)}`, closeTime: today.close_time || '' }
    }
    if (nowMins < openMins) {
      return { state: 'closed', label: `Closed · opens ${formatTime12(today.open_time)}` }
    }
  }

  // Closed for the rest of today (or shut today) — find the next day that
  // opens, scanning forward up to 7 days. Same-day already handled above.
  const todayIdx = DAY_ORDER.indexOf(dayKey as (typeof DAY_ORDER)[number])
  for (let offset = 1; offset <= 7; offset++) {
    const key = DAY_ORDER[(todayIdx + offset) % 7]
    const dh = dayHours(working_hours, key)
    if (dh?.is_open) {
      const when = offset === 1 ? formatTime12(dh.open_time) : `${DAY_SHORT[key]} ${formatTime12(dh.open_time)}`
      return { state: 'closed', label: `Closed · opens ${when}` }
    }
  }
  return { state: 'closed', label: 'Closed' }
}
