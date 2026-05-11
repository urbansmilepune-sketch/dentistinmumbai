'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function PatientsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [patients, setPatients] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', age: '', gender: '',
    address: '', blood_group: '', allergies: '', current_medications: '', medical_history: '',
    emergency_contact_name: '', emergency_contact_phone: '',
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) return
      setDentistId(dentist.id)
      const { data } = await supabase.from('patients').select('*').eq('dentist_id', dentist.id).order('created_at', { ascending: false })
      setPatients(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleAddPatient() {
    if (!form.name || !form.phone) { alert('Name and phone are required'); return }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('patients').insert({
      dentist_id: dentistId,
      name: form.name, phone: form.phone, email: form.email || null,
      age: form.age ? parseInt(form.age) : null, gender: form.gender || null,
      address: form.address || null, blood_group: form.blood_group || null,
      allergies: form.allergies || null, current_medications: form.current_medications || null,
      medical_history: form.medical_history || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
    }).select('*').single()
    if (!error && data) {
      setPatients(prev => [data, ...prev])
      setShowAdd(false)
      setForm({ name: '', phone: '', email: '', age: '', gender: '', address: '', blood_group: '', allergies: '', current_medications: '', medical_history: '', emergency_contact_name: '', emergency_contact_phone: '' })
    }
    setSaving(false)
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
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>{patients.length} patients total</p>
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
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 20px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
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
            <Link key={p.id} href={`/for-dentists/dashboard/patients/${p.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {p.gender === 'Female' ? '👩' : '👨'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{p.name}</span>
                    {p.allergies && <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '1px 6px', borderRadius: 10 }}>⚠️ ALLERGY</span>}
                    {p.age && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.age} yrs</span>}
                    {p.blood_group && <span style={{ fontSize: 11, color: '#7C3AED', background: '#EDE9FE', padding: '1px 6px', borderRadius: 10 }}>{p.blood_group}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 12 }}>
                    <span>📞 {p.phone}</span>
                    {p.email && <span>✉️ {p.email}</span>}
                    {p.medical_history && <span style={{ color: '#F59E0B' }}>📋 Medical history on file</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                  {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <span style={{ color: 'var(--blue)', fontSize: 18 }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
