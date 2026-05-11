'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E' },
  confirmed: { bg: '#DBEAFE', text: '#1D4ED8' },
  completed: { bg: '#DCFCE7', text: '#166534' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  no_show:   { bg: '#F3F4F6', text: '#374151' },
}

export default function AppointmentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [appointments, setAppointments] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) return
      setDentistId(dentist.id)
      const { data } = await supabase
        .from('appointments')
        .select('*, treatments(name, icon)')
        .eq('dentist_id', dentist.id)
        .order('appt_date', { ascending: false })
      setAppointments(data || [])
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

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter)
  const counts = { all: appointments.length, pending: appointments.filter(a => a.status === 'pending').length, confirmed: appointments.filter(a => a.status === 'confirmed').length, completed: appointments.filter(a => a.status === 'completed').length }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Appointments</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Manage all patient appointment requests</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['all', 'All'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['completed', 'Completed']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s', background: filter === key ? 'var(--blue)' : '#fff', color: filter === key ? '#fff' : 'var(--text)', borderColor: filter === key ? 'var(--blue)' : 'var(--border)' }}>
            {label} ({counts[key as keyof typeof counts] || 0})
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
            const sc = STATUS_COLORS[a.status] || STATUS_COLORS.pending
            return (
              <div key={a.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{a.patient_name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{a.status}</span>
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {a.status === 'pending' && (
                    <button onClick={() => updateStatus(a.id, 'confirmed')} disabled={updating === a.id}
                      style={{ padding: '7px 14px', background: '#DBEAFE', color: '#1D4ED8', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      Confirm
                    </button>
                  )}
                  {(a.status === 'pending' || a.status === 'confirmed') && (
                    <button onClick={() => updateStatus(a.id, 'completed')} disabled={updating === a.id}
                      style={{ padding: '7px 14px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      Complete
                    </button>
                  )}
                  {a.status !== 'cancelled' && a.status !== 'completed' && (
                    <button onClick={() => updateStatus(a.id, 'cancelled')} disabled={updating === a.id}
                      style={{ padding: '7px 14px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      Cancel
                    </button>
                  )}
                  <a href={`tel:${a.patient_phone}`}
                    style={{ padding: '7px 14px', background: 'var(--bg)', color: 'var(--blue)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    📞 Call
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
