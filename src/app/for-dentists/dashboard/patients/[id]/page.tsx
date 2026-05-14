'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import DentalChart from '@/components/DentalChart'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '👤' },
  { id: 'visits', label: 'Visit Notes', icon: '📋' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
  { id: 'plans', label: 'Treatment Plans', icon: '🦷' },
  { id: 'emr', label: 'EMR', icon: '🏥' },
  { id: 'chart', label: 'Dental Chart', icon: '🦷' },
  { id: 'xrays', label: 'X-Ray Vault', icon: '🩻' },
]

const PRESCRIPTION_TEMPLATES = {
  'Post-RCT': [
    { name: 'Amoxicillin 500mg', dosage: '1-0-1', duration: '5 days', instructions: 'After food' },
    { name: 'Ibuprofen 400mg', dosage: '1-1-1', duration: '3 days', instructions: 'After food' },
    { name: 'Metronidazole 400mg', dosage: '1-0-1', duration: '5 days', instructions: 'After food' },
  ],
  'Post-Extraction': [
    { name: 'Amoxicillin 500mg', dosage: '1-0-1', duration: '5 days', instructions: 'After food' },
    { name: 'Ibuprofen 400mg', dosage: '1-1-1', duration: '3 days', instructions: 'After food' },
    { name: 'Betadine Mouthwash', dosage: 'Rinse twice daily', duration: '5 days', instructions: 'Dilute with water' },
  ],
  'Teeth Whitening': [
    { name: 'Sensodyne Toothpaste', dosage: 'Twice daily', duration: '2 weeks', instructions: 'Use instead of regular toothpaste' },
    { name: 'Fluoride Gel', dosage: 'Once daily', duration: '2 weeks', instructions: 'Apply for 5 mins, do not rinse' },
  ],
}

export default function PatientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [dentistName, setDentistName] = useState('')
  const [patient, setPatient] = useState<any>(null)
  const [visits, setVisits] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [xrays, setXrays] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('overview')
  const [showAddVisit, setShowAddVisit] = useState(false)
  const [showAddRx, setShowAddRx] = useState(false)
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [saving, setSaving] = useState(false)

  const [visitForm, setVisitForm] = useState({
    visit_date: new Date().toISOString().split('T')[0],
    chief_complaint: '', clinical_findings: '', treatment_done: '',
    materials_used: '', next_appointment_recommended: '', next_appointment_notes: '',
  })

  const [rxForm, setRxForm] = useState({
    template: '', medicines: [] as any[], instructions: '',
  })

  const [planForm, setPlanForm] = useState({
    title: '', steps: [{ treatment_name: '', tooth_number: '', estimated_cost: '', notes: '' }],
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id, name').eq('email', user.email).single()
      if (!dentist) return
      setDentistId(dentist.id)
      setDentistName(dentist.name)

      const [{ data: p }, { data: v }, { data: rx }, { data: pl }, { data: xr }] = await Promise.all([
        supabase.from('patients').select('*').eq('id', patientId).eq('dentist_id', dentist.id).single(),
        supabase.from('visits').select('*').eq('patient_id', patientId).order('visit_date', { ascending: false }),
        supabase.from('prescriptions').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase.from('treatment_plans').select('*, treatment_plan_steps(*)').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase.from('xray_images').select('*').eq('patient_id', patientId).order('taken_at', { ascending: false }),
      ])

      if (!p) { router.push('/for-dentists/dashboard/patients'); return }
      setPatient(p); setVisits(v || []); setPrescriptions(rx || []); setPlans(pl || []); setXrays(xr || [])
      setLoading(false)
    }
    load()
  }, [patientId])

  async function saveVisit() {
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('visits').insert({
      patient_id: patientId, dentist_id: dentistId,
      visit_date: visitForm.visit_date,
      chief_complaint: visitForm.chief_complaint || null,
      clinical_findings: visitForm.clinical_findings || null,
      treatment_done: visitForm.treatment_done || null,
      materials_used: visitForm.materials_used ? visitForm.materials_used.split(',').map(m => m.trim()) : [],
      next_appointment_recommended: visitForm.next_appointment_recommended || null,
      next_appointment_notes: visitForm.next_appointment_notes || null,
    }).select('*').single()
    if (data) setVisits(prev => [data, ...prev])
    setShowAddVisit(false)
    setVisitForm({ visit_date: new Date().toISOString().split('T')[0], chief_complaint: '', clinical_findings: '', treatment_done: '', materials_used: '', next_appointment_recommended: '', next_appointment_notes: '' })
    setSaving(false)
  }

  async function saveRx() {
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('prescriptions').insert({
      patient_id: patientId, dentist_id: dentistId,
      medicines: rxForm.medicines,
      instructions: rxForm.instructions || null,
      template_used: rxForm.template || null,
    }).select('*').single()
    if (data) setPrescriptions(prev => [data, ...prev])
    setShowAddRx(false)
    setRxForm({ template: '', medicines: [], instructions: '' })
    setSaving(false)
  }

  async function savePlan() {
    setSaving(true)
    const supabase = createClient()
    const totalCost = planForm.steps.reduce((sum, s) => sum + (parseInt(s.estimated_cost) || 0), 0)
    const { data: plan } = await supabase.from('treatment_plans').insert({
      patient_id: patientId, dentist_id: dentistId,
      title: planForm.title, total_cost: totalCost,
    }).select('id').single()

    if (plan) {
      const steps = planForm.steps.map((s, i) => ({
        plan_id: plan.id, step_number: i + 1,
        treatment_name: s.treatment_name,
        tooth_number: s.tooth_number || null,
        estimated_cost: parseInt(s.estimated_cost) || 0,
        notes: s.notes || null,
      }))
      await supabase.from('treatment_plan_steps').insert(steps)
      const { data: fullPlan } = await supabase.from('treatment_plans').select('*, treatment_plan_steps(*)').eq('id', plan.id).single()
      if (fullPlan) setPlans(prev => [fullPlan, ...prev])
    }
    setShowAddPlan(false)
    setPlanForm({ title: '', steps: [{ treatment_name: '', tooth_number: '', estimated_cost: '', notes: '' }] })
    setSaving(false)
  }

  function applyTemplate(templateName: string) {
    const meds = PRESCRIPTION_TEMPLATES[templateName as keyof typeof PRESCRIPTION_TEMPLATES] || []
    setRxForm(f => ({ ...f, template: templateName, medicines: meds }))
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, display: 'block' as const, marginBottom: 4 }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading patient...</p></div>
  if (!patient) return null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/for-dentists/dashboard/patients" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← All Patients</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          {patient.gender === 'Female' ? '👩' : '👨'}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>{patient.name}</h1>
            {patient.allergies && <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '2px 8px', borderRadius: 10 }}>⚠️ ALLERGIC: {patient.allergies}</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 12 }}>
            {patient.age && <span>{patient.age} yrs</span>}
            {patient.gender && <span>{patient.gender}</span>}
            {patient.blood_group && <span style={{ color: '#7C3AED', fontWeight: 600 }}>{patient.blood_group}</span>}
            <span>📞 {patient.phone}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 400, color: activeTab === tab.id ? 'var(--blue)' : 'var(--muted)', borderBottom: `2px solid ${activeTab === tab.id ? 'var(--blue)' : 'transparent'}`, whiteSpace: 'nowrap' }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', gridColumn: '1/-1' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Patient Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Visits', value: visits.length, icon: '📋' },
                { label: 'Prescriptions', value: prescriptions.length, icon: '💊' },
                { label: 'Treatment Plans', value: plans.length, icon: '🦷' },
                { label: 'X-Rays', value: xrays.length, icon: '🩻' },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{stat.icon}</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          {patient.medical_history && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 14, padding: '20px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#92400E' }}>📋 Medical History</h3>
              <p style={{ fontSize: 14, color: '#92400E', lineHeight: 1.7 }}>{patient.medical_history}</p>
            </div>
          )}
          {patient.current_medications && (
            <div style={{ background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 14, padding: '20px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#5B21B6' }}>💊 Current Medications</h3>
              <p style={{ fontSize: 14, color: '#5B21B6', lineHeight: 1.7 }}>{patient.current_medications}</p>
            </div>
          )}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Contact Details</h3>
            {[
              { label: 'Phone', value: patient.phone },
              { label: 'Email', value: patient.email },
              { label: 'Address', value: patient.address },
              { label: 'Emergency', value: patient.emergency_contact_name ? `${patient.emergency_contact_name} — ${patient.emergency_contact_phone}` : null },
            ].filter(i => i.value).map(item => (
              <div key={item.label} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--muted)', width: 70, flexShrink: 0 }}>{item.label}</span>
                <span style={{ color: 'var(--text)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VISIT NOTES */}
      {activeTab === 'visits' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowAddVisit(true)} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Add Visit Note</button>
          </div>
          {showAddVisit && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 20 }}>New Visit Note</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Visit Date</label>
                  <input type="date" value={visitForm.visit_date} onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Chief Complaint</label>
                  <input value={visitForm.chief_complaint} onChange={e => setVisitForm(f => ({ ...f, chief_complaint: e.target.value }))} placeholder="Patient's main complaint today" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Clinical Findings</label>
                  <textarea value={visitForm.clinical_findings} onChange={e => setVisitForm(f => ({ ...f, clinical_findings: e.target.value }))} placeholder="Examination findings, diagnosis..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Treatment Done Today</label>
                  <textarea value={visitForm.treatment_done} onChange={e => setVisitForm(f => ({ ...f, treatment_done: e.target.value }))} placeholder="Procedures performed, teeth treated..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Materials Used <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(comma separated)</span></label>
                  <input value={visitForm.materials_used} onChange={e => setVisitForm(f => ({ ...f, materials_used: e.target.value }))} placeholder="e.g. GIC, Composite, Gutta Percha" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Next Appointment Date</label>
                  <input type="date" value={visitForm.next_appointment_recommended} onChange={e => setVisitForm(f => ({ ...f, next_appointment_recommended: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Next Visit Notes</label>
                  <input value={visitForm.next_appointment_notes} onChange={e => setVisitForm(f => ({ ...f, next_appointment_notes: e.target.value }))} placeholder="What to do next visit" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAddVisit(false)} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                <button onClick={saveVisit} disabled={saving} style={{ padding: '9px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Save Visit'}</button>
              </div>
            </div>
          )}
          {visits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)' }}>No visit notes yet.</div>
          ) : visits.map(v => (
            <div key={v.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>📅 {new Date(v.visit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              {v.chief_complaint && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>COMPLAINT</span><p style={{ fontSize: 14, marginTop: 2 }}>{v.chief_complaint}</p></div>}
              {v.clinical_findings && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>FINDINGS</span><p style={{ fontSize: 14, marginTop: 2 }}>{v.clinical_findings}</p></div>}
              {v.treatment_done && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>TREATMENT</span><p style={{ fontSize: 14, marginTop: 2 }}>{v.treatment_done}</p></div>}
              {v.materials_used?.length > 0 && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>MATERIALS</span><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{v.materials_used.map((m: string) => <span key={m} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--blue-light)', color: 'var(--blue)', borderRadius: 10 }}>{m}</span>)}</div></div>}
              {v.next_appointment_recommended && <div style={{ marginTop: 8, padding: '8px 12px', background: '#DCFCE7', borderRadius: 8, fontSize: 13, color: '#166534' }}>📅 Next visit: {new Date(v.next_appointment_recommended).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{v.next_appointment_notes ? ` — ${v.next_appointment_notes}` : ''}</div>}
            </div>
          ))}
        </div>
      )}

      {/* PRESCRIPTIONS */}
      {activeTab === 'prescriptions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowAddRx(true)} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ New Prescription</button>
          </div>
          {showAddRx && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>New Prescription</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Quick Templates</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.keys(PRESCRIPTION_TEMPLATES).map(t => (
                    <button key={t} onClick={() => applyTemplate(t)}
                      style={{ padding: '7px 14px', background: rxForm.template === t ? 'var(--blue)' : 'var(--bg)', color: rxForm.template === t ? '#fff' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {rxForm.medicines.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Medicines</label>
                  {rxForm.medicines.map((med, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                      <input value={med.name} onChange={e => { const m = [...rxForm.medicines]; m[i].name = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="Medicine name" style={inputStyle} />
                      <input value={med.dosage} onChange={e => { const m = [...rxForm.medicines]; m[i].dosage = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="1-0-1" style={inputStyle} />
                      <input value={med.duration} onChange={e => { const m = [...rxForm.medicines]; m[i].duration = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="5 days" style={inputStyle} />
                      <input value={med.instructions} onChange={e => { const m = [...rxForm.medicines]; m[i].instructions = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="Instructions" style={inputStyle} />
                    </div>
                  ))}
                  <button onClick={() => setRxForm(f => ({ ...f, medicines: [...f.medicines, { name: '', dosage: '', duration: '', instructions: '' }] }))}
                    style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Add medicine</button>
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Special Instructions</label>
                <textarea value={rxForm.instructions} onChange={e => setRxForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Avoid cold foods, salt water gargle, follow up in 1 week..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAddRx(false)} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                <button onClick={saveRx} disabled={saving} style={{ padding: '9px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Save Prescription'}</button>
              </div>
            </div>
          )}
          {prescriptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)' }}>No prescriptions yet.</div>
          ) : prescriptions.map(rx => (
            <div key={rx.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>💊 {rx.template_used || 'Prescription'}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(rx.created_at).toLocaleDateString('en-IN')}</span>
              </div>
              {rx.medicines?.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                  <thead><tr style={{ background: 'var(--bg)' }}>
                    {['Medicine', 'Dosage', 'Duration', 'Instructions'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{rx.medicines.map((med: any, i: number) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 500 }}>{med.name}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{med.dosage}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{med.duration}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--muted)' }}>{med.instructions}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {rx.instructions && <p style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg)', padding: '8px 12px', borderRadius: 8 }}>📝 {rx.instructions}</p>}
            </div>
          ))}
        </div>
      )}

      {/* TREATMENT PLANS */}
      {activeTab === 'plans' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowAddPlan(true)} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Create Plan</button>
          </div>
          {showAddPlan && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>New Treatment Plan</h3>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Plan Title</label>
                <input value={planForm.title} onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Full Mouth Rehabilitation, Orthodontic Treatment" style={inputStyle} />
              </div>
              <label style={labelStyle}>Steps</label>
              {planForm.steps.map((step, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={step.treatment_name} onChange={e => { const s = [...planForm.steps]; s[i].treatment_name = e.target.value; setPlanForm(f => ({ ...f, steps: s })) }} placeholder="Treatment" style={inputStyle} />
                  <input value={step.tooth_number} onChange={e => { const s = [...planForm.steps]; s[i].tooth_number = e.target.value; setPlanForm(f => ({ ...f, steps: s })) }} placeholder="Tooth #" style={inputStyle} />
                  <input type="number" value={step.estimated_cost} onChange={e => { const s = [...planForm.steps]; s[i].estimated_cost = e.target.value; setPlanForm(f => ({ ...f, steps: s })) }} placeholder="₹ Cost" style={inputStyle} />
                  <input value={step.notes} onChange={e => { const s = [...planForm.steps]; s[i].notes = e.target.value; setPlanForm(f => ({ ...f, steps: s })) }} placeholder="Notes" style={inputStyle} />
                  {planForm.steps.length > 1 && <button onClick={() => setPlanForm(f => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }))} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12 }}>✕</button>}
                </div>
              ))}
              <button onClick={() => setPlanForm(f => ({ ...f, steps: [...f.steps, { treatment_name: '', tooth_number: '', estimated_cost: '', notes: '' }] }))}
                style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', marginBottom: 16 }}>+ Add step</button>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
                Total Estimate: <strong>₹{planForm.steps.reduce((sum, s) => sum + (parseInt(s.estimated_cost) || 0), 0).toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAddPlan(false)} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                <button onClick={savePlan} disabled={saving} style={{ padding: '9px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Save Plan'}</button>
              </div>
            </div>
          )}
          {plans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)' }}>No treatment plans yet.</div>
          ) : plans.map(plan => (
            <div key={plan.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>🦷 {plan.title}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--blue)' }}>₹{plan.total_cost?.toLocaleString('en-IN')}</span>
              </div>
              {plan.treatment_plan_steps?.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'var(--bg)' }}>
                    {['#', 'Treatment', 'Tooth', 'Cost', 'Status'].map(h => <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{plan.treatment_plan_steps.sort((a: any, b: any) => a.step_number - b.step_number).map((step: any) => (
                    <tr key={step.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--muted)' }}>{step.step_number}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 500 }}>{step.treatment_name}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{step.tooth_number || '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>₹{step.estimated_cost?.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: step.status === 'completed' ? '#DCFCE7' : step.status === 'in_progress' ? '#DBEAFE' : '#F3F4F6', color: step.status === 'completed' ? '#166534' : step.status === 'in_progress' ? '#1D4ED8' : '#374151' }}>
                          {step.status}
                        </span>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* EMR */}
      {activeTab === 'emr' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🏥</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Electronic Medical Record</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 480, margin: '0 auto 20px' }}>
            Capture a full clinical encounter — vitals, complaints, diagnosis, medications, procedures, advice, and follow-up — in one form.
          </p>
          <Link href={`/for-dentists/dashboard/patients/${patientId}/emr/new`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            + New EMR Record
          </Link>
        </div>
      )}

      {/* DENTAL CHART */}
      {activeTab === 'chart' && (
        <DentalChart patientId={patientId} dentistId={dentistId} />
      )}

      {/* X-RAY VAULT */}
      {activeTab === 'xrays' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <label style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              + Upload X-Ray / Image
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                const formData = new FormData()
                formData.append('file', file)
                formData.append('type', 'xray')
                const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData })
                const data = await res.json()
                if (data.success) {
                  const supabase = createClient()
                  const { data: xray } = await supabase.from('xray_images').insert({ patient_id: patientId, dentist_id: dentistId, url: data.url, image_type: 'xray', taken_at: new Date().toISOString().split('T')[0] }).select('*').single()
                  if (xray) setXrays(prev => [xray, ...prev])
                }
              }} />
            </label>
          </div>
          {xrays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)' }}>No images uploaded yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {xrays.map(xr => (
                <div key={xr.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <img src={xr.url} alt="X-ray" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{xr.image_type?.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(xr.taken_at).toLocaleDateString('en-IN')}</div>
                    {xr.tooth_number && <div style={{ fontSize: 11, color: 'var(--blue)' }}>Tooth #{xr.tooth_number}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
