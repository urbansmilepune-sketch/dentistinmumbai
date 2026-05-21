'use client'

import { useEffect, useMemo, useState } from 'react'

interface Treatment { id: string; name: string; icon: string | null }
interface DayHours { is_open?: boolean; open_time?: string | null; close_time?: string | null }
type WorkingHours = Partial<Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', DayHours>> | null

interface Props {
  dentistId: string
  dentistSlug: string
  dentistName: string
  clinicName: string
  areaName: string
  dentistPhone: string
  workingHours?: WorkingHours
  treatments: Treatment[]
}

// Default open hours when the dentist hasn't set working_hours yet:
// 9 AM → 8 PM, hourly starts. Matches the public profile "Closed today"
// fallback in src/app/dentist/[slug]/page.tsx::isOpenNow().
const DEFAULT_OPEN  = '09:00'
const DEFAULT_CLOSE = '20:00'
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Build the hourly slot list for a given day, using the dentist's saved
 * working_hours when present. Returns null when the clinic is explicitly
 * closed that day so the UI can show a "Closed" message instead of an
 * empty grid. When working_hours is missing entirely we fall back to the
 * platform default (9 AM – 8 PM) — a fresh signup should still take
 * bookings while the dentist gets around to filling in their hours. */
function buildSlotsForDay(hours: DayHours | undefined): string[] | null {
  if (hours?.is_open === false) return null
  const openStr  = (hours?.open_time  || DEFAULT_OPEN).slice(0, 5)
  const closeStr = (hours?.close_time || DEFAULT_CLOSE).slice(0, 5)
  const openMin = hhmmToMinutes(openStr)
  const closeMin = hhmmToMinutes(closeStr)
  if (!(closeMin > openMin)) return []
  const slots: string[] = []
  // Round the start up to the next whole hour so a 09:30 open still
  // produces 10:00 as the first patient-facing slot. Hourly cadence is
  // the booking grain the rest of the app uses.
  const firstSlotMin = Math.ceil(openMin / 60) * 60
  for (let m = firstSlotMin; m < closeMin; m += 60) slots.push(minutesToHHMM(m))
  return slots
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextDays(n: number): { iso: string; label: string; sub: string }[] {
  const out: { iso: string; label: string; sub: string }[] = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const iso = toLocalIso(d)
    const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' })
    const dayNum = d.getDate()
    const monthName = d.toLocaleDateString('en-IN', { month: 'short' })
    let label = dayName
    if (i === 0) label = 'Today'
    else if (i === 1) label = 'Tomorrow'
    out.push({ iso, label, sub: `${dayNum} ${monthName}` })
  }
  return out
}

export default function BookingFlow({ dentistId, dentistSlug, dentistName, clinicName, areaName, dentistPhone, workingHours, treatments }: Props) {
  // `days`, `selectedDate`, `nowHour` are derived from `new Date()` — if we
  // computed them during render the server (UTC) and client (IST) would
  // produce different values for "today" + current hour, causing a React
  // hydration mismatch (#418) on first paint. Initialise to neutral defaults,
  // then populate in a mount-only effect so server and client agree on the
  // empty state, and the date-dependent UI shows up after hydration.
  const [days, setDays] = useState<{ iso: string; label: string; sub: string }[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [nowHour, setNowHour] = useState<number>(-1)
  const [mounted, setMounted] = useState(false)

  const [booked, setBooked] = useState<Set<string>>(new Set())
  // Initial true: server and client first paint both show "Checking
  // availability…" while we wait for the mount effect to compute today's date
  // and fire the slot fetch. Otherwise this would briefly read "No slots
  // available" on first render because availableSlots is [] until then.
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [selectedSlot, setSelectedSlot] = useState<string>('')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  // Optional. When the patient provides it, /api/bookings stores it on the
  // appointments row and fires (a) a request-received ack now and (b) a
  // confirmed email later when the dentist confirms. Skipping it still
  // creates the booking — no email goes out in that case.
  const [email, setEmail] = useState('')
  const [treatmentId, setTreatmentId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<{ reference_no: string; date: string; slot: string; treatmentName: string | null } | null>(null)

  useEffect(() => {
    const ds = nextDays(7)
    setDays(ds)
    setSelectedDate(ds[0].iso)
    setNowHour(new Date().getHours())
    setMounted(true)
  }, [])

  const todayIso = days[0]?.iso ?? ''

  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false
    async function load() {
      setLoadingSlots(true)
      setSelectedSlot('')
      const res = await fetch(`/api/bookings/slots?dentist_id=${encodeURIComponent(dentistId)}&date=${encodeURIComponent(selectedDate)}`)
      const data = await res.json().catch(() => ({ slots: [] }))
      if (cancelled) return
      const norm = ((data.slots ?? []) as string[]).map((s: string) => s.slice(0, 5))
      setBooked(new Set(norm))
      setLoadingSlots(false)
    }
    load()
    return () => { cancelled = true }
  }, [dentistId, selectedDate])

  // null when the clinic is closed on the selected day, otherwise the list
  // of hourly slots inside open/close hours. The "closed today" branch in
  // the slot grid renders the dedicated copy off this same null.
  const dayHours = useMemo(() => {
    if (!selectedDate) return undefined
    const [yy, mm, dd] = selectedDate.split('-').map(Number)
    if (!Number.isFinite(yy + mm + dd) || !workingHours) return undefined
    return workingHours[DAY_KEYS[new Date(yy, (mm || 1) - 1, dd || 1).getDay()]]
  }, [selectedDate, workingHours])
  const dayIsClosed = dayHours?.is_open === false

  const availableSlots = useMemo(() => {
    if (!selectedDate) return []
    const baseSlots = buildSlotsForDay(dayHours)
    if (!baseSlots) return []
    return baseSlots.filter(slot => {
      if (booked.has(slot)) return false
      if (selectedDate === todayIso && nowHour >= 0) {
        const hour = parseInt(slot.split(':')[0], 10)
        if (hour <= nowHour) return false
      }
      return true
    })
  }, [booked, selectedDate, todayIso, nowHour, dayHours])

  function validate(): string | null {
    if (!name.trim()) return 'Please enter your name'
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) return 'Please enter a 10-digit phone number'
    // Email is optional — only validate the format when the patient typed
    // something. Don't reject empty.
    const trimmedEmail = email.trim()
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return 'Please enter a valid email address (or leave the field empty).'
    }
    if (!selectedSlot) return 'Pick a time slot'
    return null
  }

  async function submit() {
    setError(null)
    const v = validate()
    if (v) { setError(v); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dentist_id: dentistId,
          patient_name: name.trim(),
          patient_phone: phone.replace(/\D/g, ''),
          patient_email: email.trim() || null,
          appt_date: selectedDate,
          time_slot: selectedSlot,
          treatment_id: treatmentId || null,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || 'Booking failed. Please try again.')
        setSubmitting(false)
        return
      }
      const t = treatments.find(x => x.id === treatmentId)?.name ?? null
      setConfirmed({ reference_no: json.reference_no, date: selectedDate, slot: selectedSlot, treatmentName: t })
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  if (confirmed) {
    const dateLabel = new Date(confirmed.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const waMsg = encodeURIComponent(`Hi ${dentistName}, I've booked an appointment.\nRef: ${confirmed.reference_no}\nDate: ${dateLabel}\nTime: ${confirmed.slot}${confirmed.treatmentName ? `\nTreatment: ${confirmed.treatmentName}` : ''}`)
    return (
      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 28, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, marginBottom: 14, border: '4px solid #BBF7D0',
        }}>✓</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Appointment Confirmed</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 18 }}>
          A confirmation has been sent to the clinic. Save your reference number.
        </p>
        <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 16, textAlign: 'left', marginBottom: 18 }}>
          <DetailRow label="Reference" value={confirmed.reference_no} mono />
          <DetailRow label="Dentist" value={dentistName} />
          <DetailRow label="Clinic" value={`${clinicName}, ${areaName}`} />
          <DetailRow label="Date" value={dateLabel} />
          <DetailRow label="Time" value={confirmed.slot} />
          {confirmed.treatmentName && <DetailRow label="Treatment" value={confirmed.treatmentName} />}
        </div>
        {dentistPhone && (
          <a href={`https://wa.me/91${dentistPhone.replace(/\D/g, '')}?text=${waMsg}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', minHeight: 52, padding: '14px 20px',
              background: '#25D366', color: '#fff', borderRadius: 12,
              fontWeight: 700, fontSize: 15, textDecoration: 'none', marginBottom: 10,
            }}>
            💬 Confirm on WhatsApp
          </a>
        )}
        <a href={`/dentist/${dentistSlug}`} style={{ display: 'block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
          Back to clinic profile
        </a>
      </section>
    )
  }

  return (
    <>
      {/* Date strip */}
      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Select a Day
        </h2>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'thin' }}>
          {!mounted ? (
            // Hydration-safe placeholder: deterministic 7 grey skeleton tiles
            // that look like the real date strip. No Date calls means server
            // and client render the identical DOM here.
            Array.from({ length: 7 }, (_, i) => (
              <div key={i} aria-hidden style={{
                flexShrink: 0, minWidth: 76, minHeight: 64,
                background: 'var(--bg)', border: '1.5px solid var(--border)',
                borderRadius: 12,
              }} />
            ))
          ) : days.map(d => {
            const on = d.iso === selectedDate
            return (
              <button key={d.iso} type="button" onClick={() => setSelectedDate(d.iso)}
                style={{
                  flexShrink: 0, minWidth: 76, minHeight: 64, padding: '10px 12px',
                  background: on ? 'var(--blue)' : '#fff',
                  color: on ? '#fff' : 'var(--text)',
                  border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                  borderRadius: 12, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: on ? 0.85 : 0.7 }}>{d.label}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700 }}>{d.sub}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Slot grid */}
      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Available Times
        </h2>
        {loadingSlots ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Checking availability…</p>
        ) : dayIsClosed ? (
          <div style={{ padding: '14px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, color: '#92400E', fontSize: 14, lineHeight: 1.5 }}>
            <strong>Closed on this day.</strong> Please pick another date — the clinic is closed.
          </div>
        ) : availableSlots.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--muted)', padding: '12px 0' }}>
            No slots available on this day. Try another date.
          </p>
        ) : (
          <div className="booking-slots-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 8 }}>
            {availableSlots.map(slot => {
              const on = slot === selectedSlot
              return (
                <button key={slot} type="button" onClick={() => setSelectedSlot(slot)}
                  style={{
                    minHeight: 48, padding: '10px 6px',
                    background: on ? 'var(--blue)' : '#fff',
                    color: on ? '#fff' : 'var(--text)',
                    border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                    borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
                  }}>
                  {formatSlotLabel(slot)}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Patient form */}
      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 16px', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Your Details
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Full Name *">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="As on your ID" autoComplete="name"
              style={inputStyle} />
          </Field>
          <Field label="Phone *">
            <input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="10-digit number" inputMode="tel" autoComplete="tel"
              style={inputStyle} />
          </Field>
          <Field label="Email (for confirmation)">
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" inputMode="email" autoComplete="email"
              type="email" style={inputStyle} />
          </Field>
          <Field label="Treatment">
            <select value={treatmentId} onChange={e => setTreatmentId(e.target.value)}
              style={{ ...inputStyle, background: '#fff', appearance: 'none' as const }}>
              <option value="">General consultation</option>
              {treatments.map(t => (
                <option key={t.id} value={t.id}>{t.icon ? `${t.icon} ` : ''}{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Anything the dentist should know in advance" rows={2}
              style={{ ...inputStyle, resize: 'vertical' as const }} />
          </Field>
        </div>
      </section>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      )}

      <div className="booking-submit-wrap">
        <button type="button" onClick={submit} disabled={submitting}
          style={{
            width: '100%', minHeight: 56, padding: '16px 20px',
            background: 'var(--blue)', color: '#fff', border: 'none',
            borderRadius: 14, fontWeight: 700, fontSize: 16,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
            fontFamily: 'var(--font-body)',
            boxShadow: '0 4px 12px rgba(0,87,168,0.2)',
          }}>
          {submitting ? 'Booking…' : selectedSlot ? `Confirm ${formatSlotLabel(selectedSlot)}` : 'Confirm Booking'}
        </button>
        <p className="booking-submit-note" style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 14 }}>
          No payment now. The clinic will confirm shortly.
        </p>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .booking-slots-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .booking-submit-wrap {
            position: fixed; bottom: 0; left: 0; right: 0; z-index: 90;
            background: #fff; border-top: 1px solid var(--border);
            padding: 10px 16px env(safe-area-inset-bottom, 10px);
            box-shadow: 0 -4px 16px rgba(0,0,0,0.08);
          }
          .booking-submit-note { display: none !important; }
        }
      `}</style>
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 48, padding: '12px 14px',
  borderRadius: 10, border: '1.5px solid var(--border)',
  fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none',
  boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text)' }}>{label}</span>
      {children}
    </label>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', fontSize: 14, borderBottom: '1px dashed var(--border)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, fontFamily: mono ? 'monospace' : 'var(--font-body)', color: mono ? 'var(--blue)' : 'var(--text)' }}>{value}</span>
    </div>
  )
}

function formatSlotLabel(slot: string): string {
  const [h] = slot.split(':').map(Number)
  const hour12 = ((h + 11) % 12) + 1
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour12}:00 ${ampm}`
}
