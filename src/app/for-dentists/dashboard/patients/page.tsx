'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { TEAL, TEAL_DARK, TEAL_SOFT, NAVY } from '@/app/dentist/[slug]/profileTheme'
import { SearchIcon, PlusIcon, ChevronIcon } from '../dashIcons'

// PostgREST returns at most 1000 rows per request; walk the range so large
// clinics still see every patient.
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) { console.error('[patients] load failed', error.message); break }
    out.push(...(data || []))
    if (!data || data.length < size) break
  }
  return out
}

function istTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function timeLabel(slot: string | null | undefined): string {
  if (!slot) return ''
  const [h, m] = slot.split(':').map(Number)
  if (isNaN(h)) return slot
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function initialsOf(name: string | null | undefined): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

type Filter = 'all' | 'today' | 'unpaid'
type LastVisit = { date: string; what: string }
type TodayInfo = { time: string; what: string }

export default function PatientsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [patients, setPatients] = useState<any[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [lastVisit, setLastVisit] = useState<Record<string, LastVisit>>({})
  const [dueByPatient, setDueByPatient] = useState<Record<string, number>>({})
  const [todayByPatient, setTodayByPatient] = useState<Record<string, TodayInfo>>({})
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(() => searchParams.get('new') === '1')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', age: '', gender: '', date_of_birth: '',
    address: '', blood_group: '', allergies: '', current_medications: '', medical_history: '',
    emergency_contact_name: '', emergency_contact_phone: '',
  })

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const dentist = await resolveCurrentDentist<{ id: string }>(supabase, 'id')
        if (!dentist) return
        setDentistId(dentist.id)
        const todayIso = istTodayIso()
        const [rows, visitRows, invoiceRows, todayRows] = await Promise.all([
          fetchAll<any>((from, to) => supabase.from('patients').select('*').eq('dentist_id', dentist.id).order('created_at', { ascending: false }).range(from, to)),
          fetchAll<any>((from, to) => supabase.from('visits').select('patient_id, visit_date, chief_complaint, treatment_done').eq('dentist_id', dentist.id).order('visit_date', { ascending: false }).range(from, to)),
          fetchAll<any>((from, to) => supabase.from('invoices').select('patient_id, total').eq('dentist_id', dentist.id).in('payment_status', ['pending', 'overdue']).range(from, to)),
          fetchAll<any>((from, to) => supabase.from('appointments').select('patient_id, patient_phone, time_slot, status, treatments(name)').eq('dentist_id', dentist.id).eq('appt_date', todayIso).order('time_slot', { ascending: true }).range(from, to)),
        ])
        setPatients(rows)

        // Latest visit per patient (rows arrive newest first).
        const lv: Record<string, LastVisit> = {}
        for (const v of visitRows) {
          if (!v.patient_id || lv[v.patient_id]) continue
          const what = String(v.treatment_done || v.chief_complaint || '').split(/[.\n]/)[0].trim()
          lv[v.patient_id] = { date: v.visit_date, what: what.length > 40 ? `${what.slice(0, 40)}…` : what }
        }
        setLastVisit(lv)

        const due: Record<string, number> = {}
        for (const inv of invoiceRows) {
          if (!inv.patient_id) continue
          due[inv.patient_id] = (due[inv.patient_id] || 0) + Number(inv.total || 0)
        }
        setDueByPatient(due)

        // Today's appointments, matched by patient_id or (for walk-ins
        // booked without one) by phone number.
        const byPhone: Record<string, string> = {}
        for (const p of rows) if (p.phone) byPhone[p.phone] = p.id
        const td: Record<string, TodayInfo> = {}
        for (const a of todayRows) {
          if (a.status === 'cancelled') continue
          const pid = a.patient_id || (a.patient_phone ? byPhone[a.patient_phone] : undefined)
          if (!pid || td[pid]) continue
          td[pid] = { time: timeLabel(a.time_slot), what: a.treatments?.name || '' }
        }
        setTodayByPatient(td)
      } finally {
        // Always release the spinner so RLS denial or a missing dentist row
        // doesn't strand the page on "Loading…".
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleAddPatient() {
    setSaveError(null)
    if (!form.name.trim() || !form.phone.trim()) { setSaveError('Name and phone are required'); return }
    if (saving) return
    // The modal can open (?new=1) before the clinic has loaded; inserting
    // with an empty dentist_id fails with a confusing uuid error.
    if (!dentistId) { setSaveError('Still loading your clinic. Please wait a second and tap Add Patient again.'); return }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('patients').insert({
      dentist_id: dentistId,
      name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || null,
      age: form.age ? parseInt(form.age, 10) || null : null, gender: form.gender || null,
      // date_of_birth feeds the birthday-wishes cron — required for the
      // automatic greeting to fire. age stays alongside because some
      // dentists only know the age, not the exact DOB.
      date_of_birth: form.date_of_birth || null,
      address: form.address || null, blood_group: form.blood_group || null,
      allergies: form.allergies || null, current_medications: form.current_medications || null,
      medical_history: form.medical_history || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
    }).select('*').single()
    setSaving(false)
    if (error || !data) {
      // Previously this branch silently no-op'd — the Saving… spinner
      // would clear and the modal stayed open with no feedback, which
      // looked exactly like a broken submit button. Surface the actual
      // failure reason so the dentist knows what to fix.
      setSaveError(error?.message || 'Could not save patient. Please try again.')
      return
    }
    setPatients(prev => [data, ...prev])
    setShowAdd(false)
    setForm({ name: '', phone: '', email: '', age: '', gender: '', date_of_birth: '', address: '', blood_group: '', allergies: '', current_medications: '', medical_history: '', emergency_contact_name: '', emergency_contact_phone: '' })
  }

  const q = search.trim().toLowerCase()
  const matchesSearch = (p: any) => !q
    || p.name?.toLowerCase().includes(q)
    || String(p.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000')
    || String(p.uhid || '').toLowerCase().includes(q)
  const counts = {
    all: patients.length,
    today: patients.filter(p => todayByPatient[p.id]).length,
    unpaid: patients.filter(p => (dueByPatient[p.id] || 0) > 0).length,
  }
  const filtered = patients.filter(p =>
    matchesSearch(p)
    && (filter === 'all' || (filter === 'today' && todayByPatient[p.id]) || (filter === 'unpaid' && (dueByPatient[p.id] || 0) > 0))
  )

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, display: 'block' as const, marginBottom: 4, color: 'var(--text)' }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading patients...</p></div>

  return (
    <div>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 12, marginBottom: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: 0 }}>Patients</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <label htmlFor="patient-search" style={{ flex: 1, height: 46, border: '1.5px solid var(--border)', borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', color: 'var(--muted)' }}>
            <SearchIcon />
            <input id="patient-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, phone or patient ID"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'var(--font-body)', background: 'transparent', color: 'var(--text)' }} />
          </label>
          <button onClick={() => setShowAdd(true)} style={{ height: 46, padding: '0 16px', background: TEAL, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon size={16} /> Add
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as any }}>
          {([
            { key: 'all' as const, label: `All ${counts.all}` },
            { key: 'today' as const, label: `Today ${counts.today}` },
            { key: 'unpaid' as const, label: `Unpaid ${counts.unpaid}` },
          ]).map(c => (
            <button key={c.key} type="button" onClick={() => setFilter(c.key)} aria-pressed={filter === c.key}
              style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'var(--font-body)', border: `1px solid ${filter === c.key ? NAVY : 'var(--border)'}`, background: filter === c.key ? NAVY : '#fff', color: filter === c.key ? '#fff' : 'var(--text)' }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add Patient Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '28px', width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20 }}>New Patient</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Patient name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone *</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit number" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Age</label>
                <input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="Years" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Gender</label>
                <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select</option>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Date of Birth</label>
                <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} style={inputStyle} />
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Unlocks automatic birthday wishes 🎂</div>
              </div>
              <div>
                <label style={labelStyle}>Blood Group</label>
                <select value={form.blood_group} onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Patient address" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ ...labelStyle, color: '#EF4444' }}>⚠️ Allergies</label>
                <input value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} placeholder="e.g. Penicillin, Latex, Aspirin" style={{ ...inputStyle, borderColor: form.allergies ? '#EF4444' : 'var(--border)' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Current Medications</label>
                <input value={form.current_medications} onChange={e => setForm(f => ({ ...f, current_medications: e.target.value }))} placeholder="e.g. Metformin, Warfarin" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Medical History</label>
                <textarea value={form.medical_history} onChange={e => setForm(f => ({ ...f, medical_history: e.target.value }))} placeholder="Diabetes, hypertension, heart conditions, previous surgeries..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>Emergency Contact Name</label>
                <input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} placeholder="Name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Emergency Contact Phone</label>
                <input value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} placeholder="Phone" style={inputStyle} />
              </div>
            </div>
            {saveError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginTop: 14 }}>
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdd(false); setSaveError(null) }} style={{ padding: '10px 20px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={handleAddPatient} disabled={saving} style={{ padding: '10px 24px', background: TEAL, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Add Patient'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Patient list: one row per patient, tap to open the record. */}
      {filtered.length === 0 ? (
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
            {search || filter !== 'all' ? 'No patients match' : 'No patients yet'}
          </h3>
          <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: 14 }}>
            {search || filter !== 'all' ? 'Try a different search or filter.' : 'Add your first patient to get started.'}
          </p>
          {!search && filter === 'all' && <button onClick={() => setShowAdd(true)} style={{ padding: '11px 22px', background: TEAL, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Add first patient</button>}
        </div>
      ) : (
        <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          {filtered.map((p, i) => {
            const today = todayByPatient[p.id]
            const lv = lastVisit[p.id]
            const due = dueByPatient[p.id] || 0
            const sub = [p.age ? `${p.age} yrs` : null, p.gender ? String(p.gender)[0] : null, p.phone].filter(Boolean).join(' · ')
            const line = today
              ? `Today ${today.time}${today.what ? ` · ${today.what}` : ''}`
              : lv ? `Last visit ${shortDate(lv.date)}${lv.what ? ` · ${lv.what}` : ''}` : 'No visits yet'
            return (
              <Link key={p.id} href={`/for-dentists/dashboard/patients/${p.id}`}
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit', minHeight: 64 }}>
                <span style={{ width: 40, height: 40, borderRadius: '50%', background: TEAL_SOFT, color: TEAL_DARK, fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialsOf(p.name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 15, color: 'var(--text)' }}>{p.name}</b>
                    {p.allergies && <span title={`Allergy: ${p.allergies}`} style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', borderRadius: 999, padding: '1px 7px' }}>Allergy</span>}
                    {!p.allergies && p.medical_history && <span title={p.medical_history} style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 999, padding: '1px 7px' }}>Medical history</span>}
                  </span>
                  {sub && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{sub}</span>}
                  <span style={{ display: 'block', fontSize: 12, color: today ? TEAL_DARK : 'var(--text)', fontWeight: today ? 700 : 400, marginTop: 1 }}>
                    {line}
                    {due > 0 && <span style={{ color: '#B45309', fontWeight: 700 }}> · ₹{due.toLocaleString('en-IN')} due</span>}
                  </span>
                </span>
                <span style={{ color: '#94A3B8', display: 'flex', flexShrink: 0 }}><ChevronIcon /></span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
