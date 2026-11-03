'use client'

// Patient app (PWA). One screen with five bottom tabs: Home, Visits,
// Treatment, Rx, Bills. Data comes from /api/patient/data; moving or
// cancelling a visit goes through /api/patient/appointments. Design follows
// the approved mockup in project files pwa-app/mockup.html (section 4).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadPortalSession, setSelectedClinic, clearPortalSession, touchPortalSession, markPortalRefreshed, portalHeaders, type PortalClinic } from '@/lib/patientSession'
import { downloadInvoicePdf } from '@/lib/invoicePdf'
import { addDaysIso, freeSlots, nowInIndia, RESCHEDULE_DAYS_AHEAD, slotLabel, slotsForDate, type WorkingHours } from '@/lib/clinicSlots'
import InstallAppBanner from '@/components/InstallAppBanner'
import { getCityBySlug } from '@/config/cities'

const NAVY = '#0F172A'
const TEAL = '#14B8A6'
const TEAL_DARK = '#0F766E'
const TEAL_LIGHT = '#CCFBF1'
const MUTED = '#64748B'
const BORDER = '#E2E8F0'
const AMBER_BG = '#FEF3C7'
const AMBER = '#92400E'

type TabKey = 'home' | 'visits' | 'plan' | 'rx' | 'bills'
type Sheet =
  | { kind: 'profile' }
  | { kind: 'reschedule'; appt: any }
  | { kind: 'cancel'; appt: any }
  | { kind: 'chemist'; rx: any }
  | null

// ---------- small helpers ----------

function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return d.toLocaleDateString('en-IN', opts || { day: 'numeric', month: 'short', year: 'numeric' })
}

function rupees(n: number): string {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`
}

function firstName(name?: string | null): string {
  return String(name || '').trim().split(/\s+/)[0] || 'there'
}

function drName(name?: string | null): string {
  if (!name) return ''
  return `Dr. ${String(name).replace(/^dr\.?\s*/i, '')}`
}

function initials(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || 'P') + (parts[1]?.[0] || '')).toUpperCase()
}

function daysUntil(iso: string): number {
  const today = nowInIndia().iso
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))
  const b = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

function whenText(iso: string): string {
  const n = daysUntil(iso)
  if (n <= 0) return 'Your visit is today'
  if (n === 1) return 'Your next visit is tomorrow'
  return `Your next visit is in ${n} days`
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function downloadIcs(appt: any, clinic: any) {
  const [hh, mm] = (slotLabel(appt.time_slot) && appt.time_slot ? String(appt.time_slot) : '09:00').split(':')
  let h = parseInt(hh, 10) || 9
  const m = parseInt(mm, 10) || 0
  if (/pm/i.test(appt.time_slot) && h < 12) h += 12
  const [y, mo, d] = String(appt.appt_date).split('-').map((x: string) => parseInt(x, 10))
  const start = `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`
  const end = `${y}${pad(mo)}${pad(d)}T${pad(h + Math.floor((m + 30) / 60))}${pad((m + 30) % 60)}00`
  const loc = [clinic?.clinic_name, clinic?.address, clinic?.city].filter(Boolean).join(', ')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DentistIn//Patient App//EN', 'BEGIN:VEVENT',
    `UID:${appt.id}@dentistin`, `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:Dental appointment — ${appt.treatments?.name || 'Consultation'}`,
    loc ? `LOCATION:${loc.replace(/,/g, '\\,')}` : '',
    appt.reference_no ? `DESCRIPTION:Reference: ${appt.reference_no}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean)
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `appointment-${appt.reference_no || appt.id}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function directionsUrl(clinic: any): string {
  const dest = [clinic?.clinic_name, clinic?.address, clinic?.city].filter(Boolean).join(', ')
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

function waUrl(num?: string | null, text?: string): string | null {
  const digits = String(num || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const full = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

// "1-0-1" / "BD" / "TDS" → which parts of the day to take it.
function doseTimes(freq?: string | null): { m: boolean; a: boolean; n: boolean; sos: boolean } {
  const f = String(freq || '').trim().toUpperCase()
  const dash = f.match(/^(\d+(?:\/\d)?)\s*-\s*(\d+(?:\/\d)?)\s*-\s*(\d+(?:\/\d)?)/)
  if (dash) return { m: dash[1] !== '0', a: dash[2] !== '0', n: dash[3] !== '0', sos: false }
  if (/\b(SOS|PRN|IF PAIN|AS NEEDED)\b/.test(f)) return { m: false, a: false, n: false, sos: true }
  if (/\b(TDS|TID|THRICE|3 ?TIMES)\b/.test(f)) return { m: true, a: true, n: true, sos: false }
  if (/\b(BD|BID|TWICE|2 ?TIMES)\b/.test(f)) return { m: true, a: false, n: true, sos: false }
  if (/\b(HS|NIGHT|BEDTIME)\b/.test(f)) return { m: false, a: false, n: true, sos: false }
  if (/\b(OD|ONCE|DAILY)\b/.test(f)) return { m: true, a: false, n: false, sos: false }
  return { m: false, a: false, n: false, sos: false }
}

// Days a prescription runs for: the longest "N days / N weeks" among its medicines.
function rxDays(rx: any): number {
  const meds: any[] = Array.isArray(rx?.medicines) ? rx.medicines : []
  let max = 0
  for (const m of meds) {
    const t = String(m?.duration || '').toLowerCase()
    const n = parseInt(t, 10)
    if (!n) continue
    const days = /week/.test(t) ? n * 7 : /month/.test(t) ? n * 30 : n
    if (days > max) max = days
  }
  return max || 5
}

function rxEnds(rx: any): string {
  const start = String(rx?.created_at || '').slice(0, 10)
  return start ? addDaysIso(start, rxDays(rx) - 1) : ''
}

function rxActive(rx: any): boolean {
  const end = rxEnds(rx)
  return !!end && end >= nowInIndia().iso
}

function planTotal(p: any): number {
  const steps: any[] = p?.treatment_plan_steps || []
  const sum = steps.reduce((s, x) => s + (Number(x.estimated_cost) || 0), 0)
  return Number(p?.total_estimated_cost) || Number(p?.total_cost) || sum
}

function planDoneCount(p: any): number {
  return (p?.treatment_plan_steps || []).filter((s: any) => s.status === 'completed').length
}

function planActiveCount(p: any): number {
  return (p?.treatment_plan_steps || []).filter((s: any) => s.status !== 'skipped').length
}

const PLAN_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  presented: { text: 'Waiting for you', bg: AMBER_BG, fg: AMBER },
  accepted: { text: 'Agreed', bg: '#DBEAFE', fg: '#1D4ED8' },
  in_progress: { text: 'In progress', bg: TEAL_LIGHT, fg: TEAL_DARK },
  completed: { text: 'Completed', bg: '#E2E8F0', fg: '#334155' },
}

// ---------- icons (inline SVG only) ----------

function Icon({ name, size = 22, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'home': return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>
    case 'calendar': return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
    case 'tooth': return <svg {...p}><path d="M12 5.5c-2-1.6-5.2-1.8-7 .1-2 2-1.5 5.6-.5 8.4.8 2.3 1.3 4.8 1.7 7.2.2 1.5.8 2.3 1.8 2.3 1.5 0 1.7-2.4 2-4.4.3-1.3.9-2.1 2-2.1s1.7.8 2 2.1c.3 2 .5 4.4 2 4.4 1 0 1.6-.8 1.8-2.3.4-2.4.9-4.9 1.7-7.2 1-2.8 1.5-6.4-.5-8.4-1.8-1.9-5-1.7-7-.1z" /></svg>
    case 'rx': return <svg {...p}><path d="M6 4h6a4 4 0 010 8H6V4zM6 12v8M10 12l8 8M18 12l-6 8" /></svg>
    case 'bill': return <svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></svg>
    case 'pin': return <svg {...p}><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
    case 'move': return <svg {...p}><path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5" /></svg>
    case 'chat': return <svg {...p}><path d="M4 20l1.5-4A8 8 0 1112 20a8 8 0 01-4-1L4 20z" /></svg>
    case 'phone': return <svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>
    case 'check': return <svg {...p}><path d="M5 12l5 5L20 7" /></svg>
    case 'x': return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
    case 'chev': return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>
    case 'back': return <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>
    case 'download': return <svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
    case 'plus': return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>
    case 'info': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
    default: return null
  }
}

// ---------- shared styles ----------

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: MUTED, textTransform: 'uppercase', margin: '18px 4px 8px' }
const btn = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', borderRadius: 12,
  background: bg, color: fg, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer', textDecoration: 'none',
  fontFamily: 'inherit', minHeight: 42,
})
const compactBtn: React.CSSProperties = { padding: '10px 4px', fontSize: 12.5, gap: 4, whiteSpace: 'nowrap', minWidth: 0 }
const chip = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block', fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap',
})

// ---------- page ----------

export default function PatientAppPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('home')
  const [data, setData] = useState<any>(null)
  const [clinics, setClinics] = useState<PortalClinic[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchData = useCallback(async (patientId: string, quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/patient/data', {
        method: 'POST',
        headers: portalHeaders(),
        body: JSON.stringify({ patient_id: patientId }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) { clearPortalSession(); router.replace('/patient'); return }
      if (!res.ok) { setError(body.error || 'Could not load your records.'); return }
      markPortalRefreshed()
      setData(body)
      if (Array.isArray(body.clinics) && body.clinics.length) setClinics(body.clinics)
    } catch {
      setError('No internet connection. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const s = loadPortalSession()
    if (!s) { router.replace('/patient'); return }
    setClinics(s.clinics || [])
    setSelectedId(s.selectedPatientId)
    fetchData(s.selectedPatientId)
  }, [router, fetchData])

  // Any tap or key press counts as using the app (resets the 7-day idle
  // timer). Coming back to the app after 7+ days idle logs out.
  useEffect(() => {
    const onActivity = () => touchPortalSession()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!loadPortalSession()) { router.replace('/patient'); return }
      touchPortalSession()
    }
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(t)
  }, [toast])

  const reload = useCallback(() => {
    const s = loadPortalSession()
    if (!s) { router.replace('/patient'); return }
    fetchData(s.selectedPatientId, true)
  }, [fetchData, router])

  function switchClinic(patientId: string) {
    const s = loadPortalSession()
    if (!s) { router.replace('/patient'); return }
    setSelectedId(patientId)
    setSelectedClinic(patientId)
    setSheet(null)
    setTab('home')
    fetchData(patientId)
  }

  function logout() {
    clearPortalSession()
    router.replace('/patient')
  }

  function go(t: TabKey) {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  const derived = useMemo(() => {
    const invoices: any[] = data?.invoices || []
    const due = invoices.filter(i => i.payment_status !== 'paid').reduce((s, i) => s + (Number(i.total) || 0), 0)
    const paid = invoices.filter(i => i.payment_status === 'paid').reduce((s, i) => s + (Number(i.total) || 0), 0)
    const plans: any[] = data?.treatment_plans || []
    const openPlan = plans.find(p => p.status !== 'completed') || plans[0] || null
    const rxs: any[] = data?.prescriptions || []
    const activeRx = rxs.filter(rxActive)
    return { due, paid, openPlan, activeRx }
  }, [data])

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: NAVY, color: '#fff', fontFamily: 'var(--font-body)' }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/icons/dentist-app-192.png" alt="" width={64} height={64} style={{ borderRadius: 16 }} />
          <div style={{ marginTop: 12, fontSize: 14, color: '#94A3B8' }}>Loading your records…</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9', fontFamily: 'var(--font-body)', padding: 24, textAlign: 'center', gap: 16 }}>
        <p style={{ color: '#991B1B', fontSize: 16, maxWidth: 360 }}>{error || 'Could not load your records.'}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={reload} style={btn(TEAL, '#fff')}>Try again</button>
          <button onClick={logout} style={btn('#E2E8F0', NAVY)}>Back to login</button>
        </div>
      </div>
    )
  }

  const clinic = data.clinic || {}
  const patient = data.patient || {}
  const upcoming: any[] = data.appointments || []
  const next = upcoming[0] || null
  const clinicLabel = clinic.clinic_name || drName(clinic.dentist_name) || 'Your clinic'
  const contactPhone = clinic.phone || clinic.whatsapp
  const bookUrl = clinic.slug ? `/book/${clinic.slug}` : null

  return (
    <div style={{ minHeight: '100dvh', background: '#F1F5F9', fontFamily: 'var(--font-body)', color: NAVY }}>
      {/* Header */}
      <header style={{ background: NAVY, color: '#fff', position: 'sticky', top: 0, zIndex: 20, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/icons/dentist-app-192.png" alt="" width={34} height={34} style={{ borderRadius: 9 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{tab === 'home' ? `Hi ${firstName(patient.name)}` : TAB_TITLES[tab]}</div>
            {clinics.length > 1 ? (
              <button onClick={() => setSheet({ kind: 'profile' })}
                style={{ background: 'none', border: 'none', padding: 0, color: '#5EEAD4', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                {clinicLabel} · {clinics.length} clinics ▾
              </button>
            ) : (
              <div style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clinicLabel}</div>
            )}
          </div>
          <button onClick={() => setSheet({ kind: 'profile' })} aria-label="Profile and settings"
            style={{ width: 38, height: 38, borderRadius: 999, background: TEAL, color: NAVY, fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            {initials(patient.name)}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '14px 14px calc(96px + env(safe-area-inset-bottom))' }}>
        {tab === 'home' && (
          <>
            <InstallAppBanner storageKey="din_patient_app" title="Install DentistIn" pitch="Your visits, treatment and prescriptions in one tap." style={{ marginBottom: 12 }} />

            {next ? (
              <NextVisitCard appt={next} clinic={clinic}
                onReschedule={() => setSheet({ kind: 'reschedule', appt: next })} />
            ) : (
              <div style={{ ...card, background: NAVY, color: '#fff', border: 'none' }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>No upcoming visit</div>
                <div style={{ fontSize: 13.5, color: '#CBD5E1', marginTop: 4 }}>Book your next visit with {clinicLabel}.</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  {bookUrl && <a href={bookUrl} style={btn(TEAL, NAVY)}><Icon name="plus" size={16} /> Book a visit</a>}
                  {contactPhone && <a href={`tel:${contactPhone}`} style={btn('rgba(255,255,255,.12)', '#fff')}><Icon name="phone" size={16} /> Call clinic</a>}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Tile icon="tooth" title="Treatment" onClick={() => go('plan')}
                line={derived.openPlan ? derived.openPlan.title : 'No plan yet'}
                sub={derived.openPlan ? `${planDoneCount(derived.openPlan)} of ${planActiveCount(derived.openPlan)} done` : 'Your dentist adds it'} />
              <Tile icon="rx" title="Prescription" onClick={() => go('rx')}
                line={derived.activeRx[0] ? `${(derived.activeRx[0].medicines || []).length} medicines` : (data.prescriptions || []).length ? 'None active' : 'None yet'}
                sub={derived.activeRx[0] ? `till ${fmtDate(rxEnds(derived.activeRx[0]), { day: 'numeric', month: 'short' })}` : `${(data.prescriptions || []).length} in total`} />
              <Tile icon="bill" title="Bills" onClick={() => go('bills')} warn={derived.due > 0}
                line={derived.due > 0 ? `${rupees(derived.due)} due` : 'All paid'}
                sub={derived.due > 0 ? 'Pay at the clinic' : `${(data.invoices || []).length} bills`} />
              <Tile icon="calendar" title="Visits" onClick={() => go('visits')}
                line={upcoming.length ? `${upcoming.length} upcoming` : 'None booked'}
                sub={`${(data.past_appointments || []).length + (data.visits || []).length ? 'See past visits' : 'Book or move'}`} />
            </div>

            {derived.activeRx[0] && <TodayMedicines rx={derived.activeRx[0]} onOpen={() => go('rx')} />}
          </>
        )}

        {tab === 'visits' && (
          <VisitsTab data={data} clinic={clinic} bookUrl={bookUrl}
            onReschedule={a => setSheet({ kind: 'reschedule', appt: a })}
            onCancel={a => setSheet({ kind: 'cancel', appt: a })} />
        )}

        {tab === 'plan' && <TreatmentTab data={data} due={derived.due} paid={derived.paid} onBills={() => go('bills')} />}

        {tab === 'rx' && <RxTab data={data} onChemist={rx => setSheet({ kind: 'chemist', rx })} />}

        {tab === 'bills' && <BillsTab data={data} due={derived.due} paid={derived.paid} />}
      </main>

      <BottomNav tab={tab} onTab={go} />

      {toast && (
        <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(84px + env(safe-area-inset-bottom))', maxWidth: 520, margin: '0 auto', background: NAVY, color: '#fff', padding: '12px 14px', borderRadius: 12, fontSize: 14, zIndex: 60, boxShadow: '0 10px 30px rgba(15,23,42,.3)' }}>
          {toast}
        </div>
      )}

      {sheet?.kind === 'profile' && (
        <BottomSheet onClose={() => setSheet(null)} title="Profile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 999, background: TEAL_LIGHT, color: TEAL_DARK, display: 'grid', placeItems: 'center', fontWeight: 800 }}>{initials(patient.name)}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{patient.name || 'Patient'}</div>
              <div style={{ fontSize: 13, color: MUTED }}>{[patient.age ? `${patient.age} yrs` : '', patient.gender || ''].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div style={{ ...card, background: '#F8FAFC' }}>
            <div style={{ fontWeight: 800 }}>{clinicLabel}</div>
            {clinic.dentist_name && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{drName(clinic.dentist_name)}{clinic.degree ? `, ${clinic.degree}` : ''}</div>}
            {(clinic.address || clinic.area) && <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{[clinic.address, clinic.area, clinic.city ? getCityBySlug(clinic.city).cityName : ''].filter(Boolean).join(', ')}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {contactPhone && <a href={`tel:${contactPhone}`} style={btn(TEAL_LIGHT, TEAL_DARK)}><Icon name="phone" size={16} /> Call</a>}
              {waUrl(clinic.whatsapp || clinic.phone) && <a href={waUrl(clinic.whatsapp || clinic.phone, `Hi, this is ${patient.name || 'your patient'}.`)!} target="_blank" rel="noopener noreferrer" style={btn('#DCFCE7', '#166534')}><Icon name="chat" size={16} /> WhatsApp</a>}
              <a href={directionsUrl(clinic)} target="_blank" rel="noopener noreferrer" style={btn('#E2E8F0', NAVY)}><Icon name="pin" size={16} /> Directions</a>
            </div>
          </div>
          {clinics.length > 1 && (
            <>
              <div style={sectionTitle}>Your clinics</div>
              <p style={{ fontSize: 12.5, color: MUTED, margin: '-2px 4px 8px' }}>Every clinic that added this mobile number, in any city. Each clinic sees only its own records.</p>
              {clinics.map(c => (
                <button key={c.patient_id} onClick={() => switchClinic(c.patient_id)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, border: `1.5px solid ${c.patient_id === selectedId ? TEAL : BORDER}`, background: '#fff', cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.clinic_name || drName(c.dentist_name) || 'Clinic'}</div>
                    <div style={{ fontSize: 12.5, color: MUTED }}>{[drName(c.dentist_name), c.city ? getCityBySlug(c.city).cityName : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  {c.patient_id === selectedId && <Icon name="check" size={18} color={TEAL_DARK} />}
                </button>
              ))}
            </>
          )}
          <button onClick={logout} style={{ ...btn('#FEE2E2', '#991B1B'), width: '100%', marginTop: 12 }}>Log out</button>
          <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12 }}>To change your details, please ask your clinic.</p>
        </BottomSheet>
      )}

      {sheet?.kind === 'reschedule' && (
        <RescheduleSheet appt={sheet.appt} clinic={clinic} patientId={selectedId}
          onClose={() => setSheet(null)}
          onCancel={() => setSheet({ kind: 'cancel', appt: sheet.appt })}
          onDone={msg => { setSheet(null); setToast(msg); reload() }} />
      )}

      {sheet?.kind === 'cancel' && (
        <CancelSheet appt={sheet.appt} patientId={selectedId}
          onClose={() => setSheet(null)}
          onDone={msg => { setSheet(null); setToast(msg); reload() }} />
      )}

      {sheet?.kind === 'chemist' && <ChemistView rx={sheet.rx} patient={patient} clinic={clinic} onClose={() => setSheet(null)} />}
    </div>
  )
}

const TAB_TITLES: Record<TabKey, string> = {
  home: 'Home', visits: 'Appointments', plan: 'My treatment', rx: 'Prescriptions', bills: 'Bills',
}

// ---------- pieces ----------

function BottomNav({ tab, onTab }: { tab: TabKey; onTab: (t: TabKey) => void }) {
  const items: { key: TabKey; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'visits', label: 'Visits', icon: 'calendar' },
    { key: 'plan', label: 'Treatment', icon: 'tooth' },
    { key: 'rx', label: 'Rx', icon: 'rx' },
    { key: 'bills', label: 'Bills', icon: 'bill' },
  ]
  return (
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: `1px solid ${BORDER}`, zIndex: 30, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {items.map(it => {
          const on = it.key === tab
          return (
            <button key={it.key} onClick={() => onTab(it.key)} aria-current={on ? 'page' : undefined}
              style={{ background: 'none', border: 'none', padding: '9px 0 8px', cursor: 'pointer', color: on ? TEAL_DARK : '#94A3B8', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <Icon name={it.icon} size={22} />
              <span style={{ fontSize: 11, fontWeight: on ? 800 : 600 }}>{it.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function DateTile({ iso, dark }: { iso: string; dark?: boolean }) {
  return (
    <div style={{ width: 54, flexShrink: 0, borderRadius: 12, background: dark ? TEAL : TEAL_LIGHT, color: dark ? NAVY : TEAL_DARK, textAlign: 'center', padding: '7px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>{fmtDate(iso, { month: 'short' }).toUpperCase()}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{fmtDate(iso, { day: 'numeric' })}</div>
    </div>
  )
}

function NextVisitCard({ appt, clinic, onReschedule }: { appt: any; clinic: any; onReschedule: () => void }) {
  const confirmed = appt.status === 'confirmed'
  const wa = waUrl(clinic.whatsapp || clinic.phone, `Hi, about my appointment on ${fmtDate(appt.appt_date)} at ${slotLabel(appt.time_slot)}${appt.reference_no ? ` (ref ${appt.reference_no})` : ''}.`)
  return (
    <div style={{ ...card, background: NAVY, color: '#fff', border: 'none', padding: 16 }}>
      <div style={{ fontSize: 13, color: '#5EEAD4', fontWeight: 700, marginBottom: 10 }}>{whenText(appt.appt_date)}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <DateTile iso={appt.appt_date} dark />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{fmtDate(appt.appt_date, { weekday: 'short' })} · {slotLabel(appt.time_slot)}</div>
          <div style={{ fontSize: 14, color: '#E2E8F0', marginTop: 2 }}>{appt.treatments?.name || 'Consultation'}</div>
          <div style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[drName(clinic.dentist_name), clinic.clinic_name, clinic.area].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span style={chip(confirmed ? TEAL_LIGHT : AMBER_BG, confirmed ? TEAL_DARK : AMBER)}>{confirmed ? 'Confirmed' : 'Waiting for clinic'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: wa ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 14 }}>
        <a href={directionsUrl(clinic)} target="_blank" rel="noopener noreferrer" style={{ ...btn('rgba(255,255,255,.12)', '#fff'), ...compactBtn }}><Icon name="pin" size={15} /> Directions</a>
        <button onClick={onReschedule} style={{ ...btn('rgba(255,255,255,.12)', '#fff'), ...compactBtn }}><Icon name="move" size={15} /> Reschedule</button>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...btn('#25D366', '#fff'), ...compactBtn }}><Icon name="chat" size={15} /> WhatsApp</a>}
      </div>
    </div>
  )
}

function Tile({ icon, title, line, sub, onClick, warn }: { icon: string; title: string; line: string; sub: string; onClick: () => void; warn?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ textAlign: 'left', background: '#fff', border: `1px solid ${warn ? '#FDE68A' : BORDER}`, borderRadius: 16, padding: 14, cursor: 'pointer', fontFamily: 'inherit', color: NAVY, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: warn ? AMBER_BG : TEAL_LIGHT, color: warn ? AMBER : TEAL_DARK, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
        <Icon name={icon} size={19} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{title}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: warn ? AMBER : NAVY }}>{line}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </button>
  )
}

function DoseChips({ freq }: { freq?: string }) {
  const t = doseTimes(freq)
  if (t.sos) return <span style={chip(AMBER_BG, AMBER)}>Only if needed</span>
  if (!t.m && !t.a && !t.n) return freq ? <span style={{ fontSize: 13, color: MUTED }}>{freq}</span> : null
  const one = (on: boolean, label: string) => (
    <span style={{ ...chip(on ? TEAL_LIGHT : '#F1F5F9', on ? TEAL_DARK : '#CBD5E1'), textDecoration: on ? 'none' : 'line-through' }}>{label}</span>
  )
  return <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>{one(t.m, 'Morning')}{one(t.a, 'Afternoon')}{one(t.n, 'Night')}</span>
}

function TodayMedicines({ rx, onOpen }: { rx: any; onOpen: () => void }) {
  const meds: any[] = Array.isArray(rx.medicines) ? rx.medicines : []
  if (!meds.length) return null
  return (
    <button onClick={onOpen} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: NAVY, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 800 }}>Your medicines now</div>
        <Icon name="chev" size={18} color={MUTED} />
      </div>
      {meds.slice(0, 3).map((m, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{[m.dosage, m.instructions].filter(Boolean).join(' · ')}</div>
          </div>
          <DoseChips freq={m.frequency} />
        </div>
      ))}
    </button>
  )
}

function VisitsTab({ data, clinic, bookUrl, onReschedule, onCancel }: { data: any; clinic: any; bookUrl: string | null; onReschedule: (a: any) => void; onCancel: (a: any) => void }) {
  const upcoming: any[] = data.appointments || []
  const past: any[] = data.past_appointments || []
  const visits: any[] = data.visits || []
  return (
    <>
      {bookUrl && <a href={bookUrl} style={{ ...btn(TEAL, NAVY), width: '100%', boxSizing: 'border-box', marginBottom: 6 }}><Icon name="plus" size={17} /> Book a new visit</a>}
      <div style={sectionTitle}>Upcoming</div>
      {upcoming.length === 0 && <Empty text="No upcoming visits." />}
      {upcoming.map(a => {
        const confirmed = a.status === 'confirmed'
        return (
          <div key={a.id} style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <DateTile iso={a.appt_date} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{fmtDate(a.appt_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {slotLabel(a.time_slot)}</div>
                <div style={{ fontSize: 13.5, color: MUTED, marginTop: 2 }}>{a.treatments?.name || 'Consultation'}</div>
              </div>
              <span style={chip(confirmed ? TEAL_LIGHT : AMBER_BG, confirmed ? TEAL_DARK : AMBER)}>{confirmed ? 'Confirmed' : 'Waiting'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <button onClick={() => onReschedule(a)} style={btn(TEAL_LIGHT, TEAL_DARK)}><Icon name="move" size={16} /> Reschedule</button>
              <button onClick={() => onCancel(a)} style={btn('#F1F5F9', '#991B1B')}><Icon name="x" size={16} /> Cancel</button>
              <button onClick={() => downloadIcs(a, clinic)} style={btn('#F1F5F9', NAVY)}><Icon name="calendar" size={16} /> Add to calendar</button>
              <a href={directionsUrl(clinic)} target="_blank" rel="noopener noreferrer" style={btn('#F1F5F9', NAVY)}><Icon name="pin" size={16} /> Directions</a>
            </div>
            {!confirmed && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 10 }}>The clinic will confirm this time.</div>}
          </div>
        )
      })}

      {(past.length > 0 || visits.length > 0) && <div style={sectionTitle}>Past</div>}
      {visits.map(v => (
        <div key={v.id} style={card}>
          <div style={{ fontWeight: 800 }}>{fmtDate(v.visit_date)}</div>
          {v.treatment_done && <div style={{ fontSize: 14, marginTop: 4 }}>{v.treatment_done}</div>}
          {v.chief_complaint && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Came for: {v.chief_complaint}</div>}
        </div>
      ))}
      {visits.length === 0 && past.map(a => (
        <div key={a.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{fmtDate(a.appt_date)} · {slotLabel(a.time_slot)}</div>
            <div style={{ fontSize: 13, color: MUTED }}>{a.treatments?.name || 'Consultation'}</div>
          </div>
          <span style={chip('#F1F5F9', '#475569')}>{a.status === 'cancelled' ? 'Cancelled' : a.status === 'no_show' ? 'Missed' : 'Done'}</span>
        </div>
      ))}
    </>
  )
}

function TreatmentTab({ data, due, paid, onBills }: { data: any; due: number; paid: number; onBills: () => void }) {
  const plans: any[] = data.treatment_plans || []
  return (
    <>
      {plans.length === 0 && <Empty text="No treatment plan yet. When your dentist plans your treatment, the steps and costs show here." />}
      {plans.map(p => {
        const steps: any[] = (p.treatment_plan_steps || []).filter((s: any) => s.status !== 'skipped')
        const total = planTotal(p)
        const doneCost = steps.filter(s => s.status === 'completed').reduce((s, x) => s + (Number(x.estimated_cost) || 0), 0)
        const label = PLAN_LABEL[p.status] || PLAN_LABEL.accepted
        const done = planDoneCount(p)
        return (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{p.title}</div>
                <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Planned {fmtDate(p.created_at)}</div>
              </div>
              <span style={chip(label.bg, label.fg)}>{label.text}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{rupees(total)}</div>
              <div style={{ fontSize: 13, color: MUTED }}>{done} of {steps.length} steps done</div>
            </div>
            <div style={{ height: 8, background: '#E2E8F0', borderRadius: 99, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%`, background: TEAL }} />
            </div>
            {total > 0 && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>Work done so far: {rupees(doneCost)} · Still to do: {rupees(Math.max(0, total - doneCost))}</div>}

            <div style={{ marginTop: 14 }}>
              {steps.map((s, i) => {
                const isDone = s.status === 'completed'
                const going = s.status === 'scheduled'
                const tooth = s.tooth_numbers ? (Array.isArray(s.tooth_numbers) ? s.tooth_numbers.join(', ') : s.tooth_numbers) : s.tooth_number
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${BORDER}` : 'none', alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, background: isDone ? TEAL : going ? TEAL_LIGHT : '#F1F5F9', color: isDone ? '#fff' : going ? TEAL_DARK : MUTED }}>
                      {isDone ? <Icon name="check" size={15} /> : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s.treatment_name}</div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>
                        {[tooth ? `Tooth ${tooth}` : '', isDone ? `Done${s.completed_at ? ` ${fmtDate(s.completed_at, { day: 'numeric', month: 'short' })}` : ''}` : going ? 'In progress' : 'Not started'].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {Number(s.estimated_cost) > 0 && <div style={{ fontWeight: 700, fontSize: 14 }}>{rupees(Number(s.estimated_cost))}</div>}
                  </div>
                )
              })}
            </div>
            {p.notes && <div style={{ fontSize: 13, background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', marginTop: 8, color: '#334155' }}>{p.notes}</div>}
            {p.status === 'presented' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: AMBER, background: AMBER_BG, borderRadius: 10, padding: '10px 12px', marginTop: 10 }}>
                <Icon name="info" size={16} /> <span>Your dentist suggested this plan. Talk to the clinic when you are ready to start.</span>
              </div>
            )}
          </div>
        )
      })}

      {(due > 0 || paid > 0) && (
        <button onClick={onBills} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: NAVY, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Your bills at this clinic</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>
              <span style={{ color: TEAL_DARK }}>{rupees(paid)} paid</span>
              {due > 0 && <span style={{ color: AMBER }}> · {rupees(due)} pending</span>}
            </div>
          </div>
          <Icon name="chev" size={18} color={MUTED} />
        </button>
      )}
    </>
  )
}

function RxTab({ data, onChemist }: { data: any; onChemist: (rx: any) => void }) {
  const all: any[] = data.prescriptions || []
  const [open, setOpen] = useState<string | null>(null)
  if (all.length === 0) return <Empty text="No prescriptions yet. They show here after your dentist writes one." />
  const active = all.filter(rxActive)
  const earlier = all.filter(rx => !rxActive(rx))
  const RxCard = ({ rx, expanded }: { rx: any; expanded: boolean }) => {
    const meds: any[] = Array.isArray(rx.medicines) ? rx.medicines : []
    const isActive = rxActive(rx)
    return (
      <div style={card}>
        <button onClick={() => setOpen(expanded ? null : rx.id)}
          style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: NAVY, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800 }}>{rx.template_used || 'Prescription'}</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{fmtDate(rx.created_at)} · {meds.length} medicine{meds.length === 1 ? '' : 's'}</div>
          </div>
          <span style={chip(isActive ? TEAL_LIGHT : '#F1F5F9', isActive ? TEAL_DARK : '#475569')}>{isActive ? `Till ${fmtDate(rxEnds(rx), { day: 'numeric', month: 'short' })}` : 'Done'}</span>
        </button>
        {expanded && (
          <div style={{ marginTop: 10 }}>
            {meds.map((m, i) => (
              <div key={i} style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 0' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{m.name} {m.dosage && <span style={{ fontWeight: 600, color: MUTED, fontSize: 13 }}>{m.dosage}</span>}</div>
                <div style={{ fontSize: 13, color: '#334155', margin: '3px 0 6px' }}>{[m.instructions, m.duration].filter(Boolean).join(' · ')}</div>
                <DoseChips freq={m.frequency} />
              </div>
            ))}
            {rx.instructions && <div style={{ fontSize: 13.5, background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', marginTop: 6 }}>{rx.instructions}</div>}
            <button onClick={() => onChemist(rx)} style={{ ...btn(TEAL, NAVY), width: '100%', marginTop: 12 }}>Show at chemist</button>
          </div>
        )}
      </div>
    )
  }
  return (
    <>
      {active.length > 0 && <div style={sectionTitle}>Current</div>}
      {active.map((rx, i) => <RxCard key={rx.id} rx={rx} expanded={open === rx.id || (open === null && i === 0)} />)}
      {earlier.length > 0 && <div style={sectionTitle}>Earlier</div>}
      {earlier.map(rx => <RxCard key={rx.id} rx={rx} expanded={open === rx.id} />)}
    </>
  )
}

function BillsTab({ data, due, paid }: { data: any; due: number; paid: number }) {
  const invoices: any[] = data.invoices || []
  const clinic = data.clinic || {}
  const patient = data.patient || {}
  if (invoices.length === 0) return <Empty text="No bills yet." />
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
        <div style={{ ...card, marginBottom: 0, background: due > 0 ? AMBER_BG : '#fff', borderColor: due > 0 ? '#FDE68A' : BORDER }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: due > 0 ? AMBER : MUTED }}>Pending</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: due > 0 ? AMBER : NAVY }}>{rupees(due)}</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Paid</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEAL_DARK }}>{rupees(paid)}</div>
        </div>
      </div>
      {due > 0 && <div style={{ fontSize: 12.5, color: MUTED, margin: '8px 4px 0' }}>Pay at the clinic on your next visit. Ask the clinic for UPI details.</div>}
      <div style={sectionTitle}>All bills</div>
      {invoices.map(inv => {
        const isPaid = inv.payment_status === 'paid'
        const items: any[] = Array.isArray(inv.items) ? inv.items : []
        return (
          <div key={inv.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{fmtDate(inv.invoice_date)}</div>
                <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {items.map(it => it?.description || it?.name).filter(Boolean).join(', ') || inv.invoice_no || 'Bill'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{rupees(Number(inv.total) || 0)}</div>
                <span style={chip(isPaid ? TEAL_LIGHT : AMBER_BG, isPaid ? TEAL_DARK : AMBER)}>{isPaid ? `Paid${inv.payment_method ? ` · ${inv.payment_method}` : ''}` : inv.payment_status === 'overdue' ? 'Overdue' : 'Pending'}</span>
              </div>
            </div>
            <button
              onClick={() => downloadInvoicePdf(
                { ...inv, patients: { name: patient.name, phone: null } },
                { name: clinic.dentist_name, degree: clinic.degree, clinic_name: clinic.clinic_name, phone: clinic.phone, whatsapp: clinic.whatsapp, address: clinic.address, mci_number: clinic.mci_number, city: clinic.city, areas: clinic.area ? { name: clinic.area } : null },
              )}
              style={{ ...btn('#F1F5F9', NAVY), marginTop: 12 }}><Icon name="download" size={16} /> Download bill</button>
          </div>
        )
      })}
    </>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '32px 20px', color: MUTED, fontSize: 14.5, lineHeight: 1.5 }}>{text}</div>
  )
}

function BottomSheet({ title, onClose, children, onBack }: { title: string; onClose: () => void; children: React.ReactNode; onBack?: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 560, maxHeight: '90dvh', overflowY: 'auto', borderRadius: '20px 20px 0 0', padding: '14px 16px calc(20px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {onBack && <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: NAVY }}><Icon name="back" /></button>}
          <div style={{ flex: 1, fontWeight: 800, fontSize: 17 }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: '#F1F5F9', border: 'none', borderRadius: 99, width: 34, height: 34, cursor: 'pointer', display: 'grid', placeItems: 'center', color: NAVY }}><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function RescheduleSheet({ appt, clinic, patientId, onClose, onCancel, onDone }: { appt: any; clinic: any; patientId: string; onClose: () => void; onCancel: () => void; onDone: (msg: string) => void }) {
  const hours: WorkingHours = (appt.location_id && clinic.location_hours?.[appt.location_id]) || clinic.working_hours || null
  const today = nowInIndia().iso
  const days = useMemo(() => Array.from({ length: RESCHEDULE_DAYS_AHEAD + 1 }, (_, i) => addDaysIso(today, i)), [today])
  const firstOpen = days.find(d => (slotsForDate(hours, d) || []).length > 0) || days[0]
  const [date, setDate] = useState(firstOpen)
  const [slot, setSlot] = useState<string | null>(null)
  const [booked, setBooked] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const q = new URLSearchParams({ dentist_id: clinic.dentist_id, date })
    if (appt.location_id) q.set('location_id', appt.location_id)
    fetch(`/api/bookings/slots?${q.toString()}`)
      .then(r => r.json()).catch(() => ({ slots: [] }))
      .then(j => {
        if (!alive) return
        // This appointment's own slot shouldn't block itself on its own day.
        const list: string[] = (j?.slots || []).filter((s: string) => !(date === appt.appt_date && String(s).slice(0, 5) === String(appt.time_slot).slice(0, 5)))
        setBooked(list)
      })
    return () => { alive = false }
  }, [date, clinic.dentist_id, appt.location_id, appt.appt_date, appt.time_slot])

  const free = booked ? freeSlots(hours, date, booked) : []
  const sameAsNow = date === appt.appt_date && slot !== null && slot === String(appt.time_slot).slice(0, 5)
  const morning = (free || []).filter(s => parseInt(s, 10) < 12)
  const afternoon = (free || []).filter(s => parseInt(s, 10) >= 12 && parseInt(s, 10) < 17)
  const evening = (free || []).filter(s => parseInt(s, 10) >= 17)

  async function confirm() {
    if (!slot) return
    const s = loadPortalSession()
    if (!s) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/patient/appointments', {
        method: 'POST',
        headers: portalHeaders(),
        body: JSON.stringify({ patient_id: patientId, appointment_id: appt.id, action: 'reschedule', appt_date: date, time_slot: slot }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not move the appointment.'); setBusy(false); return }
      onDone(`Moved to ${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${slotLabel(slot)}. The clinic will confirm.`)
    } catch {
      setErr('No internet connection. Please try again.')
      setBusy(false)
    }
  }

  const slotGroup = (label: string, list: string[]) => list.length > 0 && (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {list.map(sl => {
          const on = sl === slot
          return (
            <button key={sl} onClick={() => setSlot(sl)}
              style={{ padding: '11px 0', borderRadius: 10, border: `1.5px solid ${on ? TEAL : BORDER}`, background: on ? TEAL : '#fff', color: on ? NAVY : NAVY, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              {slotLabel(sl)}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <BottomSheet title="Reschedule" onClose={onClose}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <DateTile iso={appt.appt_date} />
        <div>
          <div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Moving from</div>
          <div style={{ fontWeight: 800 }}>{fmtDate(appt.appt_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {slotLabel(appt.time_slot)}</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>{appt.treatments?.name || 'Consultation'}{clinic.dentist_name ? ` · ${drName(clinic.dentist_name)}` : ''}</div>
        </div>
      </div>

      <div style={{ fontWeight: 800, marginBottom: 8 }}>Pick a new day</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
        {days.map(d => {
          const closed = slotsForDate(hours, d) === null
          const on = d === date
          return (
            <button key={d} onClick={() => { if (closed || d === date) return; setDate(d); setBooked(null); setSlot(null) }} disabled={closed}
              style={{ flexShrink: 0, width: 56, padding: '8px 0', borderRadius: 12, border: `1.5px solid ${on ? TEAL : BORDER}`, background: on ? NAVY : closed ? '#F8FAFC' : '#fff', color: on ? '#fff' : closed ? '#CBD5E1' : NAVY, cursor: closed ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{fmtDate(d, { weekday: 'short' })}</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtDate(d, { day: 'numeric' })}</div>
              <div style={{ fontSize: 10 }}>{closed ? 'Closed' : fmtDate(d, { month: 'short' })}</div>
            </button>
          )
        })}
      </div>

      {booked === null ? (
        <div style={{ color: MUTED, fontSize: 14, padding: '12px 0' }}>Checking free times…</div>
      ) : !free || free.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 14, padding: '12px 0' }}>No free times on this day. Try another day.</div>
      ) : (
        <>
          {slotGroup('Morning', morning)}
          {slotGroup('Afternoon', afternoon)}
          {slotGroup('Evening', evening)}
        </>
      )}
      <div style={{ fontSize: 12.5, color: MUTED, margin: '4px 0 12px' }}>Only the clinic&apos;s free times are shown. The clinic gets a message and confirms the new time.</div>

      {err && <div style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, marginBottom: 10 }}>{err}</div>}
      <button onClick={confirm} disabled={!slot || busy || sameAsNow}
        style={{ ...btn(slot && !sameAsNow ? TEAL : '#CBD5E1', NAVY), width: '100%', fontSize: 15, minHeight: 50 }}>
        {busy ? 'Saving…' : slot ? `Confirm ${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${slotLabel(slot)}` : 'Pick a time'}
      </button>
      <button onClick={onCancel} style={{ ...btn('transparent', '#991B1B'), width: '100%', marginTop: 6 }}>Cancel appointment instead</button>
    </BottomSheet>
  )
}

function CancelSheet({ appt, patientId, onClose, onDone }: { appt: any; patientId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function cancel() {
    const s = loadPortalSession()
    if (!s) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/patient/appointments', {
        method: 'POST',
        headers: portalHeaders(),
        body: JSON.stringify({ patient_id: patientId, appointment_id: appt.id, action: 'cancel' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not cancel.'); setBusy(false); return }
      onDone('Appointment cancelled. The clinic has been told.')
    } catch {
      setErr('No internet connection. Please try again.')
      setBusy(false)
    }
  }
  return (
    <BottomSheet title="Cancel appointment?" onClose={onClose}>
      <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 14px' }}>
        {fmtDate(appt.appt_date, { weekday: 'long', day: 'numeric', month: 'long' })} at {slotLabel(appt.time_slot)} · {appt.treatments?.name || 'Consultation'}
      </p>
      {err && <div style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, marginBottom: 10 }}>{err}</div>}
      <button onClick={cancel} disabled={busy} style={{ ...btn('#DC2626', '#fff'), width: '100%', minHeight: 50, fontSize: 15 }}>{busy ? 'Cancelling…' : 'Yes, cancel it'}</button>
      <button onClick={onClose} style={{ ...btn('#F1F5F9', NAVY), width: '100%', marginTop: 8 }}>Keep appointment</button>
    </BottomSheet>
  )
}

// Big-text prescription for showing the chemist. Print works for a paper copy.
function ChemistView({ rx, patient, clinic, onClose }: { rx: any; patient: any; clinic: any; onClose: () => void }) {
  const meds: any[] = Array.isArray(rx.medicines) ? rx.medicines : []
  return (
    <div role="dialog" aria-modal="true" aria-label="Prescription"
      style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 70, overflowY: 'auto', padding: 'calc(env(safe-area-inset-top) + 16px) 18px 28px', fontFamily: 'var(--font-body)', color: NAVY }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{drName(clinic.dentist_name)}{clinic.degree ? `, ${clinic.degree}` : ''}</div>
            <div style={{ fontSize: 14, color: MUTED }}>{[clinic.clinic_name, clinic.mci_number ? `Reg. ${clinic.mci_number}` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: '#F1F5F9', border: 'none', borderRadius: 99, width: 40, height: 40, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="x" /></button>
        </div>
        <div style={{ fontSize: 15, borderTop: `2px solid ${NAVY}`, borderBottom: `1px solid ${BORDER}`, padding: '10px 0', marginBottom: 12 }}>
          <b>{patient.name}</b>{patient.age ? `, ${patient.age} yrs` : ''} · {fmtDate(rx.created_at)}
        </div>
        {meds.map((m, i) => (
          <div key={i} style={{ padding: '14px 0', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{i + 1}. {m.name}</div>
            <div style={{ fontSize: 19, marginTop: 4 }}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join('  ·  ')}</div>
            {m.instructions && <div style={{ fontSize: 16, color: '#334155', marginTop: 4 }}>{m.instructions}</div>}
          </div>
        ))}
        {rx.instructions && <div style={{ fontSize: 16, marginTop: 14 }}>{rx.instructions}</div>}
        <button onClick={() => window.print()} style={{ ...btn(TEAL, NAVY), width: '100%', marginTop: 20, minHeight: 50 }}>Print</button>
      </div>
    </div>
  )
}
