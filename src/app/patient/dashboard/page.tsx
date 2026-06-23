'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadPortalSession, setSelectedClinic, clearPortalSession, type PortalClinic } from '@/lib/patientSession'
import { downloadInvoicePdf } from '@/lib/invoicePdf'

const TEAL = '#0D9488'
const TEAL_DARK = '#0F766E'
const TEAL_LIGHT = '#CCFBF1'

type TabKey = 'appointments' | 'prescriptions' | 'invoices' | 'visits'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'appointments', label: 'Appointments', icon: '📅' },
  { key: 'prescriptions', label: 'Prescriptions', icon: '💊' },
  { key: 'invoices', label: 'Invoices', icon: '🧾' },
  { key: 'visits', label: 'My Visits', icon: '🦷' },
]

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// "10:30 AM" → { h: 10, m: 30 } in 24h. Falls back to 09:00 on a parse miss.
function parseSlot(slot: string): { h: number; m: number } {
  const m = String(slot || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return { h: 9, m: 0 }
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const mer = (m[3] || '').toUpperCase()
  if (mer === 'PM' && h < 12) h += 12
  if (mer === 'AM' && h === 12) h = 0
  return { h, m: min }
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function downloadIcs(appt: any, clinic: any) {
  const { h, m } = parseSlot(appt.time_slot)
  const [y, mo, d] = String(appt.appt_date).split('-').map((x: string) => parseInt(x, 10))
  const start = `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`
  const endMin = m + 30
  const end = `${y}${pad(mo)}${pad(d)}T${pad(h + Math.floor(endMin / 60))}${pad(endMin % 60)}00`
  const title = `Dental appointment — ${appt.treatments?.name || 'Consultation'}`
  const loc = [clinic?.clinic_name, clinic?.address, clinic?.city].filter(Boolean).join(', ')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DentistIn//Patient Portal//EN',
    'BEGIN:VEVENT',
    `UID:${appt.id}@dentistin`,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${title}`,
    loc ? `LOCATION:${loc.replace(/,/g, '\\,')}` : '',
    appt.reference_no ? `DESCRIPTION:Reference: ${appt.reference_no}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean)
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
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

export default function PatientDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('appointments')
  const [data, setData] = useState<any>(null)
  const [clinics, setClinics] = useState<PortalClinic[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [expandedRx, setExpandedRx] = useState<string | null>(null)

  const fetchData = useCallback(async (token: string, patientId: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/patient/data', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ patient_id: patientId }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) { clearPortalSession(); router.replace('/patient'); return }
      if (!res.ok) { setError(body.error || 'Could not load your records.'); return }
      setData(body)
      if (Array.isArray(body.clinics) && body.clinics.length) setClinics(body.clinics)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const s = loadPortalSession()
    if (!s) { router.replace('/patient'); return }
    setClinics(s.clinics || [])
    setSelectedId(s.selectedPatientId)
    fetchData(s.token, s.selectedPatientId)
  }, [router, fetchData])

  function switchClinic(patientId: string) {
    const s = loadPortalSession()
    if (!s) { router.replace('/patient'); return }
    setSelectedId(patientId)
    setSelectedClinic(patientId)
    setExpandedRx(null)
    setTab('appointments')
    fetchData(s.token, patientId)
  }

  function logout() {
    clearPortalSession()
    router.replace('/patient')
  }

  if (loading) {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'var(--font-body)', color: '#64748B', fontSize: 16 }}>Loading your records…</div>
  }

  if (error) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'var(--font-body)', padding: 24, textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: 40 }}>😕</div>
        <p style={{ color: '#991B1B', fontSize: 16, maxWidth: 360 }}>{error}</p>
        <button onClick={logout} style={{ padding: '12px 24px', background: TEAL, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Back to login</button>
      </div>
    )
  }

  const clinic = data?.clinic || {}
  const patient = data?.patient || {}
  const appointments = data?.appointments || []
  const prescriptions = data?.prescriptions || []
  const invoices = data?.invoices || []
  const visits = data?.visits || []

  const outstanding = invoices
    .filter((i: any) => i.payment_status !== 'paid')
    .reduce((sum: number, i: any) => sum + (Number(i.total) || 0), 0)

  const counts: Record<TabKey, number> = {
    appointments: appointments.length,
    prescriptions: prescriptions.length,
    invoices: invoices.length,
    visits: visits.length,
  }

  const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18, marginBottom: 12 }
  const pillBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none', border: 'none' }

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', fontFamily: 'var(--font-body)', color: '#0F172A' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <a href="/" title="Home"><img src="/logo-india.webp" alt="DentistIn" style={{ height: 32, objectFit: 'contain' }} /></a>
          <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.name || 'Patient'}</div>
            <div style={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clinic.clinic_name || clinic.dentist_name || ''}</div>
          </div>
          <button onClick={logout} style={{ ...pillBtn, background: '#F1F5F9', color: '#475569', padding: '8px 12px' }}>Logout</button>
        </div>

        {/* Clinic switcher — only when the same number belongs to >1 clinic */}
        {clinics.length > 1 && (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px 12px' }}>
            <select value={selectedId} onChange={e => switchClinic(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid #CBD5E1', fontSize: 15, fontFamily: 'var(--font-body)', background: '#fff' }}>
              {clinics.map(c => (
                <option key={c.patient_id} value={c.patient_id}>{c.clinic_name || c.dentist_name || 'Clinic'}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '16px 16px 60px' }}>
        {/* Greeting */}
        <div style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`, color: '#fff', borderRadius: 18, padding: '20px 22px', marginBottom: 18 }}>
          <div style={{ fontSize: 15, opacity: 0.9 }}>Welcome back,</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginTop: 2 }}>{patient.name || 'Patient'}</div>
          <div style={{ fontSize: 14, opacity: 0.95, marginTop: 6 }}>
            {clinic.clinic_name || (clinic.dentist_name ? `Dr. ${String(clinic.dentist_name).replace(/^dr\.?\s*/i, '')}` : 'Your clinic')}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto', paddingBottom: 4 }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: '1 0 auto', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${active ? TEAL : '#E2E8F0'}`, background: active ? TEAL : '#fff', color: active ? '#fff' : '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                {t.icon} {t.label} ({counts[t.key]})
              </button>
            )
          })}
        </div>

        {/* APPOINTMENTS */}
        {tab === 'appointments' && (
          appointments.length === 0 ? (
            <EmptyState icon="📅" text="No upcoming appointments. Call your dentist to book." actionPhone={clinic.phone} />
          ) : appointments.map((a: any) => {
            const isConfirmed = a.status === 'confirmed'
            return (
              <div key={a.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{fmtDate(a.appt_date)}</div>
                    <div style={{ fontSize: 15, color: '#475569', marginTop: 2 }}>🕐 {a.time_slot}</div>
                    <div style={{ fontSize: 15, color: '#0F172A', marginTop: 4, fontWeight: 600 }}>🦷 {a.treatments?.name || 'Consultation'}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: isConfirmed ? TEAL_LIGHT : '#FEF3C7', color: isConfirmed ? TEAL_DARK : '#92400E' }}>
                    {isConfirmed ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <button onClick={() => downloadIcs(a, clinic)} style={{ ...pillBtn, background: TEAL_LIGHT, color: TEAL_DARK }}>📆 Add to Calendar</button>
                  <a href={directionsUrl(clinic)} target="_blank" rel="noopener noreferrer" style={{ ...pillBtn, background: '#EEF2FF', color: '#3730A3' }}>📍 Get Directions</a>
                </div>
              </div>
            )
          })
        )}

        {/* PRESCRIPTIONS */}
        {tab === 'prescriptions' && (
          prescriptions.length === 0 ? (
            <EmptyState icon="💊" text="No prescriptions yet. They'll appear here after your dentist writes one." />
          ) : prescriptions.map((rx: any) => {
            const note = rx.template_used || rx.instructions || 'Prescription'
            const count = Array.isArray(rx.medicines) ? rx.medicines.length : 0
            const open = expandedRx === rx.id
            return (
              <div key={rx.id} style={cardStyle}>
                <button onClick={() => setExpandedRx(open ? null : rx.id)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtDate(rx.created_at)}</div>
                    <div style={{ fontSize: 14, color: '#64748B', marginTop: 2 }}>{note} · {count} medicine{count === 1 ? '' : 's'}</div>
                  </div>
                  <span style={{ fontSize: 20, color: TEAL_DARK }}>{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div style={{ marginTop: 14 }}>
                    {count > 0 && (Array.isArray(rx.medicines) ? rx.medicines : []).map((m: any, i: number) => (
                      <div key={i} style={{ borderTop: '1px solid #E2E8F0', padding: '10px 0' }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
                        <div style={{ fontSize: 14, color: '#475569', marginTop: 2 }}>
                          {[m.dosage && `Dosage: ${m.dosage}`, m.frequency && `Freq: ${m.frequency}`, m.duration && `Duration: ${m.duration}`].filter(Boolean).join(' · ')}
                        </div>
                        {m.instructions && <div style={{ fontSize: 14, color: '#64748B', marginTop: 2 }}>📝 {m.instructions}</div>}
                      </div>
                    ))}
                    {rx.instructions && <div style={{ fontSize: 14, color: '#475569', background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', marginTop: 10 }}>📝 {rx.instructions}</div>}
                    <a href={`/api/prescriptions/pdf?id=${rx.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ ...pillBtn, background: TEAL, color: '#fff', marginTop: 14 }}>📄 Download PDF</a>
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* INVOICES */}
        {tab === 'invoices' && (
          <>
            {outstanding > 0 && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 14, padding: '14px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#92400E' }}>Amount outstanding</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: '#92400E' }}>₹{outstanding.toLocaleString('en-IN')}</span>
              </div>
            )}
            {invoices.length === 0 ? (
              <EmptyState icon="🧾" text="No invoices yet." />
            ) : invoices.map((inv: any) => {
              const paid = inv.payment_status === 'paid'
              return (
                <div key={inv.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{inv.invoice_no || 'Invoice'}</div>
                      <div style={{ fontSize: 14, color: '#64748B', marginTop: 2 }}>{fmtDate(inv.invoice_date)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>₹{Number(inv.total || 0).toLocaleString('en-IN')}</div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: paid ? TEAL_LIGHT : '#FEF3C7', color: paid ? TEAL_DARK : '#92400E', display: 'inline-block', marginTop: 4 }}>
                        {paid ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadInvoicePdf(
                      { ...inv, patients: { name: patient.name, phone: null } },
                      { name: clinic.dentist_name, degree: clinic.degree, clinic_name: clinic.clinic_name, phone: clinic.phone, whatsapp: clinic.whatsapp, address: clinic.address, mci_number: clinic.mci_number, city: clinic.city, areas: clinic.area ? { name: clinic.area } : null },
                    )}
                    style={{ ...pillBtn, background: TEAL, color: '#fff', marginTop: 14 }}>📄 Download PDF</button>
                </div>
              )
            })}
          </>
        )}

        {/* VISITS */}
        {tab === 'visits' && (
          visits.length === 0 ? (
            <EmptyState icon="🦷" text="No visit history yet." />
          ) : visits.map((v: any) => (
            <div key={v.id} style={cardStyle}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, marginBottom: 6 }}>📅 {fmtDate(v.visit_date)}</div>
              {v.chief_complaint && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8' }}>COMPLAINT</span><div style={{ fontSize: 15, marginTop: 2 }}>{v.chief_complaint}</div></div>}
              {v.treatment_done && <div><span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8' }}>TREATMENT</span><div style={{ fontSize: 15, marginTop: 2 }}>{v.treatment_done}</div></div>}
              {!v.chief_complaint && !v.treatment_done && v.clinical_findings && <div style={{ fontSize: 15 }}>{v.clinical_findings}</div>}
            </div>
          ))
        )}
      </main>
    </div>
  )
}

function EmptyState({ icon, text, actionPhone }: { icon: string; text: string; actionPhone?: string | null }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>{icon}</div>
      <p style={{ color: '#64748B', fontSize: 16, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>{text}</p>
      {actionPhone && (
        <a href={`tel:${actionPhone}`} style={{ display: 'inline-block', marginTop: 16, padding: '12px 22px', background: '#0D9488', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: 'none', fontFamily: 'var(--font-body)' }}>📞 Call Clinic</a>
      )}
    </div>
  )
}
