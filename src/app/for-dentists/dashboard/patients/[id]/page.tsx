'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PerioChart from '@/components/dental/PerioChart'
import ToothChart from '@/components/dental/ToothChart'
import ImageVault from '@/components/dental/ImageVault'
import { downloadInvoicePdf } from '@/lib/invoicePdf'
import { type RxLang, RX_LANG_LABELS, INSTRUCTION_PHRASES, rxLangStorageKey, isRxLang } from '@/lib/instructionPhrases'
import ScheduleRecallButton from './ScheduleRecallButton'
import { whatsappLink } from '@/lib/phone'
import { getCityBySlug } from '@/config/cities'
import { TEAL, TEAL_DARK, BRAND_GRADIENT } from '@/app/dentist/[slug]/profileTheme'
import { PlusIcon, WhatsAppIcon, RupeeIcon, RecallIcon, PhoneIcon, DotsIcon, AlertIcon, PillIcon, CheckIcon, ChevronIcon } from '../../dashIcons'
import MedicineNameInput from '@/components/MedicineNameInput'
import { fetchMedicineHistory, type PastMedicine } from '@/lib/medicineHistory'
import { findBloodThinner, recordedState } from '@/lib/medicineWarnings'

// The patient page has 4 tabs. Old section ids still work as ?tab= deep links:
// they open the tab that now holds that section.
const TAB_GROUPS: { id: string; label: string; tabs: string[] }[] = [
  { id: 'summary', label: 'Summary', tabs: ['overview'] },
  // Visit notes, prescriptions, treatment plans and the timeline are one list.
  { id: 'visits', label: 'Visits', tabs: ['visits', 'prescriptions', 'treatment-plan', 'timeline'] },
  { id: 'bills', label: 'Bills', tabs: ['invoices'] },
  // Records opens like folders; `records` means all folders closed.
  { id: 'records', label: 'Records', tabs: ['images', 'dental-chart', 'consent', 'lab', 'emr', 'records'] },
]

const NAVY = '#0F172A'
const RED_BG = '#FEF2F2', RED_LINE = '#FECACA', RED_INK = '#991B1B'
const AMBER_BG = '#FEF3C7', AMBER_LINE = '#FDE68A', AMBER_INK = '#92400E'
const GREEN_BG = '#DCFCE7', GREEN_INK = '#166534'
const OPEN_PLAN = ['presented', 'accepted', 'in_progress']

// Fields the "Edit details" form can change.
const EDIT_FIELDS = ['name', 'phone', 'email', 'age', 'gender', 'blood_group', 'address', 'emergency_contact_name', 'emergency_contact_phone', 'allergies', 'current_medications', 'medical_history'] as const

// Two-column layout only when there is room next to the dashboard sidebar.
function useWide(minWidth: number) {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`)
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [minWidth])
  return wide
}

// Calendar day (YYYY-MM-DD, local time) of a date or timestamp value.
function dayOf(value: unknown): string {
  const s = String(value || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (isNaN(d.getTime())) return s.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDay(day: string, withYear = false): string {
  if (!day) return ''
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })
}
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`


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
  // The old inline "Treatment Plans" tab (id `plans`) was removed — its basic
  // create form was superseded by the richer /treatment-plan workflow route,
  // which the surviving `treatment-plan` tab launches. Land lingering
  // `?tab=plans` bookmarks on that single remaining tab.
  plans: 'treatment-plan',
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
  const [saving, setSaving] = useState(false)

  const [visitForm, setVisitForm] = useState({
    visit_date: new Date().toISOString().split('T')[0],
    chief_complaint: '', clinical_findings: '', treatment_done: '',
    materials_used: '', next_appointment_recommended: '', next_appointment_notes: '',
  })

  const [rxForm, setRxForm] = useState({
    template: '', medicines: [] as any[], instructions: '',
  })
  // Every medicine this dentist has prescribed before (any patient), for the
  // medicine-name auto-complete in the prescription form.
  const [medHistory, setMedHistory] = useState<PastMedicine[]>([])
  // Instruction language for the prescription form (persisted per dentist).
  const [rxLang, setRxLang] = useState<RxLang>('en')

  // Patient portal access toggle (Overview tab).
  const [portalSaving, setPortalSaving] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  // AI: smart drug suggestions for the prescription writer.
  const [diagnosis, setDiagnosis] = useState('')
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([])
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null)

  // Surfaced when a visit/prescription write is rejected (RLS denial or DB
  // error) so the modal stays open with the clinician's unsaved data instead
  // of silently closing. Kept separate from the AI-feature error states above.
  const [visitSaveError, setVisitSaveError] = useState<string | null>(null)
  const [rxSaveError, setRxSaveError] = useState<string | null>(null)

  // AI: quick-note templates + note refinement for the visit editor.
  const [showQuickNotes, setShowQuickNotes] = useState(false)
  const [refining, setRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)
  // Snapshot of the note before AI refinement so "Undo" can restore it.
  const [notesBeforeRefine, setNotesBeforeRefine] = useState<string | null>(null)

  // Patient header: next recall, next appointment, record counts, menus.
  const [nextRecall, setNextRecall] = useState<string | null>(null)
  const [nextAppt, setNextAppt] = useState<{ appt_date: string; time_slot: string | null } | null>(null)
  const [imageCount, setImageCount] = useState<number | null>(null)
  const [consentCount, setConsentCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAllVisits, setShowAllVisits] = useState(false)
  // Shown in the sticky tab bar once the safety card scrolls off a phone screen.
  const safetyRef = useRef<HTMLDivElement | null>(null)
  const [safetyOffscreen, setSafetyOffscreen] = useState(false)
  const wide = useWide(1100)

  // "Edit details" form.
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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
      fetchMedicineHistory(supabase, dentist.id).then(setMedHistory)
      // Header extras. Each is optional: a failure just leaves the line blank.
      const todayIso = dayOf(new Date().toISOString())
      const phoneOk = /^\+?\d{6,15}$/.test(String(p.phone || ''))
      const apptQuery = supabase.from('appointments').select('appt_date, time_slot')
        .eq('dentist_id', dentist.id).gte('appt_date', todayIso).not('status', 'in', '(cancelled,no_show)')
      Promise.all([
        supabase.from('recall_reminders').select('due_date').eq('patient_id', patientId).eq('dentist_id', dentist.id).eq('status', 'pending').order('due_date', { ascending: true }).limit(1),
        (phoneOk ? apptQuery.or(`patient_id.eq.${patientId},patient_phone.eq.${p.phone}`) : apptQuery.eq('patient_id', patientId))
          .order('appt_date', { ascending: true }).order('time_slot', { ascending: true }).limit(1),
        supabase.from('patient_images').select('id', { count: 'exact', head: true }).eq('patient_id', patientId).eq('dentist_id', dentist.id),
        supabase.from('consent_forms').select('id', { count: 'exact', head: true }).eq('patient_id', patientId).eq('dentist_id', dentist.id),
      ]).then(([rc, ap, im, cf]) => {
        if (!rc.error) setNextRecall(rc.data?.[0]?.due_date || null)
        if (!ap.error) setNextAppt(ap.data?.[0] || null)
        if (!im.error) setImageCount(im.count ?? null)
        if (!cf.error) setConsentCount(cf.count ?? null)
      })

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
    setVisitSaveError(null)
    const supabase = createClient()
    const { data, error } = await supabase.from('visits').insert({
      patient_id: patientId, dentist_id: dentistId,
      visit_date: visitForm.visit_date,
      chief_complaint: visitForm.chief_complaint || null,
      clinical_findings: visitForm.clinical_findings || null,
      treatment_done: visitForm.treatment_done || null,
      materials_used: visitForm.materials_used ? visitForm.materials_used.split(',').map(m => m.trim()) : [],
      next_appointment_recommended: visitForm.next_appointment_recommended || null,
      next_appointment_notes: visitForm.next_appointment_notes || null,
    }).select('*').single()
    // A silent RLS denial returns no error AND no row — treat both as failure so
    // we don't close the modal and lose the dentist's notes on a rejected write.
    if (error || !data) {
      setSaving(false)
      setVisitSaveError(error?.message || 'Failed to save visit. Please try again.')
      return  // keep modal open
    }
    setVisits(prev => [data, ...prev])
    setShowAddVisit(false)
    setVisitForm({ visit_date: new Date().toISOString().split('T')[0], chief_complaint: '', clinical_findings: '', treatment_done: '', materials_used: '', next_appointment_recommended: '', next_appointment_notes: '' })
    setNotesBeforeRefine(null)
    setShowQuickNotes(false)
    setRefineError(null)
    setSaving(false)
  }

  async function saveRx() {
    setSaving(true)
    setRxSaveError(null)
    const supabase = createClient()
    const { data, error } = await supabase.from('prescriptions').insert({
      patient_id: patientId, dentist_id: dentistId,
      // Drop empty rows (the form starts with one blank line to type into).
      medicines: rxForm.medicines.filter(m => String(m?.name || '').trim()),
      instructions: rxForm.instructions || null,
      template_used: rxForm.template || null,
    }).select('*').single()
    // A silent RLS denial returns no error AND no row — treat both as failure so
    // we don't close the modal and lose the prescription on a rejected write.
    if (error || !data) {
      setSaving(false)
      setRxSaveError(error?.message || 'Failed to save prescription. Please try again.')
      return  // keep modal open
    }
    setPrescriptions(prev => [data, ...prev])
    setShowAddRx(false)
    setRxForm({ template: '', medicines: [], instructions: '' })
    resetAiSuggestions()
    setSaving(false)
    fetchMedicineHistory(supabase, dentistId).then(setMedHistory)
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
    // Copy the rows so editing a medicine never changes the template itself.
    const meds = (PRESCRIPTION_TEMPLATES[templateName as keyof typeof PRESCRIPTION_TEMPLATES] || []).map(m => ({ ...m }))
    setRxForm(f => ({ ...f, template: templateName, medicines: meds }))
  }

  function updateMed(i: number, patch: Record<string, string>) {
    setRxForm(f => ({ ...f, medicines: f.medicines.map((m, j) => j === i ? { ...m, ...patch } : m) }))
  }

  // Picked from the dentist's own history: fill the name and what they used
  // last time. This form has one dose column, so dose + frequency share it.
  function pickPastMedicine(i: number, m: PastMedicine) {
    updateMed(i, {
      name: m.name,
      dosage: [m.dosage, m.frequency].filter(Boolean).join(' '),
      duration: m.duration,
      instructions: m.instructions,
    })
  }

  function openNewRx() {
    resetAiSuggestions()
    setRxSaveError(null)
    // Start with one empty line so the dentist can type a medicine straight away.
    setRxForm(f => f.medicines.length ? f : { ...f, medicines: [{ name: '', dosage: '', duration: '', instructions: '' }] })
    setShowAddRx(true)
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

  // Watch the safety card so the phone tab bar can repeat the allergy line
  // once the card has scrolled away.
  useEffect(() => {
    const el = safetyRef.current
    if (!el || wide) return
    const io = new IntersectionObserver(([e]) => setSafetyOffscreen(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [wide, loading])

  function openEdit() {
    setEditForm(Object.fromEntries(EDIT_FIELDS.map(k => [k, patient?.[k] == null ? '' : String(patient[k])])))
    setEditError(null)
    setMenuOpen(false)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!String(editForm.name || '').trim() || !String(editForm.phone || '').trim()) { setEditError('Name and phone are required'); return }
    setEditSaving(true)
    setEditError(null)
    const patch: Record<string, string | number | null> = {}
    for (const k of EDIT_FIELDS) {
      const v = String(editForm[k] || '').trim()
      patch[k] = k === 'age' ? (v ? parseInt(v, 10) || null : null) : (v || null)
    }
    const supabase = createClient()
    // .select() so an RLS denial shows as an error instead of a silent no-op.
    const { data, error } = await supabase.from('patients').update(patch).eq('id', patientId).eq('dentist_id', dentistId).select('*')
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    if (!data || data.length === 0) { setEditError('Update rejected. You may not have permission to edit this patient.'); return }
    setPatient(data[0])
    setEditOpen(false)
  }

  function goToPortal() {
    setMenuOpen(false)
    setActiveTab('overview')
    setTimeout(() => document.getElementById('patient-portal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, display: 'block' as const, marginBottom: 4 }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading patient...</p></div>
  if (!patient) return null

  const group = TAB_GROUPS.find(g => g.tabs.includes(activeTab)) || TAB_GROUPS[0]
  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
  const cardTitle: React.CSSProperties = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, margin: 0 }
  const linkBtn: React.CSSProperties = { border: 'none', background: 'none', color: TEAL_DARK, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none', padding: '4px 0', minHeight: 0 }

  // ---- numbers used in several places ----
  const due = invoices.filter((i: any) => i.payment_status !== 'paid').reduce((sum: number, i: any) => sum + Number(i.total || 0), 0)
  const unpaid = invoices.filter((i: any) => i.payment_status !== 'paid')
  const openPlans = plans.filter((pl: any) => OPEN_PLAN.includes(pl.status))
  const lastVisit = visits[0]

  // ---- identity ----
  const nameParts = String(patient.name || '').trim().split(/\s+/).filter(Boolean)
  const initials = nameParts.length === 0 ? '?' : nameParts.length === 1 ? nameParts[0].slice(0, 2).toUpperCase() : (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
  const meta = [patient.age ? `${patient.age} yrs` : null, patient.gender, patient.blood_group, patient.uhid ? `ID ${patient.uhid}` : null].filter(Boolean).join(' · ')
  const waHref = whatsappLink(patient.phone)
  const telHref = patient.phone ? `tel:${String(patient.phone).replace(/[^\d+]/g, '')}` : null

  const identity = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: BRAND_GRADIENT, color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, margin: 0, lineHeight: 1.2 }}>{patient.name}</h1>
        {meta && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{meta}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {due > 0 && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, color: AMBER_INK }}>{rupees(due)} due</span>}
          {lastVisit?.visit_date && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>Last visit {fmtDay(dayOf(lastVisit.visit_date))}</span>}
        </div>
      </div>
    </div>
  )

  // ---- safety card: allergies, daily medicines, conditions ----
  const allergyState = recordedState(patient.allergies)
  const medsState = recordedState(patient.current_medications)
  const historyState = recordedState(patient.medical_history)
  const thinner = medsState === 'value' ? findBloodThinner(patient.current_medications) : null
  const safetyRow = (bg: string, iconBg: string, ink: string, icon: React.ReactNode, label: string, value: React.ReactNode, note?: string, action?: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: bg, borderTop: `1px solid ${RED_LINE}` }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: iconBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: ink }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: ink, overflowWrap: 'anywhere' }}>{value}</div>
        {note && <div style={{ fontSize: 12, fontWeight: 600, color: ink, marginTop: 2 }}>{note}</div>}
      </div>
      {action}
    </div>
  )
  const editLink = <button type="button" onClick={openEdit} style={{ ...linkBtn, fontSize: 12, alignSelf: 'center' }}>Edit</button>
  const nothingRecorded = allergyState === 'blank' && medsState === 'blank' && historyState === 'blank'
  const safetyCard = nothingRecorded ? (
    <div ref={safetyRef} style={{ border: '1.5px dashed #94A3B8', background: '#fff', borderRadius: 14, display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px' }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: '#E2E8F0', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>?</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)' }}>Allergies and medicines</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Nothing recorded yet</div>
      </div>
      <button type="button" onClick={openEdit} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Add</button>
    </div>
  ) : (
    <div ref={safetyRef} style={{ border: `1.5px solid ${allergyState === 'value' ? RED_LINE : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden', marginTop: 0 }}>
      <div style={{ marginTop: -1 }}>
        {allergyState === 'value' && safetyRow(RED_BG, '#DC2626', RED_INK, <AlertIcon />, 'Allergy', patient.allergies, undefined, editLink)}
        {allergyState === 'none' && safetyRow(GREEN_BG, '#16A34A', GREEN_INK, <CheckIcon size={14} />, 'Allergy', 'No known allergies', undefined, editLink)}
        {allergyState === 'blank' && safetyRow('#fff', '#94A3B8', 'var(--muted)', <span style={{ fontWeight: 800 }}>?</span>, 'Allergy', 'Not recorded', undefined, editLink)}
        {medsState === 'value' && safetyRow(AMBER_BG, '#D97706', AMBER_INK, <PillIcon size={14} />, 'Takes daily', patient.current_medications, thinner ? 'Blood thinner: check before extraction' : undefined)}
        {medsState === 'none' && safetyRow('#fff', '#16A34A', GREEN_INK, <CheckIcon size={14} />, 'Takes daily', 'No regular medicines')}
        {historyState === 'value' && safetyRow('#fff', NAVY, 'var(--text)', <PlusIcon size={14} />, 'Conditions', patient.medical_history)}
      </div>
    </div>
  )

  // ---- actions ----
  const actionBase: React.CSSProperties = { height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 14, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'var(--font-body)', padding: '0 6px', width: '100%' }
  const actions = (
    <div style={{ display: 'grid', gap: 8 }}>
      <Link href={`/for-dentists/dashboard/visit/${patientId}`} style={{ ...actionBase, height: 50, fontSize: 15, background: TEAL, borderColor: TEAL, color: '#fff' }}>
        <PlusIcon size={16} /> Start visit
      </Link>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <Link href={`/for-dentists/dashboard/billing?patient_id=${patientId}`} style={actionBase}><RupeeIcon size={16} /> Bill</Link>
        {waHref
          ? <a href={waHref} target="_blank" rel="noopener noreferrer" style={{ ...actionBase, color: '#128C7E' }}><WhatsAppIcon size={16} /> WhatsApp</a>
          : <span title="No phone number saved" style={{ ...actionBase, color: '#94A3B8', cursor: 'not-allowed' }}>WhatsApp</span>}
        <ScheduleRecallButton patientId={patientId} dentistId={dentistId}
          onScheduled={d => setNextRecall(prev => (!prev || d < prev ? d : prev))}
          buttonStyle={{ ...actionBase, flexDirection: 'column', gap: 0, lineHeight: 1.15 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RecallIcon size={16} /> Recall</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{nextRecall ? fmtDay(nextRecall) : 'Not set'}</span>
        </ScheduleRecallButton>
      </div>
    </div>
  )

  // ---- contact + rarely used links ----
  const contactRows = [
    { label: 'Phone', value: patient.phone },
    { label: 'Email', value: patient.email },
    { label: 'Address', value: patient.address },
    { label: 'Emergency', value: patient.emergency_contact_name ? `${patient.emergency_contact_name}${patient.emergency_contact_phone ? ` · ${patient.emergency_contact_phone}` : ''}` : null },
  ].filter(i => i.value)
  const contact = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)' }}>Contact</span>
        <button type="button" onClick={openEdit} style={{ ...linkBtn, fontSize: 12 }}>Edit</button>
      </div>
      {contactRows.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No contact details saved.</div>}
      {contactRows.map(item => (
        <div key={item.label} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 0' }}>
          <span style={{ color: 'var(--muted)', width: 72, flexShrink: 0 }}>{item.label}</span>
          <span style={{ overflowWrap: 'anywhere' }}>{item.value}</span>
        </div>
      ))}
    </div>
  )
  const moreItems: { key: string; label: string; sub?: string; icon: React.ReactNode; href?: string; onClick?: () => void }[] = [
    ...(telHref ? [{ key: 'call', label: 'Call patient', sub: String(patient.phone), icon: <PhoneIcon size={18} />, href: telHref }] : []),
    { key: 'edit', label: 'Edit patient details', icon: <span style={{ fontWeight: 800 }}>✎</span>, onClick: openEdit },
    { key: 'portal', label: 'Patient portal', sub: patient.portal_access ? 'On. Send login link on WhatsApp' : 'Off. Let the patient see records online', icon: <span style={{ fontWeight: 800 }}>↗</span>, onClick: goToPortal },
    { key: 'history', label: 'Full history', sub: 'Every visit, bill, X-ray and appointment', icon: <RecallIcon size={18} />, href: `/for-dentists/dashboard/patients/${patientId}/timeline` },
  ]

  // ---- tabs ----
  const tabCount = (id: string) => id === 'visits' ? visits.length : id === 'bills' ? unpaid.length : 0
  const tabs = (
    <div role="tablist" style={{ display: 'flex', background: '#fff', ...(wide ? { borderRadius: 14, border: '1px solid var(--border)', padding: '0 6px' } : {}) }}>
      {TAB_GROUPS.map(g => {
        const on = g.id === group.id
        const n = tabCount(g.id)
        return (
          <button key={g.id} role="tab" aria-selected={on} onClick={() => setActiveTab(g.tabs[0])}
            style={{ flex: wide ? '0 0 auto' : 1, padding: wide ? '14px 20px 11px' : '12px 2px 9px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: on ? 800 : 600, color: on ? 'var(--text)' : 'var(--muted)', borderBottom: `3px solid ${on ? TEAL : 'transparent'}`, whiteSpace: 'nowrap' }}>
            {g.label}
            {n > 0 && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, padding: '0 6px', borderRadius: 999, background: g.id === 'bills' ? AMBER_BG : 'var(--bg)', color: g.id === 'bills' ? AMBER_INK : 'var(--muted)', border: `1px solid ${g.id === 'bills' ? AMBER_LINE : 'var(--border)'}` }}>{n}</span>}
          </button>
        )
      })}
    </div>
  )

  // ---- open treatment plan card (Summary + Visits) ----
  const planCard = (pl: any) => {
    const steps = [...(pl.treatment_plan_steps || [])].sort((a: any, b: any) => (a.step_number || 0) - (b.step_number || 0))
    const done = steps.filter((s: any) => s.status === 'completed').length
    const total = Number(pl.total_estimated_cost || pl.total_cost || 0)
    const pct = steps.length ? Math.round((done / steps.length) * 100) : 0
    return (
      <div key={pl.id} style={{ background: NAVY, color: '#fff', borderRadius: 14, padding: 16 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Open treatment: {pl.title}</div>
        <div style={{ fontSize: 12.5, color: '#CBD5E1', marginTop: 2 }}>
          {[steps.length ? `${done} of ${steps.length} done` : null, total > 0 ? `${rupees(total)} total` : null, pl.status === 'presented' ? 'Patient said later' : null].filter(Boolean).join(' · ')}
        </div>
        {steps.length > 0 && (
          <>
            <div style={{ height: 6, background: 'rgba(255,255,255,.18)', borderRadius: 99, margin: '10px 0 8px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: TEAL }} /></div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              {steps.slice(0, 5).map((s: any) => {
                const ok = s.status === 'completed'
                const tooth = s.tooth_numbers || s.tooth_number
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', color: s.status === 'skipped' ? '#64748B' : '#fff' }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ok ? TEAL : 'transparent', border: ok ? 'none' : '1.5px solid #64748B', color: NAVY }}>{ok && <CheckIcon size={11} />}</span>
                    <span>{s.treatment_name}{tooth ? `, tooth ${tooth}` : ''}{ok && s.completed_at ? ` · ${fmtDay(dayOf(s.completed_at))}` : ''}</span>
                  </div>
                )
              })}
              {steps.length > 5 && <div style={{ fontSize: 12, color: '#CBD5E1' }}>+{steps.length - 5} more steps</div>}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Link href={`/for-dentists/dashboard/visit/${patientId}`} style={{ flex: 1, textAlign: 'center', padding: 9, borderRadius: 10, fontWeight: 700, fontSize: 13, background: TEAL, color: NAVY, textDecoration: 'none' }}>Next sitting</Link>
          <Link href={`/for-dentists/dashboard/patients/${patientId}/treatment-plan`} style={{ flex: 1, textAlign: 'center', padding: 9, borderRadius: 10, fontWeight: 700, fontSize: 13, border: '1px solid #334155', color: '#fff', textDecoration: 'none' }}>View plan</Link>
        </div>
      </div>
    )
  }

  // ---- Visits timeline: each visit with the prescriptions, plans and bills from that day ----
  type Entry = { key: string; day: string; visit?: any; rxs: any[]; plans: any[]; bills: any[] }
  const entries: Entry[] = []
  const byDay = new Map<string, Entry>()
  for (const v of visits) {
    const e: Entry = { key: `v-${v.id}`, day: dayOf(v.visit_date), visit: v, rxs: [], plans: [], bills: [] }
    entries.push(e)
    if (!byDay.has(e.day)) byDay.set(e.day, e)
  }
  const entryFor = (day: string, key: string) => {
    let e = byDay.get(day)
    if (!e) { e = { key, day, rxs: [], plans: [], bills: [] }; byDay.set(day, e); entries.push(e) }
    return e
  }
  for (const rx of prescriptions) entryFor(dayOf(rx.created_at), `rx-${rx.id}`).rxs.push(rx)
  for (const pl of plans) entryFor(dayOf(pl.created_at), `pl-${pl.id}`).plans.push(pl)
  for (const inv of invoices) entryFor(dayOf(inv.invoice_date), `inv-${inv.id}`).bills.push(inv)
  entries.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
  const shownEntries = showAllVisits ? entries : entries.slice(0, 8)

  const pill = (color: string, children: React.ReactNode, key?: string) => (
    <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#fff', border: '1px solid var(--border)', color }}>{children}</span>
  )
  const rxBlock = (rx: any) => {
    const meds = (rx.medicines || []).map((m: any) => [m.name, m.dosage, m.duration].filter(Boolean).join(' ')).filter(Boolean)
    const phone = String(patient.phone || '').replace(/\D/g, '').slice(-10)
    const clinic = dentistMeta?.clinic_name || dentistMeta?.name || 'your clinic'
    const link = typeof window !== 'undefined' ? `${window.location.origin}/api/prescriptions/pdf?id=${rx.id}` : `/api/prescriptions/pdf?id=${rx.id}`
    return (
      <div key={rx.id} style={{ background: '#fff', border: '1px solid #E9D5FF', borderRadius: 10, padding: '8px 10px', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: '#7C3AED', display: 'flex' }}><PillIcon size={14} /></span>
          <b style={{ color: '#5B21B6' }}>{rx.template_used || 'Prescription'}</b>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <a href={`/api/prescriptions/pdf?id=${rx.id}`} target="_blank" rel="noopener noreferrer" style={{ ...linkBtn, fontSize: 12 }}>PDF</a>
            {phone.length === 10 && <a href={`https://wa.me/91${phone}?text=${encodeURIComponent(`Your prescription from ${clinic}: ${link}`)}`} target="_blank" rel="noopener noreferrer" style={{ ...linkBtn, fontSize: 12, color: '#128C7E' }}>Send</a>}
          </span>
        </div>
        {meds.length > 0 && <div style={{ color: 'var(--text)', marginTop: 4 }}>{meds.join(', ')}</div>}
        {rx.instructions && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{rx.instructions}</div>}
      </div>
    )
  }
  const visitTitle = (e: Entry) => {
    if (e.visit) return e.visit.chief_complaint || (e.visit.treatment_done ? String(e.visit.treatment_done).split(/[.\n]/)[0].slice(0, 60) : 'Visit')
    if (e.plans.length) return 'Treatment plan made'
    if (e.rxs.length) return 'Prescription'
    return 'Bill'
  }
  const field = (label: string, text: unknown) => text ? (
    <div style={{ marginTop: 4 }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.4 }}>{label} </span><span>{String(text)}</span></div>
  ) : null
  const visitCard = (e: Entry) => {
    const v = e.visit
    const hasAttachments = e.rxs.length + e.plans.length + e.bills.length > 0
    return (
      <div key={e.key} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '12px 14px 4px' }}>
          <b style={{ fontFamily: 'var(--font-heading)', fontSize: 14 }}>{visitTitle(e)}</b>
          <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDay(e.day)}</span>
        </div>
        {v && (
          <div style={{ padding: '0 14px 12px', fontSize: 13.5, color: '#334155' }}>
            {field('FINDINGS', v.clinical_findings)}
            {field('DONE', v.treatment_done)}
            {v.materials_used?.length > 0 && field('MATERIALS', v.materials_used.join(', '))}
            {v.next_appointment_recommended && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: GREEN_INK }}>Next visit: {fmtDay(dayOf(v.next_appointment_recommended), true)}{v.next_appointment_notes ? `, ${v.next_appointment_notes}` : ''}</div>}
          </div>
        )}
        {hasAttachments && (
          <div style={{ display: 'grid', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
            {e.rxs.map(rxBlock)}
            {(e.plans.length > 0 || e.bills.length > 0) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {e.plans.map((pl: any) => (
                  <Link key={pl.id} href={`/for-dentists/dashboard/patients/${patientId}/treatment-plan`} style={{ textDecoration: 'none' }}>
                    {pill(NAVY, <>Plan: {pl.title}{Number(pl.total_estimated_cost || pl.total_cost || 0) > 0 ? ` · ${rupees(Number(pl.total_estimated_cost || pl.total_cost))}` : ''}</>)}
                  </Link>
                ))}
                {e.bills.map((inv: any) => (
                  <button key={inv.id} type="button" onClick={() => setActiveTab('invoices')} style={{ border: 'none', background: 'none', padding: 0, minHeight: 0, cursor: 'pointer' }}>
                    {pill(inv.payment_status === 'paid' ? GREEN_INK : AMBER_INK, `${rupees(Number(inv.total || 0))} ${inv.payment_status === 'paid' ? 'paid' : 'due'}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---- Records folders ----
  const recordSections: { id: string; label: string; sub: string; icon: string }[] = [
    { id: 'images', label: 'X-rays and photos', sub: imageCount == null ? 'Upload and view X-rays and photos' : imageCount === 0 ? 'Nothing yet' : `${imageCount} file${imageCount === 1 ? '' : 's'}`, icon: '▣' },
    { id: 'dental-chart', label: 'Dental chart', sub: 'Tooth chart and gum chart', icon: '◠' },
    { id: 'consent', label: 'Consent forms', sub: consentCount == null ? 'Patient signs on screen' : consentCount === 0 ? 'Nothing yet' : `${consentCount} signed`, icon: '✎' },
    { id: 'lab', label: 'Lab work', sub: labWork.length === 0 ? 'Nothing sent yet' : `${labWork.length} case${labWork.length === 1 ? '' : 's'}`, icon: '⚗' },
    { id: 'emr', label: 'Medical record (EMR)', sub: 'Full clinical record form', icon: '⎘' },
  ]

  return (
    <div>
      <div style={{ maxWidth: wide ? 1240 : 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Link href="/for-dentists/dashboard/patients" style={{ color: TEAL_DARK, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>‹ Patients</Link>
        {!wide && (
          <button type="button" aria-label="More options" onClick={() => setMenuOpen(true)}
            style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <DotsIcon />
          </button>
        )}
      </div>

      <div style={wide ? { display: 'grid', gridTemplateColumns: '330px minmax(0, 1fr)', gap: 20, alignItems: 'start' } : undefined}>
        {/* Patient, safety and actions. Fixed on the left on wide screens. */}
        <aside style={wide
          ? { ...card, padding: 18, display: 'grid', gap: 14, position: 'sticky', top: 0, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }
          : { ...card, display: 'grid', gap: 12, marginBottom: 12 }}>
          {identity}
          {safetyCard}
          {actions}
          {wide && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>{contact}</div>}
          {wide && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 2 }}>
              {moreItems.filter(m => m.key !== 'call').map(m => m.href
                ? <Link key={m.key} href={m.href} style={{ ...linkBtn, padding: '5px 0', textAlign: 'left' }}>{m.label}</Link>
                : <button key={m.key} type="button" onClick={m.onClick} style={{ ...linkBtn, padding: '5px 0', textAlign: 'left' }}>{m.label}</button>)}
            </div>
          )}
        </aside>

        <section style={{ minWidth: 0 }}>
          {/* Tabs. On phones they stick to the top and repeat the allergy line
              once the safety card has scrolled away. */}
          <div style={wide ? { marginBottom: 16 } : { position: 'sticky', top: 0, zIndex: 20, marginBottom: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: safetyOffscreen ? '0 4px 12px rgba(15,23,42,.08)' : 'none' }}>
            {!wide && safetyOffscreen && allergyState === 'value' && (
              <div style={{ background: RED_BG, borderBottom: `1px solid ${RED_LINE}`, color: RED_INK, fontSize: 13, fontWeight: 700, padding: '7px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: '#DC2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AlertIcon size={13} /></span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{patient.name}: allergic to {patient.allergies}</span>
              </div>
            )}
            {tabs}
          </div>

      {/* SUMMARY */}
      {group.id === 'summary' && (
        <div style={{ display: 'grid', gridTemplateColumns: wide ? 'minmax(0, 1.3fr) minmax(0, 1fr)' : '1fr', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            {openPlans.slice(0, 1).map(planCard)}
            {openPlans.length > 1 && <button type="button" onClick={() => setActiveTab('visits')} style={{ ...linkBtn, textAlign: 'left' }}>{openPlans.length - 1} more open plan{openPlans.length > 2 ? 's' : ''} in Visits</button>}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={cardTitle}>{visits.length > 1 ? 'Recent visits' : 'Last visit'}</h3>
                {visits.length > 0 && <button type="button" onClick={() => setActiveTab('visits')} style={linkBtn}>All {visits.length} ›</button>}
              </div>
              {visits.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No visits yet. Tap Start visit when the patient is in the chair.</div>}
              {visits.slice(0, wide ? 3 : 1).map((v: any, i: number) => (
                <div key={v.id} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 13.5 }}>
                  <b>{fmtDay(dayOf(v.visit_date))} · {v.chief_complaint || 'Visit'}</b>
                  {v.treatment_done && <div style={{ color: 'var(--muted)' }}>{String(v.treatment_done).length > 110 ? `${String(v.treatment_done).slice(0, 110)}…` : v.treatment_done}</div>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={card}>
              <h3 style={{ ...cardTitle, marginBottom: 4 }}>At a glance</h3>
              {[
                { label: 'Next appointment', value: nextAppt ? `${fmtDay(nextAppt.appt_date, true)}${nextAppt.time_slot ? `, ${nextAppt.time_slot}` : ''}` : 'Not booked' },
                { label: 'Amount due', value: due > 0 ? rupees(due) : 'Nothing due', color: due > 0 ? AMBER_INK : undefined },
                { label: 'Recall', value: nextRecall ? fmtDay(nextRecall, true) : 'Not set' },
                { label: 'Patient since', value: patient.created_at ? new Date(patient.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '' },
                { label: 'Visits', value: String(visits.length) },
              ].filter(r => r.value).map((r, i) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 13.5 }}>
                  <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                  <span style={{ fontWeight: 700, color: r.color || 'var(--text)', textAlign: 'right' }}>{r.value}</span>
                </div>
              ))}
            </div>
            {unpaid.length > 0 && (
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={cardTitle}>Unpaid {unpaid.length === 1 ? 'bill' : 'bills'}</h3>
                  <button type="button" onClick={() => setActiveTab('invoices')} style={linkBtn}>Bills ›</button>
                </div>
                {unpaid.slice(0, 3).map((inv: any, i: number) => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 13.5 }}>
                    <span style={{ color: 'var(--muted)' }}>{inv.invoice_no} · {fmtDay(dayOf(inv.invoice_date))}</span>
                    <b>{rupees(Number(inv.total || 0))}</b>
                  </div>
                ))}
              </div>
            )}
            {!wide && <div style={card}>{contact}</div>}
          {/* PATIENT PORTAL — enable/disable the patient's self-service portal
              (dentistinmumbai.in/patient) where they log in with their own
              mobile number to view appointments, prescriptions and invoices. */}
          <div id="patient-portal" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', scrollMarginTop: 70 }}>
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
              {patient.portal_access && (() => {
                // Patient app link. The patient logs in with this mobile
                // number (OTP) and sees every clinic that has the portal on
                // for it, in any city. Clinic's own domain for branding.
                const portalUrl = `https://${getCityBySlug(dentistMeta?.city).domain}/patient`
                const message = `Hi ${patient.name}, you can now see your appointments, treatment plan, prescriptions and bills in the DentistIn app: ${portalUrl}\nLog in with this mobile number. You can add it to your home screen. - Dr. ${dentistName}${dentistMeta?.clinic_name ? `, ${dentistMeta.clinic_name}` : ''}`
                const href = whatsappLink(patient.phone, message)
                return href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: '#25D366', color: '#fff', textDecoration: 'none' }}>
                    Send app link on WhatsApp
                  </a>
                ) : null
              })()}
            </div>
            {patient.portal_last_login && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
                Last portal login: {new Date(patient.portal_last_login).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            )}
          </div>
          </div>
        </div>
      )}

      {/* VISITS: one timeline with notes, prescriptions, plans and bills */}
      {group.id === 'visits' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {[
              { key: 'v', label: '+ Visit note', onClick: () => { setVisitSaveError(null); setShowAddVisit(true) } },
              { key: 'rx', label: '+ Prescription', onClick: openNewRx },
            ].map(b => (
              <button key={b.key} type="button" onClick={b.onClick} style={{ padding: '10px 4px', borderRadius: 10, border: '1.5px dashed #CBD5E1', background: '#fff', color: TEAL_DARK, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{b.label}</button>
            ))}
            <Link href={`/for-dentists/dashboard/patients/${patientId}/treatment-plan`} style={{ padding: '10px 4px', borderRadius: 10, border: '1.5px dashed #CBD5E1', background: '#fff', color: TEAL_DARK, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>+ Plan</Link>
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
              {visitSaveError && (
                <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 8 }}>
                  {visitSaveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAddVisit(false); setShowQuickNotes(false); setRefineError(null) }} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                <button onClick={saveVisit} disabled={saving} style={{ padding: '9px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Save Visit'}</button>
              </div>
            </div>
          )}
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
              <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Medicines</label>
                  {medHistory.length > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-2px 0 8px' }}>Start typing a name to pick from medicines you have prescribed before.</p>
                  )}
                  {rxForm.medicines.map((med, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      {med.aiSuggested && (
                        <span style={{ display: 'inline-block', marginBottom: 4, fontSize: 10, fontWeight: 700, color: '#5B21B6', background: '#EDE9FE', padding: '2px 8px', borderRadius: 10 }}>✨ AI suggested</span>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 8 }}>
                        <MedicineNameInput value={med.name} onChange={name => updateMed(i, { name })} onPick={pm => pickPastMedicine(i, pm)}
                          history={medHistory} placeholder="Medicine name" ariaLabel={`Medicine ${i + 1} name`} style={inputStyle} />
                        <input value={med.dosage} onChange={e => updateMed(i, { dosage: e.target.value })} placeholder="Dosage & freq (1-0-1)" style={inputStyle} />
                        <input value={med.duration} onChange={e => updateMed(i, { duration: e.target.value })} placeholder="5 days" style={inputStyle} />
                        <input value={med.instructions} onChange={e => updateMed(i, { instructions: e.target.value })} placeholder="Instructions" style={inputStyle} />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setRxForm(f => ({ ...f, medicines: [...f.medicines, { name: '', dosage: '', duration: '', instructions: '' }] }))}
                    style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Add medicine</button>
                </div>
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
              {rxSaveError && (
                <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 8 }}>
                  {rxSaveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAddRx(false); resetAiSuggestions() }} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                <button onClick={saveRx} disabled={saving} style={{ padding: '9px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Save Prescription'}</button>
              </div>
            </div>
          )}
          {openPlans.map(planCard)}
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)' }}>No visits yet.</div>
          ) : shownEntries.map((e, i) => {
            const month = e.day.slice(0, 7)
            const showMonth = i === 0 || shownEntries[i - 1].day.slice(0, 7) !== month
            return (
              <div key={e.key} style={{ display: 'grid', gap: 8 }}>
                {showMonth && e.day && <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: '4px 2px 0' }}>{new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>}
                {visitCard(e)}
              </div>
            )
          })}
          {!showAllVisits && entries.length > 8 && (
            <button type="button" onClick={() => setShowAllVisits(true)} style={{ ...linkBtn, padding: 6 }}>Show {entries.length - 8} older</button>
          )}
          <Link href={`/for-dentists/dashboard/patients/${patientId}/timeline`} style={{ ...linkBtn, textAlign: 'center', padding: 4, fontSize: 12.5 }}>Full history with X-rays, EMR and appointments ›</Link>
        </div>
      )}

      {/* INVOICES */}
      {group.id === 'bills' && (() => {
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

      {/* RECORDS: folders that open in place */}
      {group.id === 'records' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {recordSections.map((r, i) => {
            const open = activeTab === r.id
            return (
              <div key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <button type="button" aria-expanded={open} onClick={() => setActiveTab(open ? 'records' : r.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: open ? 'var(--bg)' : '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left', color: 'var(--text)' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 14 }}>{r.label}</b>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.sub}</span>
                  </span>
                  <span style={{ color: 'var(--muted)', display: 'flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><ChevronIcon /></span>
                </button>
                {open && (
                  <div style={{ padding: '4px 14px 16px', background: 'var(--bg)' }}>
                    {r.id === 'images' && <ImageVault patientId={patientId} dentistId={dentistId} />}
                    {r.id === 'dental-chart' && (
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
                    {r.id === 'consent' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Implant, extraction, RCT and whitening forms. The patient signs on screen.</p>
                        <Link href={`/for-dentists/dashboard/patients/${patientId}/consent`} style={{ padding: '8px 14px', background: TEAL, color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Open consent forms</Link>
                      </div>
                    )}
                    {r.id === 'emr' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Vitals, complaints, diagnosis, medicines, procedures and advice in one form.</p>
                        <Link href={`/for-dentists/dashboard/patients/${patientId}/emr/new`} style={{ padding: '8px 14px', background: TEAL, color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>+ New EMR record</Link>
                      </div>
                    )}
                    {r.id === 'lab' && (
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
                )}
              </div>
            )
          })}
        </div>
      )}
        </section>
      </div>

      {/* Phone "⋯" menu */}
      {menuOpen && (
        <div role="dialog" aria-modal="true" aria-label="More options" onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', padding: '10px 16px calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ width: 40, height: 4, background: '#CBD5E1', borderRadius: 9, margin: '0 auto 8px' }} />
            {moreItems.map((m, i) => {
              const inner = (
                <>
                  <span style={{ width: 34, display: 'flex', justifyContent: 'center', color: 'var(--muted)', fontSize: 17 }}>{m.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{m.label}</span>
                    {m.sub && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{m.sub}</span>}
                  </span>
                </>
              )
              const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 4px', minHeight: 52, background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }
              return m.href
                ? <a key={m.key} href={m.href} onClick={() => setMenuOpen(false)} style={rowStyle}>{inner}</a>
                : <button key={m.key} type="button" onClick={m.onClick} style={rowStyle}>{inner}</button>
            })}
          </div>
        </div>
      )}

      {/* Edit patient details */}
      {editOpen && (
        <div role="dialog" aria-modal="true" aria-label="Edit patient details"
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, margin: 0 }}>Edit patient details</h2>
              <button type="button" aria-label="Close" onClick={() => !editSaving && setEditOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1', background: RED_BG, border: `1px solid ${RED_LINE}`, borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: RED_INK, letterSpacing: 0.5 }}>SAFETY. Write &quot;None&quot; if the patient has none.</div>
                <div>
                  <label style={labelStyle}>Allergies</label>
                  <input value={editForm.allergies || ''} onChange={e => setEditForm(f => ({ ...f, allergies: e.target.value }))} placeholder="e.g. Penicillin, Latex, or None" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Medicines taken daily</label>
                  <input value={editForm.current_medications || ''} onChange={e => setEditForm(f => ({ ...f, current_medications: e.target.value }))} placeholder="e.g. Ecosprin 75, Metformin 500, or None" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Conditions / medical history</label>
                  <textarea value={editForm.medical_history || ''} onChange={e => setEditForm(f => ({ ...f, medical_history: e.target.value }))} placeholder="Diabetes, BP, heart problems, pregnancy, past surgery..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
              {([
                ['name', 'Name', 'text', true], ['phone', 'Phone', 'tel', false], ['age', 'Age', 'number', false], ['email', 'Email', 'email', false],
              ] as [string, string, string, boolean][]).map(([k, label, type, full]) => (
                <div key={k} style={full ? { gridColumn: '1/-1' } : undefined}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} value={editForm[k] || ''} onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Gender</label>
                <select value={editForm.gender || ''} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select</option>
                  {['Male', 'Female', 'Other'].map(g => <option key={g}>{g}</option>)}
                  {editForm.gender && !['Male', 'Female', 'Other'].includes(editForm.gender) && <option>{editForm.gender}</option>}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Blood group</label>
                <select value={editForm.blood_group || ''} onChange={e => setEditForm(f => ({ ...f, blood_group: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}
                  {editForm.blood_group && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(editForm.blood_group) && <option>{editForm.blood_group}</option>}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Address</label>
                <input value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Emergency contact</label>
                <input value={editForm.emergency_contact_name || ''} onChange={e => setEditForm(f => ({ ...f, emergency_contact_name: e.target.value }))} placeholder="Name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Emergency phone</label>
                <input type="tel" value={editForm.emergency_contact_phone || ''} onChange={e => setEditForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            {editError && <div style={{ margin: '0 20px 10px', background: '#FEE2E2', border: `1px solid ${RED_LINE}`, color: RED_INK, padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{editError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => !editSaving && setEditOpen(false)} style={{ padding: '9px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button type="button" onClick={saveEdit} disabled={editSaving} style={{ padding: '9px 20px', background: TEAL, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: editSaving ? 0.7 : 1 }}>{editSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
