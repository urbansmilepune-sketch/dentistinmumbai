'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type FilterKey = 'all' | 'waiting' | 'scheduled' | 'active' | 'completed' | 'cancelled'

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
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [appointments, setAppointments] = useState<any[]>([])
  const [invoicedPhones, setInvoicedPhones] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<FilterKey>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) return
      setDentistId(dentist.id)

      const [{ data: appts }, { data: invs }] = await Promise.all([
        supabase
          .from('appointments')
          .select('*, treatments(name, icon)')
          .eq('dentist_id', dentist.id)
          .order('appt_date', { ascending: false }),
        supabase
          .from('invoices')
          .select('patients(phone)')
          .eq('dentist_id', dentist.id),
      ])

      setAppointments(appts || [])
      const phones = new Set<string>()
      ;(invs || []).forEach((row: any) => {
        const p = row.patients?.phone
        if (p) phones.add(p)
      })
      setInvoicedPhones(phones)
      setLoading(false)
    }
    load()
  }, [])

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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Appointments</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Manage all patient appointment requests</p>
      </div>

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
            const isClosed = a.status === 'completed' || a.status === 'cancelled'
            const reBookText = encodeURIComponent(`Hi ${a.patient_name}, would you like to book another appointment with us? Reply with a date and time that works for you.`)

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
