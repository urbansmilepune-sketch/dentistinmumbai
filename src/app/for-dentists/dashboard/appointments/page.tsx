'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

type FilterKey = 'all' | 'waiting' | 'scheduled' | 'active' | 'completed' | 'cancelled'

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

function todayIsoLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tomorrowIsoLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function waLink(phone: string, text: string): string {
  return `https://wa.me/91${(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

// New state-machine values + legacy values that still appear in old rows.
// Legacy `pending` and `confirmed` are bucketed into the Scheduled tab so existing
// bookings keep flowing through the workflow without a DB migration.
const SCHEDULED_STATUSES = new Set(['scheduled', 'pending', 'confirmed'])

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: '#DBEAFE', text: '#1D4ED8', label: 'scheduled' },
  pending:   { bg: '#DBEAFE', text: '#1D4ED8', label: 'scheduled' },
  confirmed: { bg: '#DBEAFE', text: '#1D4ED8', label: 'scheduled' },
  waiting:   { bg: '#FEF3C7', text: '#92400E', label: 'waiting'   },
  active:    { bg: '#DCFCE7', text: '#166534', label: 'active'    },
  completed: { bg: '#E5E7EB', text: '#374151', label: 'completed' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'cancelled' },
  no_show:   { bg: '#F3F4F6', text: '#374151', label: 'no show'   },
}

function matchesFilter(status: string, filter: FilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'scheduled') return SCHEDULED_STATUSES.has(status)
  return status === filter
}

export default function AppointmentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [dentistMeta, setDentistMeta] = useState<{ name: string; clinic_name: string; whatsapp: string }>({ name: '', clinic_name: '', whatsapp: '' })
  const [appointments, setAppointments] = useState<any[]>([])
  const [invoicedPhones, setInvoicedPhones] = useState<Set<string>>(new Set())
  const [unpaidByPhone, setUnpaidByPhone] = useState<Map<string, number>>(new Map())
  const [filter, setFilter] = useState<FilterKey>('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [treatments, setTreatments] = useState<{ id: string; name: string }[]>([])
  const [showAdd, setShowAdd] = useState(() => searchParams.get('new') === '1')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [form, setForm] = useState({
    patient_name: '',
    patient_phone: '',
    appt_date: todayIsoLocal(),
    time_slot: '',
    treatment_id: '',
    status: 'waiting',
    notes: '',
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const { data: dentist } = await supabase
          .from('dentists')
          .select('id, name, clinic_name, whatsapp, phone')
          .eq('email', user.email)
          .single()
        if (!dentist) return
        setDentistId(dentist.id)
        setDentistMeta({
          name: dentist.name || '',
          clinic_name: dentist.clinic_name || '',
          whatsapp: dentist.whatsapp || dentist.phone || '',
        })

        const [{ data: appts }, { data: invs }, { data: tx }] = await Promise.all([
          supabase
            .from('appointments')
            .select('*, treatments(name, icon)')
            .eq('dentist_id', dentist.id)
            .order('appt_date', { ascending: false }),
          supabase
            .from('invoices')
            .select('total, payment_status, patients(phone)')
            .eq('dentist_id', dentist.id),
          supabase
            .from('dentist_treatments')
            .select('treatments(id, name)')
            .eq('dentist_id', dentist.id),
        ])

        setAppointments(appts || [])
        const phones = new Set<string>()
        const unpaid = new Map<string, number>()
        ;(invs || []).forEach((row: any) => {
          const p = row.patients?.phone
          if (!p) return
          phones.add(p)
          if (row.payment_status === 'pending' || row.payment_status === 'overdue') {
            unpaid.set(p, (unpaid.get(p) ?? 0) + Number(row.total || 0))
          }
        })
        setInvoicedPhones(phones)
        setUnpaidByPhone(unpaid)
        const tList = (tx || []).map((r: any) => r.treatments).filter(Boolean) as { id: string; name: string }[]
        setTreatments(tList)
      } finally {
        // Always release the spinner — RLS denial, missing dentist row, or
        // any thrown error in the parallel reads above must not leave the
        // page stuck on "Loading…".
        setLoading(false)
      }
    }
    load()
  }, [])

  async function addAppointment() {
    setAddError(null)
    if (!form.patient_name.trim() || !form.patient_phone.trim()) {
      setAddError('Patient name and phone are required'); return
    }
    if (!form.appt_date || !form.time_slot.trim()) {
      setAddError('Date and time are required'); return
    }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        dentist_id: dentistId,
        patient_name: form.patient_name.trim(),
        patient_phone: form.patient_phone.trim(),
        appt_date: form.appt_date,
        time_slot: form.time_slot.trim(),
        treatment_id: form.treatment_id || null,
        status: form.status,
        notes: form.notes.trim() || null,
        reference_no: generateRef(),
      })
      .select('*, treatments(name, icon)')
      .single()
    setSaving(false)
    if (error) { setAddError(error.message); return }
    setAppointments(prev => [data, ...prev])
    setShowAdd(false)
    setForm({
      patient_name: '', patient_phone: '', appt_date: todayIsoLocal(),
      time_slot: '', treatment_id: '', status: 'waiting', notes: '',
    })
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    const supabase = createClient()
    await supabase.from('appointments').update({ status }).eq('id', id)
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setUpdating(null)
  }

  const counts: Record<FilterKey, number> = {
    all: appointments.length,
    waiting:   appointments.filter(a => a.status === 'waiting').length,
    scheduled: appointments.filter(a => SCHEDULED_STATUSES.has(a.status)).length,
    active:    appointments.filter(a => a.status === 'active').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  }
  const filtered = appointments.filter(a => matchesFilter(a.status, filter))

  const TABS: { key: FilterKey; label: string }[] = [
    { key: 'all',       label: 'All'       },
    { key: 'waiting',   label: 'Waiting'   },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'active',    label: 'Active'    },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  const primaryBtn = { padding: '7px 14px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' } as const
  const secondaryBtn = { padding: '7px 12px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 } as const

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Appointments</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Manage all patient appointment requests</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '12px 22px', minHeight: 48, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          + Add Appointment
        </button>
      </div>

      {/* Add Appointment Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>New Appointment</h2>
              <button onClick={() => setShowAdd(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              {addError && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
                  {addError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Patient Name *</label>
                  <input value={form.patient_name} onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))}
                    placeholder="Walk-in patient name"
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone *</label>
                  <input value={form.patient_phone} onChange={e => setForm(f => ({ ...f, patient_phone: e.target.value }))}
                    placeholder="10-digit number"
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    <option value="waiting">Waiting (walk-in)</option>
                    <option value="scheduled">Scheduled (future)</option>
                    <option value="active">Active</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date *</label>
                  <input type="date" value={form.appt_date} onChange={e => setForm(f => ({ ...f, appt_date: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Time *</label>
                  <input type="time" value={form.time_slot} onChange={e => setForm(f => ({ ...f, time_slot: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Treatment</label>
                  <select value={form.treatment_id} onChange={e => setForm(f => ({ ...f, treatment_id: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    <option value="">— Select treatment (optional)</option>
                    {treatments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                  <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Walk-in details, chief complaint…"
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding: '12px 20px', minHeight: 48, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={addAppointment} disabled={saving}
                style={{ padding: '12px 24px', minHeight: 48, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
                {saving ? 'Saving…' : 'Create Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s', background: filter === t.key ? 'var(--blue)' : '#fff', color: filter === t.key ? '#fff' : 'var(--text)', borderColor: filter === t.key ? 'var(--blue)' : 'var(--border)' }}>
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <p style={{ color: 'var(--muted)', fontSize: 15 }}>No appointments {filter !== 'all' ? `with status "${filter}"` : 'yet'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(a => {
            const sc = STATUS_COLORS[a.status] || STATUS_COLORS.scheduled
            const isInvoiced = invoicedPhones.has(a.patient_phone)
            const isScheduled = SCHEDULED_STATUSES.has(a.status)
            const isActive = a.status === 'active'
            const isWaiting = a.status === 'waiting'
            const isCompleted = a.status === 'completed'
            const isClosed = a.status === 'completed' || a.status === 'cancelled'
            const reBookText = encodeURIComponent(`Hi ${a.patient_name}, would you like to book another appointment with us? Reply with a date and time that works for you.`)

            // 24-hour reminder eligibility: tomorrow's date AND not already closed out.
            const tomorrowIso = tomorrowIsoLocal()
            const remindable = a.appt_date === tomorrowIso && !isClosed && a.status !== 'no_show'

            // Find the next future appointment for this patient — used in the completed-visit summary.
            let nextAppt: typeof a | null = null
            if (isCompleted && a.patient_phone) {
              const candidates = appointments.filter((x: any) =>
                x.patient_phone === a.patient_phone &&
                x.id !== a.id &&
                !['completed', 'cancelled', 'no_show'].includes(x.status) &&
                (x.appt_date > a.appt_date ||
                  (x.appt_date === a.appt_date && (x.time_slot || '') > (a.time_slot || '')))
              )
              if (candidates.length > 0) {
                nextAppt = candidates.reduce((earliest: any, cur: any) => {
                  const e = `${earliest.appt_date}T${earliest.time_slot ?? '00:00'}`
                  const c = `${cur.appt_date}T${cur.time_slot ?? '00:00'}`
                  return c < e ? cur : earliest
                })
              }
            }

            const amountDue = unpaidByPhone.get(a.patient_phone) ?? 0
            const treatmentLabel = a.treatments?.name || 'Consultation'
            const clinicWa = dentistMeta.whatsapp

            const summaryLines = [
              `Hi ${a.patient_name},`,
              '',
              `Thank you for visiting ${dentistMeta.clinic_name || 'our clinic'} today. Here's a summary of your appointment:`,
              '',
              `🦷 Treatment: ${treatmentLabel}`,
              nextAppt ? `📅 Next visit: ${formatDateLong(nextAppt.appt_date)} at ${nextAppt.time_slot}` : '',
              amountDue > 0 ? `💰 Pending payment: ₹${amountDue.toLocaleString('en-IN')}` : '',
              '',
              clinicWa ? `For any questions, WhatsApp us at +91 ${clinicWa}.` : '',
              '',
              `— ${dentistMeta.name || 'Your dentist'}`,
            ].filter(Boolean).join('\n')

            const reminderLines = [
              `Hi ${a.patient_name},`,
              '',
              `Friendly reminder: your appointment with ${dentistMeta.name || 'your dentist'} at ${dentistMeta.clinic_name || 'our clinic'} is tomorrow (${formatDateLong(a.appt_date)}) at ${a.time_slot}.`,
              '',
              clinicWa
                ? `See you then! WhatsApp us at +91 ${clinicWa} if you need to reschedule.`
                : 'See you then!',
            ].join('\n')

            return (
              <div key={a.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{a.patient_name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
                    <span title={isInvoiced ? 'Patient has at least one invoice' : 'No invoice yet'}
                      style={{ fontSize: 14, fontWeight: 700, color: isInvoiced ? '#166534' : '#9CA3AF' }}>₹</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{a.reference_no}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>📞 {a.patient_phone}</span>
                    <span>📅 {new Date(a.appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span>🕐 {a.time_slot}</span>
                    {a.treatments?.name && <span>🦷 {a.treatments.name}</span>}
                  </div>
                  {a.notes && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>"{a.notes}"</p>}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* State-machine primary action */}
                  {isScheduled && (
                    <button onClick={() => updateStatus(a.id, 'waiting')} disabled={updating === a.id}
                      style={{ ...primaryBtn, background: '#FEF3C7', color: '#92400E' }}>
                      ▶ Start
                    </button>
                  )}
                  {isWaiting && (
                    <button onClick={() => updateStatus(a.id, 'active')} disabled={updating === a.id}
                      style={{ ...primaryBtn, background: '#DCFCE7', color: '#166534' }}>
                      ✓ Check In
                    </button>
                  )}
                  {isActive && (
                    <a href="/for-dentists/dashboard/billing"
                      style={{ ...primaryBtn, background: 'var(--blue)', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                      🧾 Invoice
                    </a>
                  )}
                  {isClosed && (
                    <a href={`https://wa.me/91${(a.patient_phone || '').replace(/\D/g, '')}?text=${reBookText}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ ...primaryBtn, background: '#E0E7FF', color: '#3730A3', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                      ↺ Book Again
                    </a>
                  )}

                  {/* 24-hour reminder */}
                  {remindable && a.patient_phone && (
                    <a href={waLink(a.patient_phone, reminderLines)}
                      target="_blank" rel="noopener noreferrer"
                      title="Send WhatsApp reminder — appointment is tomorrow"
                      style={{ ...primaryBtn, background: '#F59E0B', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ⏰ Send Reminder
                    </a>
                  )}

                  {/* Post-completion summary */}
                  {isCompleted && a.patient_phone && (
                    <a href={waLink(a.patient_phone, summaryLines)}
                      target="_blank" rel="noopener noreferrer"
                      title="Send WhatsApp summary of this completed visit"
                      style={{ ...primaryBtn, background: '#25D366', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ✉️ Send Summary
                    </a>
                  )}

                  {/* Cancel — kept as a small secondary so live appointments aren't uncancellable */}
                  {!isClosed && (
                    <button onClick={() => updateStatus(a.id, 'cancelled')} disabled={updating === a.id}
                      title="Cancel appointment"
                      style={{ ...secondaryBtn, color: '#991B1B', borderColor: '#FECACA' }}>
                      ✕
                    </button>
                  )}

                  {/* Contact */}
                  <a href={`tel:${a.patient_phone}`} style={secondaryBtn}>📞 Call</a>
                  {a.patient_phone && (
                    <a href={`https://wa.me/91${a.patient_phone.replace(/\D/g, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ ...secondaryBtn, color: '#166534', borderColor: '#BBF7D0' }}>
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
