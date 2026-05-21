'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import DentalChart from '@/components/DentalChart'
import PerioChart from '@/components/dental/PerioChart'
import ImageVault from '@/components/dental/ImageVault'
import { downloadInvoicePdf } from '@/lib/invoicePdf'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '👤' },
  { id: 'timeline', label: 'Timeline', icon: '📈' },
  { id: 'visits', label: 'Visit Notes', icon: '📋' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
  { id: 'invoices', label: 'Invoices', icon: '🧾' },
  { id: 'plans', label: 'Treatment Plans', icon: '🦷' },
  { id: 'emr', label: 'EMR', icon: '🏥' },
  { id: 'consent', label: 'Consent', icon: '📝' },
  { id: 'chart', label: 'Dental Chart', icon: '🦷' },
  // Unified vault — replaces the older `xrays` and `photos` tabs which
  // queried two separate tables (xray_images + patient_photos). Both
  // legacy tables were merged into patient_images by migration
  // 20260521170000.
  { id: 'images', label: 'X-Rays & Photos', icon: '🔬' },
  { id: 'lab', label: 'Lab Work', icon: '🧪' },
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

// Quick-action buttons elsewhere in the dashboard link here with
// `?tab=treatments|profile|history` — friendly names that don't always match
// the internal tab id list. Map them to real tabs so the deep link lands on
// the section the operator expects.
const TAB_ALIASES: Record<string, string> = {
  profile: 'overview',
  history: 'timeline',
  treatments: 'visits',
  treatment: 'visits',
  // Legacy aliases — the old `xrays` and `photos` tabs were merged into
  // the unified `images` vault. Existing bookmarks keep landing correctly.
  xrays: 'images',
  photos: 'images',
  // Spelling-tolerant aliases for the lab-work tab.
  labwork: 'lab',
  'lab-work': 'lab',
}

export default function PatientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const patientId = params.id as string
  const initialTab = (() => {
    const raw = searchParams.get('tab') || ''
    return TAB_ALIASES[raw] || raw || 'overview'
  })()

  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [dentistName, setDentistName] = useState('')
  const [dentistMeta, setDentistMeta] = useState<any>(null)
  const [patient, setPatient] = useState<any>(null)
  const [visits, setVisits] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [labWork, setLabWork] = useState<any[]>([])
  const [invoiceActionError, setInvoiceActionError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(initialTab)
  // Inner navigation for the Dental Chart tab. Two sub-views live under the
  // same tab so the FDI tooth chart and the periodontal chart share screen
  // real estate without bloating the top-level tab strip.
  const [chartSubTab, setChartSubTab] = useState<'tooth' | 'perio'>('tooth')
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
      const { data: dentist } = await supabase
        .from('dentists')
        .select('id, name, degree, clinic_name, phone, whatsapp, address, mci_number, city, areas(name)')
        .eq('email', user.email)
        .single()
      if (!dentist) return
      setDentistId(dentist.id)
      setDentistName(dentist.name)
      setDentistMeta(dentist)

      const [{ data: p }, { data: v }, { data: rx }, { data: pl }, { data: inv }, { data: lw }] = await Promise.all([
        supabase.from('patients').select('*').eq('id', patientId).eq('dentist_id', dentist.id).single(),
        supabase.from('visits').select('*').eq('patient_id', patientId).order('visit_date', { ascending: false }),
        supabase.from('prescriptions').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase.from('treatment_plans').select('*, treatment_plan_steps(*)').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*, patients(name, phone)').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('invoice_date', { ascending: false }),
        supabase.from('lab_work').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('created_at', { ascending: false }),
      ])

      if (!p) { router.push('/for-dentists/dashboard/patients'); return }
      setPatient(p); setVisits(v || []); setPrescriptions(rx || []); setPlans(pl || []); setInvoices(inv || []); setLabWork(lw || [])
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

  async function markInvoicePaid(id: string) {
    setInvoiceActionError(null)
    const supabase = createClient()
    // Mirror the billing page: .select() the write so a silent RLS denial
    // surfaces as a user-visible error instead of pretending it succeeded.
    const { data, error } = await supabase
      .from('invoices').update({ payment_status: 'paid' }).eq('id', id).select('id')
    if (error) {
      setInvoiceActionError(error.message)
      return
    }
    if (!data || data.length === 0) {
      setInvoiceActionError('Update rejected — you may not have permission to edit this invoice.')
      return
    }
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, payment_status: 'paid' } : inv))
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
                { label: 'Invoices', value: invoices.length, icon: '🧾' },
                { label: 'Treatment Plans', value: plans.length, icon: '🦷' },
                { label: 'Lab Work', value: labWork.length, icon: '🧪' },
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>💊 {rx.template_used || 'Prescription'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(rx.created_at).toLocaleDateString('en-IN')}</span>
                  <a
                    href={`/api/prescriptions/pdf?id=${rx.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '5px 10px', background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                  >
                    📄 Download PDF
                  </a>
                  {patient.phone && (() => {
                    const phone = String(patient.phone).replace(/\D/g, '').slice(-10)
                    const clinic = dentistMeta?.clinic_name || dentistMeta?.name || 'your clinic'
                    // Patient-facing share link: absolute so wa.me lands the
                    // patient on a working URL regardless of which device opens
                    // the WhatsApp message.
                    const link = typeof window !== 'undefined'
                      ? `${window.location.origin}/api/prescriptions/pdf?id=${rx.id}`
                      : `/api/prescriptions/pdf?id=${rx.id}`
                    const msg = `Your prescription from ${clinic}: ${link}`
                    return (
                      <a
                        href={`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: '5px 10px', background: '#25D366', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                      >
                        💚 Send to Patient
                      </a>
                    )
                  })()}
                </div>
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

      {/* INVOICES */}
      {activeTab === 'invoices' && (() => {
        const outstanding = invoices
          .filter(i => i.payment_status !== 'paid')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0)
        const collected = invoices
          .filter(i => i.payment_status === 'paid')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0)
        const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
          pending: { bg: '#FEF3C7', text: '#92400E' },
          paid: { bg: '#DCFCE7', text: '#166534' },
          overdue: { bg: '#FEE2E2', text: '#991B1B' },
        }
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 }}>Outstanding</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: '#92400E' }}>₹{outstanding.toLocaleString('en-IN')}</div>
                </div>
                <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>Collected</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: '#166534' }}>₹{collected.toLocaleString('en-IN')}</div>
                </div>
              </div>
              <Link
                href={`/for-dentists/dashboard/billing?patient_id=${patientId}`}
                style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, textDecoration: 'none' }}
              >
                + New Invoice
              </Link>
            </div>

            {invoiceActionError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <span>{invoiceActionError}</span>
                <button onClick={() => setInvoiceActionError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700 }}>✕</button>
              </div>
            )}

            {invoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)' }}>
                No invoices yet for this patient.
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Invoice #', 'Date', 'Amount', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => {
                      const sc = STATUS_COLORS[inv.payment_status] || STATUS_COLORS.pending
                      return (
                        <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{inv.invoice_no}</td>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                          <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700 }}>₹{Number(inv.total || 0).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>{inv.payment_status}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {inv.payment_status !== 'paid' && (
                                <button onClick={() => markInvoicePaid(inv.id)}
                                  style={{ padding: '5px 10px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                  Mark Paid
                                </button>
                              )}
                              <button onClick={() => dentistMeta && downloadInvoicePdf(inv, dentistMeta)}
                                disabled={!dentistMeta}
                                style={{ padding: '5px 10px', background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: dentistMeta ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)' }}>
                                ⬇ PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

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

      {/* TIMELINE */}
      {activeTab === 'timeline' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📈</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Treatment History Timeline</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 480, margin: '0 auto 20px' }}>
            One chronological view of every visit, prescription, EMR, invoice, appointment, consent form, and X-ray for this patient.
          </p>
          <Link href={`/for-dentists/dashboard/patients/${patientId}/timeline`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Open Timeline →
          </Link>
        </div>
      )}

      {/* CONSENT */}
      {activeTab === 'consent' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📝</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Digital Consent Forms</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 480, margin: '0 auto 20px' }}>
            Implant, extraction, RCT, and whitening consent templates — patient signs on screen, save and download a PDF in one tap.
          </p>
          <Link href={`/for-dentists/dashboard/patients/${patientId}/consent`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Open Consent Forms →
          </Link>
        </div>
      )}

      {/* DENTAL CHART — two sub-views: the FDI tooth chart (caries, RCT,
          restorations, missing teeth) and the periodontal chart (pocket
          depth / BOP / recession / mobility / furcation). Keeping them in
          sibling sub-tabs avoids cramming a 12th top-level tab into the
          patient strip. */}
      {activeTab === 'chart' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            {([
              { key: 'tooth' as const, label: '🦷 Tooth Chart', sub: 'Caries, RCT, restorations' },
              { key: 'perio' as const, label: '🩸 Perio Chart', sub: 'Pocket depth, BOP, recession' },
            ]).map(t => (
              <button key={t.key} onClick={() => setChartSubTab(t.key)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: chartSubTab === t.key ? 700 : 500,
                  color: chartSubTab === t.key ? 'var(--blue)' : 'var(--muted)',
                  borderBottom: `2px solid ${chartSubTab === t.key ? 'var(--blue)' : 'transparent'}`,
                  textAlign: 'left',
                }}>
                <div>{t.label}</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)' }}>{t.sub}</div>
              </button>
            ))}
          </div>
          {chartSubTab === 'tooth' && <DentalChart patientId={patientId} dentistId={dentistId} />}
          {chartSubTab === 'perio' && <PerioChart patientId={patientId} dentistId={dentistId} />}
        </div>
      )}

      {/* UNIFIED X-RAY + PHOTO VAULT — replaces the legacy `xrays` and
          `photos` tabs. Backed by the new patient_images table. */}
      {activeTab === 'images' && (
        <ImageVault patientId={patientId} dentistId={dentistId} />
      )}

      {/* LAB WORK — per-patient view of crowns / bridges / dentures etc.
          sent to external labs. CRUD lives on the standalone
          /dashboard/lab-work page so we don't duplicate the form here —
          this tab is a read-only roll-up plus a quick "open the full
          tracker" link. */}
      {activeTab === 'lab' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              {labWork.length === 0
                ? 'No lab work tracked for this patient yet.'
                : `${labWork.length} case${labWork.length === 1 ? '' : 's'} on file for this patient.`}
            </p>
            <Link href="/for-dentists/dashboard/lab-work"
              style={{ padding: '8px 14px', background: 'var(--blue)', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
              Open Lab Work tracker →
            </Link>
          </div>
          {labWork.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {labWork.map((r: any) => {
                const overdue = r.status !== 'ready' && r.status !== 'delivered'
                  && r.expected_return_date
                  && r.expected_return_date < new Date().toISOString().slice(0, 10)
                const statusColor: Record<string, { bg: string; text: string; label: string }> = {
                  sent:        { bg: '#FEF3C7', text: '#92400E', label: 'Sent'        },
                  in_progress: { bg: '#DBEAFE', text: '#1D4ED8', label: 'In Progress' },
                  ready:       { bg: '#DCFCE7', text: '#166534', label: 'Ready'       },
                  delivered:   { bg: '#E5E7EB', text: '#374151', label: 'Delivered'   },
                  remake:      { bg: '#FEE2E2', text: '#991B1B', label: 'Remake'      },
                }
                const sc = statusColor[r.status] || { bg: '#F3F4F6', text: '#374151', label: r.status }
                return (
                  <div key={r.id} style={{
                    background: '#fff',
                    border: `1px solid ${overdue ? '#FECACA' : 'var(--border)'}`,
                    borderLeft: overdue ? '4px solid #DC2626' : '1px solid var(--border)',
                    borderRadius: 10, padding: '12px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{r.work_type}</span>
                      {r.tooth_numbers && <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>🦷 {r.tooth_numbers}</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
                      {overdue && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B' }}>⚠ Overdue</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {r.lab_name && <span>🏭 {r.lab_name}</span>}
                      {r.shade && <span>🎨 {r.shade}</span>}
                      {r.sent_date && <span>📤 {new Date(r.sent_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                      {r.expected_return_date && <span>⏰ Due {new Date(r.expected_return_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                      {r.cost != null && <span>💰 ₹{Number(r.cost).toLocaleString('en-IN')}</span>}
                    </div>
                    {r.notes && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>"{r.notes}"</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
