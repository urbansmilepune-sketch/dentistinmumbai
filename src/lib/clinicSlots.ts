// Free-slot rules for the patient app's reschedule screen. Same rules as the
// public booking page (src/app/book/[slug]/BookingFlow.tsx): hourly slots
// inside the clinic's working_hours, 9 AM – 8 PM when hours aren't set, and a
// day marked closed has no slots. Used in the browser to draw the grid and on
// the server to re-check the slot the patient picked.

export interface DayHours { is_open?: boolean; open_time?: string | null; close_time?: string | null }
export type WorkingHours = Partial<Record<DayKey, DayHours>> | null

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '20:00'

// How far ahead a patient can move an appointment.
export const RESCHEDULE_DAYS_AHEAD = 30

function toMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function toHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function dayKeyOf(isoDate: string): DayKey {
  const [y, m, d] = isoDate.split('-').map(Number)
  return DAY_KEYS[new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()]
}

// Hourly slots ("10:00", "11:00", …) for a date, or null when the clinic is closed.
export function slotsForDate(hours: WorkingHours, isoDate: string): string[] | null {
  const day = hours?.[dayKeyOf(isoDate)]
  if (day?.is_open === false) return null
  const open = toMinutes((day?.open_time || DEFAULT_OPEN).slice(0, 5))
  const close = toMinutes((day?.close_time || DEFAULT_CLOSE).slice(0, 5))
  if (!(close > open)) return []
  const out: string[] = []
  for (let m = Math.ceil(open / 60) * 60; m < close; m += 60) out.push(toHHMM(m))
  return out
}

// "HH:MM" or "10:30 AM" → "HH:MM" (24h). Empty string if it can't be read.
export function normaliseSlot(slot: unknown): string {
  const m = String(slot ?? '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return ''
  let h = parseInt(m[1], 10)
  const mer = (m[3] || '').toUpperCase()
  if (mer === 'PM' && h < 12) h += 12
  if (mer === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// "14:00" → "2:00 PM"
export function slotLabel(slot: string): string {
  const s = normaliseSlot(slot)
  if (!s) return String(slot || '')
  const [h, m] = s.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// Today's date and hour in India (clinics are IST; servers run UTC).
export function nowInIndia(): { iso: string; hour: number } {
  const ist = new Date(Date.now() + 330 * 60 * 1000)
  return { iso: ist.toISOString().slice(0, 10), hour: ist.getUTCHours() }
}

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n))
  return dt.toISOString().slice(0, 10)
}

// Free slots on a date: inside hours, not already booked, not in the past.
export function freeSlots(hours: WorkingHours, isoDate: string, booked: string[]): string[] | null {
  const base = slotsForDate(hours, isoDate)
  if (!base) return null
  const taken = new Set(booked.map(normaliseSlot))
  const now = nowInIndia()
  return base.filter(s => {
    if (taken.has(s)) return false
    if (isoDate === now.iso && parseInt(s, 10) <= now.hour) return false
    return true
  })
}
