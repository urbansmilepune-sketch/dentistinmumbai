'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'

type Appt = {
  id: string
  appt_date: string
  time_slot: string | null
  status: string
  patient_id: string | null
  patient_name: string | null
  patient_phone: string | null
  reference_no: string | null
  notes: string | null
  treatments: { name: string | null; icon: string | null } | null
}

const SCHEDULED_STATUSES = new Set(['scheduled', 'pending', 'confirmed'])

// Per the brief:
//   green  = active
//   amber  = waiting / scheduled
//   gray   = completed (+ no_show)
//   red    = cancelled
function statusVisuals(status: string): { bg: string; text: string; label: string } {
  if (status === 'active')                     return { bg: '#DCFCE7', text: '#166534', label: 'active'    }
  if (status === 'waiting')                    return { bg: '#FEF3C7', text: '#92400E', label: 'waiting'   }
  if (SCHEDULED_STATUSES.has(status))          return { bg: '#FEF3C7', text: '#92400E', label: 'scheduled' }
  if (status === 'completed')                  return { bg: '#E5E7EB', text: '#374151', label: 'completed' }
  if (status === 'no_show')                    return { bg: '#E5E7EB', text: '#374151', label: 'no show'   }
  if (status === 'cancelled')                  return { bg: '#FEE2E2', text: '#991B1B', label: 'cancelled' }
  return { bg: '#E5E7EB', text: '#374151', label: status }
}

// Sort priority for stacking colored bars inside a day cell — active first, then
// upcoming, then closed-out statuses.
const STATUS_SORT: Record<string, number> = {
  active: 0, waiting: 1, scheduled: 2, pending: 2, confirmed: 2,
  completed: 3, no_show: 3, cancelled: 4,
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Format a Date as YYYY-MM-DD in local time (avoids the UTC shift toISOString gives).
function toLocalIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}
function startOfNextMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 1)
}

export default function CalendarPage() {
  const router = useRouter()
  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => toLocalIso(today), [today])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dentistId, setDentistId] = useState('')
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [appts, setAppts] = useState<Appt[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayKey)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const dentist = await resolveCurrentDentist(supabase, 'id')
      if (!dentist) { router.push('/for-dentists/login'); return }
      if (cancelled) return
      setDentistId(dentist.id)

      const from = toLocalIso(startOfMonth(viewYear, viewMonth))
      const to = toLocalIso(startOfNextMonth(viewYear, viewMonth))
      const { data, error: e } = await supabase
        .from('appointments')
        .select('id, appt_date, time_slot, status, patient_id, patient_name, patient_phone, reference_no, notes, treatments(name, icon)')
        .eq('dentist_id', dentist.id)
        .gte('appt_date', from)
        .lt('appt_date', to)
        .order('appt_date', { ascending: true })
        .order('time_slot', { ascending: true })
      if (cancelled) return
      if (e) setError(e.message)
      setAppts(((data ?? []) as unknown) as Appt[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [viewYear, viewMonth, router])

  // Group appointments by date string (YYYY-MM-DD) for fast cell lookups.
  const byDate = useMemo(() => {
    const m = new Map<string, Appt[]>()
    for (const a of appts) {
      // appt_date from Postgres `date` comes back as YYYY-MM-DD already.
      const key = a.appt_date.length >= 10 ? a.appt_date.slice(0, 10) : a.appt_date
      const arr = m.get(key) ?? []
      arr.push(a)
      m.set(key, arr)
    }
    // Sort each day's list: active first, then by time.
    for (const list of m.values()) {
      list.sort((a, b) => {
        const sa = STATUS_SORT[a.status] ?? 9
        const sb = STATUS_SORT[b.status] ?? 9
        if (sa !== sb) return sa - sb
        return (a.time_slot ?? '').localeCompare(b.time_slot ?? '')
      })
    }
    return m
  }, [appts])

  // 6-week grid (42 cells) starting from the Sunday on or before the 1st.
  const cells = useMemo(() => {
    const first = startOfMonth(viewYear, viewMonth)
    const startDow = first.getDay()
    const gridStart = new Date(viewYear, viewMonth, 1 - startDow)
    const out: { date: Date; key: string; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      out.push({
        date: d,
        key: toLocalIso(d),
        inMonth: d.getMonth() === viewMonth,
      })
    }
    return out
  }, [viewYear, viewMonth])

  const selectedAppts = byDate.get(selectedDate) ?? []
  const monthTotal = appts.length

  function goPrev() {
    const m = viewMonth - 1
    if (m < 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m)
  }
  function goNext() {
    const m = viewMonth + 1
    if (m > 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m)
  }
  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedDate(todayKey)
  }

  const navBtn: React.CSSProperties = {
    padding: '8px 14px', minHeight: 40, background: '#fff', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-body)',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>Calendar</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            {monthTotal} appointment{monthTotal !== 1 ? 's' : ''} this month
          </p>
        </div>
        <Link href="/for-dentists/dashboard/appointments"
          style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
          List view →
        </Link>
      </div>

      {/* Month nav */}
      <div className="cal-monthnav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={goPrev} aria-label="Previous month" style={navBtn}>←</button>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, minWidth: 180, textAlign: 'center' }}>
            {MONTH_LABELS[viewMonth]} {viewYear}
          </h2>
          <button type="button" onClick={goNext} aria-label="Next month" style={navBtn}>→</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={goToday} style={{ ...navBtn, background: 'var(--blue-light)', color: 'var(--blue)', borderColor: '#BFDBFE' }}>
            Today
          </button>
          {/* Legend */}
          <div className="cal-legend" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
            <LegendDot color="#22C55E" label="Active" />
            <LegendDot color="#F59E0B" label="Waiting / Scheduled" />
            <LegendDot color="#9CA3AF" label="Completed" />
            <LegendDot color="#EF4444" label="Cancelled" />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Calendar grid */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {/* Weekday header */}
        <div className="cal-weekhead" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          {WEEKDAY_LABELS.map(d => (
            <div key={d} style={{ padding: '10px 6px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span className="cal-weekday-full">{d}</span>
              <span className="cal-weekday-short" style={{ display: 'none' }}>{d.slice(0, 1)}</span>
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map(cell => {
            const list = byDate.get(cell.key) ?? []
            const isToday = cell.key === todayKey
            const isSelected = cell.key === selectedDate
            const visible = list.slice(0, 3)
            const more = list.length - visible.length

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDate(cell.key)}
                className="cal-cell"
                style={{
                  background: isSelected ? 'var(--blue-light)' : '#fff',
                  border: 'none',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  outline: isToday ? '2px solid var(--blue)' : 'none',
                  outlineOffset: '-2px',
                  minHeight: 96,
                  padding: '6px 6px 8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--font-body)',
                  opacity: cell.inMonth ? 1 : 0.45,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{
                    fontSize: 13, fontWeight: isToday ? 800 : 600,
                    color: isToday ? 'var(--blue)' : 'var(--text)',
                  }}>{cell.date.getDate()}</span>
                  {list.length > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, padding: '0 6px',
                      background: 'var(--blue)', color: '#fff',
                      borderRadius: 9, fontSize: 11, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{list.length}</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {visible.map(a => {
                    const v = statusVisuals(a.status)
                    return (
                      <div key={a.id} className="cal-bar"
                        style={{
                          background: v.bg, color: v.text,
                          fontSize: 10, fontWeight: 600,
                          padding: '2px 6px', borderRadius: 4,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                        title={`${a.time_slot ?? ''} ${a.patient_name ?? ''} — ${v.label}`}>
                        <span className="cal-bar-time">{a.time_slot?.slice(0, 5) ?? ''}</span> <span className="cal-bar-name">{a.patient_name ?? ''}</span>
                      </div>
                    )
                  })}
                  {more > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, paddingLeft: 4 }}>+{more} more</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail panel */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, marginTop: 20, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
              {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {selectedDate === todayKey && <span style={{ fontSize: 11, color: 'var(--blue)', marginLeft: 8, padding: '2px 8px', background: 'var(--blue-light)', borderRadius: 20, fontWeight: 700 }}>TODAY</span>}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {selectedAppts.length} appointment{selectedAppts.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>
        ) : selectedAppts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>
            No appointments on this day.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedAppts.map(a => {
              const v = statusVisuals(a.status)
              return (
                <div key={a.id} className="cal-day-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
                  <div style={{ width: 70, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {a.time_slot?.slice(0, 5) ?? '—'}
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>{a.patient_name || 'Unknown'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: v.bg, color: v.text }}>{v.label}</span>
                      {a.reference_no && <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{a.reference_no}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                      {a.patient_phone && <span>📞 {a.patient_phone}</span>}
                      {a.treatments?.name && <span>{a.treatments.icon ?? '🦷'} {a.treatments.name}</span>}
                    </div>
                  </div>
                  {/* Two-button block: jump straight to the patient file
                      (full record — visits, Rx, invoices, treatment plans,
                      dental chart) when patient_id is set, OR fall back
                      to the appointments list so the dentist can still
                      reach the row via the "Create Patient File" button
                      there. */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {a.patient_id ? (
                      <Link href={`/for-dentists/dashboard/patients/${a.patient_id}`}
                        title="Open the patient's full file"
                        style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700, textDecoration: 'none', padding: '6px 10px', minHeight: 36, display: 'inline-flex', alignItems: 'center', borderRadius: 8, border: '1px solid #BFDBFE', background: 'var(--blue-light)' }}>
                        👤 Patient File
                      </Link>
                    ) : null}
                    <Link href="/for-dentists/dashboard/appointments"
                      style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none', padding: '6px 10px', minHeight: 36, display: 'inline-flex', alignItems: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      Open →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .cal-cell { min-height: 76px !important; padding: 4px !important; }
          .cal-bar-name { display: none; }
          .cal-bar { padding: 1px 4px !important; }
          .cal-legend { display: none !important; }
          .cal-weekday-full { display: none !important; }
          .cal-weekday-short { display: inline !important; }
          .cal-monthnav h2 { font-size: 16px !important; min-width: 140px !important; }
          .cal-day-row > div:first-child { width: auto !important; min-width: 56px; }
        }
        @media (max-width: 480px) {
          .cal-cell { min-height: 64px !important; }
        }
      `}</style>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}
