'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PerioChart from '@/components/dental/PerioChart'
import ToothChart from '@/components/dental/ToothChart'
import ImageVault from '@/components/dental/ImageVault'
import { downloadInvoicePdf } from '@/lib/invoicePdf'
import { type RxLang, RX_LANG_LABELS, INSTRUCTION_PHRASES, rxLangStorageKey, isRxLang } from '@/lib/instructionPhrases'
import ScheduleRecallButton from './ScheduleRecallButton'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '👤' },
  { id: 'timeline', label: 'Timeline', icon: '📈' },
  { id: 'visits', label: 'Visit Notes', icon: '📋' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
  { id: 'invoices', label: 'Invoices', icon: '🧾' },
  { id: 'plans', label: 'Treatment Plans', icon: '🦷' },
  { id: 'treatment-plan', label: 'Treatment Plan', icon: '📋' },
  { id: 'dental-chart', label: 'Dental Chart', icon: '🦷' },
  { id: 'emr', label: 'EMR', icon: '🏥' },
  { id: 'consent', label: 'Consent', icon: '📝' },
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

// Common treatment-note templates for the "Quick Notes" dropdown on the visit
// editor. Selecting one appends its text to the Treatment Done field so the
// dentist can fill the [  ] placeholders (tooth numbers, materials, shades).
const QUICK_NOTE_TEMPLATES: { label: string; text: string }[] = [
  { label: 'Extraction done', text: 'Tooth [  ] extracted under local anaesthesia. Haemostasis achieved. Post-op instructions given. Review after 1 week.' },
  { label: 'RCT sitting 1', text: 'Access cavity prepared. Pulp extirpated. Canals negotiated and irrigated with NaOCl. Intra-canal medicament placed. Temporary restoration done.' },
  { label: 'RCT sitting 2 (obturation)', text: 'Canals cleaned, shaped and dried. Obturation done with gutta percha and AH Plus sealer. Post-op X-ray taken. Patient advised for crown.' },
  { label: 'Scaling done', text: 'Full mouth scaling and polishing done with ultrasonic scaler. Calculus and stains removed. Oral hygiene instructions reinforced. Review after 6 months.' },
  { label: 'Composite filling done', text: 'Caries excavated under local anaesthesia on tooth [  ]. Cavity prepared, etched and bonding agent applied and light cured. Composite restoration placed incrementally, finished and polished. Occlusion checked.' },
  { label: 'Crown cementation', text: 'Temporary crown removed. Permanent crown on tooth [  ] checked for fit, margins and occlusion. Crown cemented with luting GIC. Excess cement removed. Occlusion verified.' },
  { label: 'Impression taken', text: 'Impression of [  ] arch recorded with [  ] impression material. Bite registration taken and shade selected. Case sent to lab. Patient advised for next appointment.' },
  { label: 'Orthodontic adjustment', text: 'Orthodontic appliance checked. Arch wire [  ] in place. Elastomeric modules replaced and wire adjusted. Oral hygiene reinforced. Next adjustment after 3-4 weeks.' },
  { label: 'Implant placed', text: 'Under local anaesthesia, full-thickness flap raised at site [  ]. Sequential osteotomy prepared. Implant [  ] placed with good primary stability. Cover screw placed and flap sutured. Post-op instructions and medications given.' },
  { label: 'Abscess drained', text: 'Incision and drainage of abscess in relation to tooth [  ] done under local anaesthesia. Pus drained and site irrigated with saline. Antibiotics and analgesics prescribed. Review after 2 days.' },
  { label: 'Denture delivered', text: 'Denture delivered. Fit, retention, extension and occlusion checked and adjusted. Pressure areas relieved. Denture-care and post-insertion instructions given. Review after 1 week.' },
  { label: 'Review / follow-up', text: 'Patient reviewed. Healing satisfactory and uneventful, no complaints reported. Site examined / sutures removed. Patient advised to continue oral hygiene measures.' },
]

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
  // The legacy `chart` top-level tab folded into the new `dental-chart`
  // tab (which now houses both the FDI tooth chart and the perio chart
  // as sub-tabs). Old bookmarks land on the same content.
  chart: 'dental-chart',
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
  // Instruction language for the prescription form (persisted per dentist).
  const [rxLang, setRxLang] = useState<RxLang>('en')

  const [planForm, setPlanForm] = useState({
    title: '', steps: [{ treatment_name: '', tooth_number: '', estimated_cost: '', notes: '' }],
  })

  // Patient portal access toggle (Overview tab).
  const [portalSaving, setPortalSaving] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  // AI: smart drug suggestions for the prescription writer.
  const [diagnosis, setDiagnosis] = useState('')
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([])
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null)

  // AI: quick-note templates + note refinement for the visit editor.
  const [showQuickNotes, setShowQuickNotes] = useState(false)
  const [refining, setRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)
  // Snapshot of the note before AI refinement so "Undo" can restore it.
  const [notesBeforeRefine, setNotesBeforeRefine] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase
        .from('dentists')
        .select('id, name, degree, clinic_name, phone, whatsapp, address, mci_number, city, areas(name), clinic_logo_url, signature_url')
        .eq('email', user.email)
        .single()
      if (!dentist) return
      setDentistId(dentist.id)
      setDentistName(dentist.name)
      setDentistMeta(dentist)

      const [{ data: p }, { data: v }, { data: rx }, { data: pl }, { data: inv }, { data: lw }] = await Promise.all([
        supabase.from('patients').select('*').eq('id', patientId).eq('dentist_id', dentist.id).single(),
        // dentist_id scope on EVERY child query — a determined dentist who
        // typed another clinic's patient UUID into the URL would otherwise
        // see that patient's visits, prescriptions, and treatment plans
        // even though the parent `patients` lookup above correctly returns
        // null. The page bounces back to /patients when `p` is missing,
        // but the in-flight queries already fired and a network sniff
        // would still leak the child rows.
        supabase.from('visits').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('visit_date', { ascending: false }),
        supabase.from('prescriptions').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('created_at', { ascending: false }),
        supabase.from('treatment_plans').select('*, treatment_plan_steps(*)').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*, patients(name, phone)').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('invoice_date', { ascending: false }),
        supabase.from('lab_work').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('created_at', { ascending: false }),
      ])

      if (!p) { router.push('/for-dentists/dashboard/patients'); return }
      setPatient(p); setVisits(v || []); setPrescriptions(rx || []); setPlans(pl || []); setInvoices(inv || []); setLabWork(lw || [])
      setLoading(false)
    }
    load()
  }, [patientId])

  // Restore the dentist's saved instruction-language preference once we know
  // who they are (kept in localStorage so they don't re-pick it every time).
  useEffect(() => {
    if (!dentistId || typeof window === 'undefined') return
    const saved = window.localStorage.getItem(rxLangStorageKey(dentistId))
    if (isRxLang(saved)) setRxLang(saved)
  }, [dentistId])

  function changeRxLang(l: RxLang) {
    setRxLang(l)
    if (dentistId && typeof window !== 'undefined') {
      window.localStorage.setItem(rxLangStorageKey(dentistId), l)
    }
  }

  // Append a localised instruction phrase to the Special Instructions field.
  function addInstructionPhrase(phrase: string) {
    setRxForm(f => {
      const cur = f.instructions.trim()
      return { ...f, instructions: cur ? `${cur}, ${phrase}` : phrase }
    })
  }

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
    setNotesBeforeRefine(null)
    setShowQuickNotes(false)
    setRefineError(null)
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
    resetAiSuggestions()
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

  // Generate + download the invoice PDF client-side (see src/lib/invoicePdf.ts).
  // Wrapped so a throw inside jsPDF surfaces as a visible alert instead of a
  // silent no-op that reads to the dentist as "the download button is broken".
  async function downloadInvoice(inv: any) {
    if (!dentistMeta) { setInvoiceActionError('Clinic details are still loading — please try again in a moment.'); return }
    try {
      await downloadInvoicePdf(inv, dentistMeta)
    } catch (err) {
      console.error('Invoice PDF generation failed', err)
      setInvoiceActionError('Could not generate the invoice PDF. Please try again.')
    }
  }

  function applyTemplate(templateName: string) {
    const meds = PRESCRIPTION_TEMPLATES[templateName as keyof typeof PRESCRIPTION_TEMPLATES] || []
    setRxForm(f => ({ ...f, template: templateName, medicines: meds }))
  }

  async function togglePortalAccess() {
    if (!patient) return
    setPortalSaving(true)
    setPortalError(null)
    const supabase = createClient()
    const next = !patient.portal_access
    // .select() so an RLS denial surfaces instead of a silent no-op.
    const { data, error } = await supabase
      .from('patients').update({ portal_access: next }).eq('id', patientId).select('id, portal_access')
    setPortalSaving(false)
    if (error) { setPortalError(error.message); return }
    if (!data || data.length === 0) { setPortalError('Update rejected — you may not have permission to edit this patient.'); return }
    setPatient((p: any) => ({ ...p, portal_access: next }))
  }

  // Reset the AI-suggestion sub-state. Called when the Rx form opens/closes so
  // a stale diagnosis or old suggestion cards don't leak into the next Rx.
  function resetAiSuggestions() {
    setDiagnosis('')
    setAiSuggestions([])
    setAiSuggestError(null)
  }

  async function getAiSuggestions() {
    const dx = diagnosis.trim()
    if (!dx) return
    setAiSuggesting(true)
    setAiSuggestError(null)
    setAiSuggestions([])
    try {
      const res = await fetch('/api/dentist/ai/prescription-suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ diagnosis: dx, patient_age: patient?.age ?? undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.medicines) || data.medicines.length === 0) {
        setAiSuggestError(data.error || 'AI unavailable, please write manually')
      } else {
        setAiSuggestions(data.medicines)
      }
    } catch {
      setAiSuggestError('AI unavailable, please write manually')
    } finally {
      setAiSuggesting(false)
    }
  }

  function addSuggestionToRx(s: any) {
    const med = {
      name: s.name || '',
      // The medicines table's "dosage" column is the frequency (e.g. 1-0-1).
      // Fall back to the dose string if the model didn't split them out.
      dosage: s.frequency || s.dosage || '',
      duration: s.duration || '',
      instructions: s.instructions || '',
      aiSuggested: true,
    }
    setRxForm(f => ({ ...f, medicines: [...f.medicines, med] }))
  }

  // Quick Notes: append (never replace) the template to the Treatment Done field.
  function insertQuickNote(text: string) {
    setVisitForm(f => ({
      ...f,
      treatment_done: f.treatment_done.trim() ? `${f.treatment_done.trim()}\n${text}` : text,
    }))
    setShowQuickNotes(false)
  }

  async function refineNotes() {
    const current = visitForm.treatment_done.trim()
    if (!current) return
    setRefining(true)
    setRefineError(null)
    try {
      const res = await fetch('/api/dentist/ai/refine-notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: current }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.refined) {
        setRefineError(data.error || 'AI unavailable, please write manually')
      } else {
        setNotesBeforeRefine(visitForm.treatment_done)
        setVisitForm(f => ({ ...f, treatment_done: data.refined }))
      }
    } catch {
      setRefineError('AI unavailable, please write manually')
    } finally {
      setRefining(false)
    }
  }

  function undoRefine() {
    if (notesBeforeRefine != null) {
      setVisitForm(f => ({ ...f, treatment_done: notesBeforeRefine }))
      setNotesBeforeRefine(null)
    }
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
        <div style={{ marginLeft: 'auto' }}>
          <ScheduleRecallButton patientId={patientId} dentistId={dentistId} />
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

          {/* PATIENT PORTAL — enable/disable the patient's self-service portal
              (dentistinmumbai.in/patient) where they log in with their own
              mobile number to view appointments, prescriptions and invoices. */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🔐 Patient Portal</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
              {patient.portal_access
                ? 'This patient can log in at /patient with their mobile number to view their own records.'
                : 'Enable to let this patient view their appointments, prescriptions and invoices online.'}
            </p>
            {portalError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{portalError}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={togglePortalAccess} disabled={portalSaving}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: portalSaving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', background: patient.portal_access ? '#FEE2E2' : '#CCFBF1', color: patient.portal_access ? '#991B1B' : '#0F766E' }}>
                {portalSaving ? 'Saving…' : patient.portal_access ? 'Disable Portal Access' : 'Enable Portal Access'}
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: patient.portal_access ? '#CCFBF1' : 'var(--bg)', color: patient.portal_access ? '#0F766E' : 'var(--muted)' }}>
                {patient.portal_access ? '● Enabled' : '○ Disabled'}
              </span>
            </div>
            {patient.portal_last_login && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
                Last portal login: {new Date(patient.portal_last_login).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            )}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Treatment Done Today</label>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                      {/* Quick Notes dropdown — appends a template to the field */}
                      <button type="button" onClick={() => setShowQuickNotes(s => !s)}
                        style={{ padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        ⚡ Quick Notes ▾
                      </button>
                      <button type="button" onClick={refineNotes} disabled={refining || !visitForm.treatment_done.trim()}
                        style={{ padding: '5px 10px', background: visitForm.treatment_done.trim() ? '#EDE9FE' : 'var(--bg)', color: visitForm.treatment_done.trim() ? '#5B21B6' : 'var(--muted)', border: '1px solid #DDD6FE', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: refining || !visitForm.treatment_done.trim() ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
                        {refining ? '✨ Refining…' : '✨ Refine with AI'}
                      </button>
                      {notesBeforeRefine != null && (
                        <button type="button" onClick={undoRefine}
                          style={{ padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          ↶ Undo
                        </button>
                      )}
                      {showQuickNotes && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, width: 260, maxHeight: 320, overflowY: 'auto', padding: 6 }}>
                          {QUICK_NOTE_TEMPLATES.map(t => (
                            <button key={t.label} type="button" onClick={() => insertQuickNote(t.text)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea value={visitForm.treatment_done} onChange={e => setVisitForm(f => ({ ...f, treatment_done: e.target.value }))} placeholder="Procedures performed, teeth treated..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>✨ Powered by AI</span>
                    {refineError && <span style={{ fontSize: 11, color: '#991B1B' }}>{refineError}</span>}
                  </div>
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
                <button onClick={() => { setShowAddVisit(false); setShowQuickNotes(false); setRefineError(null) }} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
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
            <button onClick={() => { resetAiSuggestions(); setShowAddRx(true) }} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ New Prescription</button>
          </div>
          {showAddRx && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>New Prescription</h3>

              {/* AI — smart drug suggestions by diagnosis */}
              <div style={{ marginBottom: 16, padding: '14px 16px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Diagnosis</label>
                  <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>✨ Powered by AI</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); getAiSuggestions() } }}
                    placeholder="e.g. post extraction, acute pulpitis, pericoronitis" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
                  <button type="button" onClick={getAiSuggestions} disabled={aiSuggesting || !diagnosis.trim()}
                    style={{ padding: '9px 16px', background: !diagnosis.trim() || aiSuggesting ? 'var(--bg)' : '#7C3AED', color: !diagnosis.trim() || aiSuggesting ? 'var(--muted)' : '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: aiSuggesting || !diagnosis.trim() ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                    {aiSuggesting ? 'Thinking…' : '✨ Get AI Suggestions'}
                  </button>
                </div>
                {aiSuggestError && (
                  <p style={{ fontSize: 12, color: '#991B1B', marginTop: 8 }}>{aiSuggestError}</p>
                )}
                {aiSuggestions.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {aiSuggestions.map((s, i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            {[s.dosage, s.frequency, s.duration].filter(Boolean).join(' · ')}
                          </div>
                          {s.instructions && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>📝 {s.instructions}</div>}
                        </div>
                        <button type="button" onClick={() => addSuggestionToRx(s)}
                          style={{ padding: '7px 12px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                          + Add to Prescription
                        </button>
                      </div>
                    ))}
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>AI suggestions are a starting point — review and edit before saving.</p>
                  </div>
                )}
              </div>

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
                    <div key={i} style={{ marginBottom: 8 }}>
                      {med.aiSuggested && (
                        <span style={{ display: 'inline-block', marginBottom: 4, fontSize: 10, fontWeight: 700, color: '#5B21B6', background: '#EDE9FE', padding: '2px 8px', borderRadius: 10 }}>✨ AI suggested</span>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 8 }}>
                        <input value={med.name} onChange={e => { const m = [...rxForm.medicines]; m[i].name = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="Medicine name" style={inputStyle} />
                        <input value={med.dosage} onChange={e => { const m = [...rxForm.medicines]; m[i].dosage = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="Dosage & freq (1-0-1)" style={inputStyle} />
                        <input value={med.duration} onChange={e => { const m = [...rxForm.medicines]; m[i].duration = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="5 days" style={inputStyle} />
                        <input value={med.instructions} onChange={e => { const m = [...rxForm.medicines]; m[i].instructions = e.target.value; setRxForm(f => ({ ...f, medicines: m })) }} placeholder="Instructions" style={inputStyle} />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setRxForm(f => ({ ...f, medicines: [...f.medicines, { name: '', dosage: '', duration: '', instructions: '' }] }))}
                    style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Add medicine</button>
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Special Instructions</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['en', 'hi', 'mr'] as RxLang[]).map(l => {
                      const active = rxLang === l
                      return (
                        <button key={l} type="button" onClick={() => changeRxLang(l)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
                            background: active ? '#0A2558' : '#fff',
                            color: active ? '#fff' : '#64748B',
                            fontWeight: active ? 700 : 500,
                            border: active ? '1px solid #0A2558' : '1px solid #CBD5E1',
                          }}>
                          {RX_LANG_LABELS[l]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* Tap a phrase to append it (in the selected language) to the
                    instructions below — it prints as-is on the PDF. */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {INSTRUCTION_PHRASES.map((p, i) => (
                    <button key={i} type="button" onClick={() => addInstructionPhrase(p[rxLang])}
                      style={{ padding: '5px 10px', borderRadius: 16, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      + {p[rxLang]}
                    </button>
                  ))}
                </div>
                <textarea value={rxForm.instructions} onChange={e => setRxForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Avoid cold foods, salt water gargle, follow up in 1 week..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAddRx(false); resetAiSuggestions() }} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
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
                    {['Medicine', 'Dosage & Frequency', 'Duration', 'Instructions'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>)}
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
                              <button onClick={() => downloadInvoice(inv)}
                                disabled={!dentistMeta}
                                style={{ padding: '5px 10px', background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: dentistMeta ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)' }}>
                                ⬇ Download PDF
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

      {/* DEDICATED TREATMENT-PLAN PAGE — the older "plans" tab is a quick
          summary; this richer workflow (draft/presented/accepted lifecycle,
          drag-reorder, per-step completion, convert to invoice, WhatsApp PDF,
          patient acceptance tracking) lives on its own route so the form
          state and step manager don't bloat this already-busy file. */}
      {activeTab === 'treatment-plan' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Treatment Plan Workflow</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 520, margin: '0 auto 20px' }}>
            Build a multi-step plan, track patient acceptance, mark steps completed one-by-one, share a PDF on WhatsApp, and convert the whole plan into an invoice in one click.
          </p>
          <Link href={`/for-dentists/dashboard/patients/${patientId}/treatment-plan`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Open Treatment Plans →
          </Link>
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

      {/* DENTAL CHART — interactive ToothChart (caries / RCT / crown /
          missing / implant / bridge / fracture / sensitivity) plus the
          periodontal chart (pocket depth, BOP, recession, mobility,
          furcation) as sibling sub-tabs under one top-level tab so we
          don't bloat the patient strip with two near-identical labels. */}
      {activeTab === 'dental-chart' && (
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
          {chartSubTab === 'tooth' && <ToothChart patientId={patientId} dentistId={dentistId} patientName={patient?.name} dentistName={dentistName} />}
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
