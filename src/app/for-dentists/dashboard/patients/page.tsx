'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function PatientsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [patients, setPatients] = useState<any[]>([])
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
        const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
        if (!dentist) return
        setDentistId(dentist.id)
        const { data } = await supabase.from('patients').select('*').eq('dentist_id', dentist.id).order('created_at', { ascending: false })
        setPatients(data || [])
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
    if (!form.name || !form.phone) { setSaveError('Name and phone are required'); return }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('patients').insert({
      dentist_id: dentistId,
      name: form.name, phone: form.phone, email: form.email || null,
      age: form.age ? parseInt(form.age) : null, gender: form.gender || null,
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

  const filtered = patients.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.phone?.includes(search)
  )

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, display: 'block' as const, marginBottom: 4, color: 'var(--text)' }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading patients...</p></div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Patient Records</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>{patients.length} {patients.length === 1 ? 'patient' : 'patients'} total</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." style={{ ...inputStyle, width: 220 }} />
          <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>+ Add Patient</button>
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
              <button onClick={handleAddPatient} disabled={saving} style={{ padding: '10px 24px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Add Patient'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Patient list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
            {search ? 'No patients found' : 'No patients yet'}
          </h3>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{search ? 'Try a different search' : 'Add your first patient to get started'}</p>
          {!search && <button onClick={() => setShowAdd(true)} style={{ padding: '11px 24px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Add First Patient</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(p => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.15s', flexWrap: 'wrap' }}>
              {/* The avatar + identity strip stays a click-target for the
                  full patient record. The right-hand action buttons are
                  rendered as separate Links so they don't nest inside the
                  outer Link (which broke hydration when this row was a
                  single Link). */}
              <Link href={`/for-dentists/dashboard/patients/${p.id}`}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none', color: 'inherit', minWidth: 240 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {p.gender === 'Female' ? '👩' : '👨'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{p.name}</span>
                    {p.allergies && <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '1px 6px', borderRadius: 10 }}>⚠️ ALLERGY</span>}
                    {p.age && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.age} yrs</span>}
                    {p.blood_group && <span style={{ fontSize: 11, color: '#7C3AED', background: '#EDE9FE', padding: '1px 6px', borderRadius: 10 }}>{p.blood_group}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📞 {p.phone}</span>
                    {p.email && <span>✉️ {p.email}</span>}
                    {p.medical_history && <span style={{ color: '#F59E0B' }}>📋 Medical history on file</span>}
                  </div>
                </div>
              </Link>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href={`/for-dentists/dashboard/patients/${p.id}?tab=treatments`}
                  title="Open the Visits/Treatments tab"
                  style={{ padding: '7px 12px', background: '#DCFCE7', color: '#166534', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  🩺 Start Consultation
                </Link>
                <Link href={`/for-dentists/dashboard/patients/${p.id}?tab=timeline`}
                  title="Open patient timeline"
                  style={{ padding: '7px 12px', background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  📋 View History
                </Link>
                <Link href={`/for-dentists/dashboard/billing?patient_id=${p.id}`}
                  title="New invoice for this patient"
                  style={{ padding: '7px 12px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  🧾 New Invoice
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
