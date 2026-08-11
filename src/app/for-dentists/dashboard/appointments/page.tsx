'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resolveCurrentDentist } from '@/lib/currentDentist'

type FilterKey = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

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

// Native <input type="time"> renders as an OS-level picker whose layout
// varies wildly between Android webviews and desktop browsers — multiple
// dentists reported a picker that surfaces only Clear/Cancel with no
// hour/minute wheel. A plain <select> with a fixed slot list sidesteps
// the picker entirely and matches the half-hour cadence most clinics
// actually book on.
const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM', '08:00 PM',
]

// Status values mirror the DB constraint exactly: pending, confirmed,
// completed, cancelled, no_show. The dropdown labels and tab labels below
// are the human-readable presentation of those same values.
//
// no_show has its own muted-red palette (distinct from cancelled's brighter
// red and completed's grey) so the dentist can tell at a glance which
// closed-out rows were patient ghosting vs. routine closure — those are the
// rows worth follow-up calls or recall reminders.
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: 'waiting / walk-in' },
  confirmed: { bg: '#DBEAFE', text: '#1D4ED8', label: 'scheduled'         },
  completed: { bg: '#E5E7EB', text: '#374151', label: 'completed'         },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'cancelled'         },
  no_show:   { bg: '#FFE4E6', text: '#9F1239', label: 'no show'           },
}

function matchesFilter(status: string, filter: FilterKey): boolean {
  if (filter === 'all') return true
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
  // Manual walk-in appointments don't set patient_id, but the dashboard's
  // "Start Consultation" / "Edit Patient" buttons need to deep-link to a
  // patient record. Resolve via phone-number match so those buttons work even
  // when the appointment row never got linked. Keys are digits-only so a phone
  // saved as "+91 98xxxx" still matches "98xxxx".
  const [patientIdByPhone, setPatientIdByPhone] = useState<Map<string, string>>(new Map())
  const [filter, setFilter] = useState<FilterKey>('all')
  // Branch filter — 'all' shows every row regardless of location_id, a
  // specific id scopes to that branch only. Hidden in the UI when the
  // dentist has 1 or 0 clinic_locations rows.
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [locations, setLocations] = useState<{ id: string; name: string | null; is_primary: boolean }[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [recallToast, setRecallToast] = useState<string | null>(null)
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
    status: 'pending',
    notes: '',
    location_id: '',
  })

  // The Edit modal piggybacks on the same form shape as Add, plus the id of
  // the row being edited. editing === null means the modal is closed.
  const [editing, setEditing] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({
    patient_phone: '',
    appt_date: todayIsoLocal(),
    time_slot: '',
    treatment_id: '',
    status: 'pending',
    notes: '',
    location_id: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const dentist = await resolveCurrentDentist<{ id: string; name: string | null; clinic_name: string | null; whatsapp: string | null; phone: string | null }>(
          supabase,
          'id, name, clinic_name, whatsapp, phone',
        )
        if (!dentist) return
        setDentistId(dentist.id)
        setDentistMeta({
          name: dentist.name || '',
          clinic_name: dentist.clinic_name || '',
          whatsapp: dentist.whatsapp || dentist.phone || '',
        })

        const [{ data: appts }, { data: invs }, { data: tx }, { data: pts }, { data: locs }] = await Promise.all([
          supabase
            .from('appointments')
            .select('*, treatments(name, icon), clinic_locations(id, clinic_name)')
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
          supabase
            .from('patients')
            .select('id, phone')
            .eq('dentist_id', dentist.id),
          supabase
            .from('clinic_locations')
            .select('id, clinic_name, is_primary')
            .eq('dentist_id', dentist.id)
            .order('is_primary', { ascending: false })
            .order('created_at'),
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
        const pmap = new Map<string, string>()
        ;(pts || []).forEach((row: any) => {
          const digits = String(row.phone || '').replace(/\D/g, '')
          if (digits) pmap.set(digits, row.id)
        })
        setPatientIdByPhone(pmap)
        const tList = (tx || []).map((r: any) => r.treatments).filter(Boolean) as { id: string; name: string }[]
        setTreatments(tList)
        setLocations((locs || []).map((l: any) => ({ id: l.id, name: l.clinic_name, is_primary: !!l.is_primary })))

        // Load consent templates once for the consent modal
        const { data: tpls } = await supabase
          .from('consent_templates')
          .select('id, form_type, form_title, form_content')
          .order('form_title')
        setConsentTemplates((tpls || []) as { id: string; form_type: string; form_title: string; form_content: string }[])
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

    // Find-or-create the patient record FIRST so the new appointment lands
    // in both `appointments` AND `patients`. Without this, manual walk-ins
    // only ever lived in appointments and the Patients tab would read empty
    // even when appointments held dozens of rows. Match by dentist_id +
    // phone-digit tail so "+91 98xxxx" and "98xxxx" resolve to the same
    // row.
    const phoneRaw = form.patient_phone.trim()
    const phoneDigits = phoneRaw.replace(/\D/g, '')
    let patientId: string | null = null
    if (phoneDigits.length >= 4) {
      const tail = phoneDigits.slice(-10)
      const { data: existing } = await supabase
        .from('patients')
        .select('id')
        .eq('dentist_id', dentistId)
        .ilike('phone', `%${tail}`)
        .limit(1)
        .maybeSingle()
      if (existing?.id) patientId = existing.id
    }
    if (!patientId) {
      const { data: created, error: ptErr } = await supabase
        .from('patients')
        .insert({
          dentist_id: dentistId,
          name: form.patient_name.trim(),
          phone: phoneRaw,
        })
        .select('id')
        .single()
      if (ptErr) {
        setSaving(false)
        setAddError(`Could not create patient record: ${ptErr.message}`)
        return
      }
      patientId = created.id
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        dentist_id: dentistId,
        // Link to the new/existing patient row so the per-row Open Patient
        // File button resolves without falling back to a phone lookup.
        patient_id: patientId,
        patient_name: form.patient_name.trim(),
        patient_phone: phoneRaw,
        appt_date: form.appt_date,
        time_slot: form.time_slot.trim(),
        treatment_id: form.treatment_id || null,
        status: form.status,
        notes: form.notes.trim() || null,
        reference_no: generateRef(),
        location_id: form.location_id || null,
      })
      .select('*, treatments(name, icon), clinic_locations(id, clinic_name)')
      .single()
    setSaving(false)
    if (error) { setAddError(error.message); return }
    setAppointments(prev => [data, ...prev])
    // Keep the phone→patient map in sync so the Open Patient File buttons
    // on the just-added row (and any future row with this phone) resolve
    // immediately without a refetch.
    if (phoneDigits && patientId) {
      setPatientIdByPhone(prev => {
        const next = new Map(prev)
        next.set(phoneDigits, patientId!)
        return next
      })
    }
    setShowAdd(false)
    setForm({
      patient_name: '', patient_phone: '', appt_date: todayIsoLocal(),
      time_slot: '', treatment_id: '', status: 'pending', notes: '', location_id: '',
    })
  }

  function openEdit(a: any) {
    setEditError(null)
    setEditing(a)
    setEditForm({
      patient_phone: a.patient_phone || '',
      appt_date:     a.appt_date || todayIsoLocal(),
      time_slot:     a.time_slot || '',
      treatment_id:  a.treatment_id || '',
      status:        a.status || 'pending',
      notes:         a.notes || '',
      location_id:   a.location_id || '',
    })
  }

  async function saveEdit() {
    if (!editing) return
    setEditError(null)
    if (!editForm.appt_date || !editForm.time_slot.trim()) {
      setEditError('Date and time are required'); return
    }
    setEditSaving(true)
    try {
      const res = await fetch(`/api/dentist/appointments/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_phone: editForm.patient_phone.trim(),
          appt_date: editForm.appt_date,
          time_slot: editForm.time_slot.trim(),
          treatment_id: editForm.treatment_id || null,
          status: editForm.status,
          notes: editForm.notes.trim() || null,
          location_id: editForm.location_id || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditError(data.message || data.error || 'Update failed')
        return
      }
      setAppointments(prev => prev.map(x => x.id === editing.id ? (data.appointment || { ...x, ...editForm }) : x))
      setEditing(null)
    } catch (e: any) {
      setEditError(e?.message || 'Network error')
    } finally {
      setEditSaving(false)
    }
  }

  // Walk-ins where the row was created before the auto-link logic landed
  // still have no patient_id and no matching patient row. The "Create
  // Patient File" button below kicks off this handler — it creates the
  // patient row from the appointment's name+phone, links the appointment
  // back, then navigates the dentist to the new patient's profile.
  const [creatingPatientFor, setCreatingPatientFor] = useState<string | null>(null)

  // Consent modal state
  const [consentModal, setConsentModal] = useState<any | null>(null)
  const [consentTemplates, setConsentTemplates] = useState<{ id: string; form_type: string; form_title: string; form_content: string }[]>([])
  const [consentType, setConsentType] = useState('')
  const [consentContent, setConsentContent] = useState('')
  const [consentTitle, setConsentTitle] = useState('')
  const [consentSending, setConsentSending] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  async function createAndOpenPatientFile(a: any) {
    setCreatingPatientFor(a.id)
    const supabase = createClient()
    try {
      const phoneRaw = (a.patient_phone || '').trim()
      const phoneDigits = phoneRaw.replace(/\D/g, '')

      // Belt-and-suspenders find-or-create: an in-flight race with another
      // dentist adding the same patient via the appointments form would
      // otherwise produce duplicates. Match first, insert only on miss.
      let patientId: string | null = null
      if (phoneDigits.length >= 4) {
        const tail = phoneDigits.slice(-10)
        const { data: existing } = await supabase
          .from('patients')
          .select('id')
          .eq('dentist_id', dentistId)
          .ilike('phone', `%${tail}`)
          .limit(1)
          .maybeSingle()
        if (existing?.id) patientId = existing.id
      }
      if (!patientId) {
        const { data: created, error: ptErr } = await supabase
          .from('patients')
          .insert({
            dentist_id: dentistId,
            name: a.patient_name || 'Walk-in patient',
            phone: phoneRaw || null,
          })
          .select('id')
          .single()
        if (ptErr || !created?.id) {
          setStatusError(`Could not create patient record: ${ptErr?.message || 'unknown error'}`)
          return
        }
        patientId = created.id
      }

      // Backfill patient_id on the appointment so subsequent clicks skip
      // this handler and go straight to the Open button.
      // .select('id') makes an RLS denial observable: without it a filtered
      // write returns no error AND no rows, so the link silently never lands,
      // the next click re-runs this handler, and an appointment with no phone
      // to match on gets a second duplicate patient record.
      const { data: linked, error: linkErr } = await supabase.from('appointments')
        .update({ patient_id: patientId })
        .eq('id', a.id)
        .select('id')
      if (linkErr || !linked || linked.length === 0) {
        setStatusError(linkErr?.message || 'Could not link this appointment to the patient file. Please try again.')
        return
      }

      setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, patient_id: patientId } : x))
      if (phoneDigits) {
        setPatientIdByPhone(prev => {
          const next = new Map(prev)
          next.set(phoneDigits, patientId!)
          return next
        })
      }
      router.push(`/for-dentists/dashboard/patients/${patientId}`)
    } catch (e: any) {
      setStatusError(e?.message || 'Could not open patient file.')
    } finally {
      setCreatingPatientFor(null)
    }
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id); setStatusError(null)

    // Confirm/decline AND complete transitions route through the server so
    // the API can attach side effects — confirmation/cancellation emails,
    // and (for 'completed') auto-creating a 6-month recall reminder. Pure
    // no_show flips keep using the direct RLS-gated supabase update path.
    if (status === 'confirmed' || status === 'cancelled' || status === 'completed') {
      const res = await fetch(`/api/dentist/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const body = await res.json().catch(() => ({} as any))
      setUpdating(null)
      if (!res.ok) {
        setStatusError(body.error || body.message || 'Status change failed.')
        return
      }
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
      if (status === 'completed' && body?.recall?.due_date) {
        const dueLabel = new Date(body.recall.due_date).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        })
        setRecallToast(`Recall scheduled for ${dueLabel}`)
        setTimeout(() => setRecallToast(null), 5000)
      }
      return
    }

    const supabase = createClient()
    // .select() forces RLS to return the updated row; without it a denied
    // update returns no error and no rows, and the old optimistic mutation
    // happily flipped the UI while the DB stayed put.
    const { data, error } = await supabase
      .from('appointments').update({ status }).eq('id', id).select('id')
    setUpdating(null)
    if (error) {
      setStatusError(error.message)
      return
    }
    if (!data || data.length === 0) {
      setStatusError('Status change rejected — you may not have permission to edit this appointment.')
      return
    }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  function openConsentModal(a: any) {
    setConsentModal(a)
    setConsentType('')
    setConsentContent('')
    setConsentTitle('')
    setConsentError(null)
  }

  function selectConsentTemplate(formType: string) {
    setConsentType(formType)
    const tpl = consentTemplates.find(t => t.form_type === formType)
    if (tpl) {
      setConsentTitle(tpl.form_title)
      setConsentContent(tpl.form_content)
    }
  }

  async function sendConsentWhatsApp() {
    if (!consentModal || !consentType || !consentContent.trim()) {
      setConsentError('Select a form type and check the content.'); return
    }
    const phone = (consentModal.patient_phone || '').replace(/\D/g, '')
    if (!phone) { setConsentError('No phone number for this patient.'); return }
    setConsentSending(true)
    setConsentError(null)
    const supabase = createClient()
    const now = new Date().toISOString()
    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    const patientName = consentModal.patient_name || 'Patient'
    const clinicName = dentistMeta.clinic_name || 'Dental Clinic'
    const doctorName = dentistMeta.name || 'Your Dentist'

    const waText = [
      `*CONSENT FORM — ${consentTitle}*`,
      `_${clinicName}_`,
      '',
      `Patient: *${patientName}*`,
      `Date: ${dateStr}`,
      '',
      consentContent,
      '',
      `By replying *"I CONSENT"* to this message, you (${patientName}) confirm you have read and understood the above and give your informed consent.`,
      '',
      `— Dr. ${doctorName}`,
      clinicName,
    ].join('\n').trim()

    // .select('id') makes an RLS denial observable. Without it a filtered
    // insert returns no error AND no rows, and we would open WhatsApp anyway —
    // the patient receives a consent request that was never recorded, so the
    // clinic has no audit trail for a consent it actually sought. Abort
    // instead of sending.
    const { data: consentRow, error: consentInsertErr } = await supabase
      .from('consent_forms')
      .insert({
        dentist_id: dentistId,
        patient_id: consentModal.patient_id ?? null,
        appointment_id: consentModal.id,
        form_type: consentType,
        form_title: consentTitle,
        form_text: consentContent,
        form_content: { __v: 2, text: consentContent },
        patient_name: patientName,
        patient_phone: consentModal.patient_phone || null,
        status: 'sent',
        sent_at: now,
        signature_method: 'manual',
      })
      .select('id')
    if (consentInsertErr || !consentRow || consentRow.length === 0) {
      setConsentSending(false)
      setConsentError(consentInsertErr?.message || 'Could not record the consent form, so nothing was sent. Please try again.')
      return
    }

    const waNum = phone.length === 10 ? `91${phone}` : phone
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(waText)}`, '_blank')
    setConsentSending(false)
    setConsentModal(null)
  }

  // Branch-scoped view: counts and the filtered list both apply the branch
  // filter before the status filter so the badges on the status tabs reflect
  // the currently-visible branch slice, not the all-branches total.
  const branchScoped = appointments.filter(a => {
    if (branchFilter === 'all') return true
    if (branchFilter === 'unassigned') return !a.location_id
    return a.location_id === branchFilter
  })
  const counts: Record<FilterKey, number> = {
    all:       branchScoped.length,
    pending:   branchScoped.filter(a => a.status === 'pending').length,
    confirmed: branchScoped.filter(a => a.status === 'confirmed').length,
    completed: branchScoped.filter(a => a.status === 'completed').length,
    cancelled: branchScoped.filter(a => a.status === 'cancelled').length,
    no_show:   branchScoped.filter(a => a.status === 'no_show').length,
  }
  const filtered = branchScoped.filter(a => matchesFilter(a.status, filter))

  const TABS: { key: FilterKey; label: string }[] = [
    { key: 'all',       label: 'All'               },
    { key: 'pending',   label: 'Waiting / Walk-in' },
    { key: 'confirmed', label: 'Scheduled'         },
    { key: 'completed', label: 'Completed'         },
    { key: 'cancelled', label: 'Cancelled'         },
    { key: 'no_show',   label: 'No Show'           },
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

      {statusError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span>{statusError}</span>
          <button onClick={() => setStatusError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {recallToast && (
        <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>📅 {recallToast}</span>
          <button onClick={() => setRecallToast(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Edit Appointment Modal — the openEdit handler / editForm state has
          been here for a while but the rendered JSX was missing, so the Edit
          button silently no-op'd. Mirror the Add modal layout; time_slot
          uses the TIME_SLOTS <select> (NOT a free-text input — the native
          time picker bug from commit 44e7912 applies here too). */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>Edit Appointment</h2>
              <button onClick={() => setEditing(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              {editError && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
                  {editError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
                  <input value={editForm.patient_phone} onChange={e => setEditForm(f => ({ ...f, patient_phone: e.target.value }))}
                    placeholder="10-digit number"
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    <option value="pending">Waiting / Walk-in</option>
                    <option value="confirmed">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no_show">No Show</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date *</label>
                  <input type="date" value={editForm.appt_date} onChange={e => setEditForm(f => ({ ...f, appt_date: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Time *</label>
                  <select value={editForm.time_slot} onChange={e => setEditForm(f => ({ ...f, time_slot: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    <option value="">Select time</option>
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Treatment</label>
                  <select value={editForm.treatment_id} onChange={e => setEditForm(f => ({ ...f, treatment_id: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    <option value="">— No treatment</option>
                    {treatments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {locations.length > 0 && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Branch</label>
                    <select value={editForm.location_id} onChange={e => setEditForm(f => ({ ...f, location_id: e.target.value }))}
                      style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                      <option value="">— Not assigned to a branch</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>{l.name || 'Branch'}{l.is_primary ? ' (primary)' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                  <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Walk-in details, chief complaint…"
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setEditing(null)} disabled={editSaving}
                style={{ padding: '12px 20px', minHeight: 48, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editSaving}
                style={{ padding: '12px 24px', minHeight: 48, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consent Form Modal */}
      {consentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>Send Consent Form</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Patient: {consentModal.patient_name}</p>
              </div>
              <button onClick={() => setConsentModal(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {consentError && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
                  {consentError}
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Consent form type *</label>
                <select value={consentType} onChange={e => selectConsentTemplate(e.target.value)}
                  style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">— Select form type</option>
                  {consentTemplates.map(t => (
                    <option key={t.id} value={t.form_type}>{t.form_title}</option>
                  ))}
                </select>
              </div>
              {consentContent && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Form content (edit if needed)</label>
                  <textarea value={consentContent} onChange={e => setConsentContent(e.target.value)}
                    rows={10}
                    style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }} />
                </div>
              )}
              {!consentModal.patient_phone && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 14px', borderRadius: 10, fontSize: 12 }}>
                  No phone number on this appointment — WhatsApp cannot be opened. Add a phone number to the appointment first.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setConsentModal(null)}
                style={{ padding: '12px 20px', minHeight: 48, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={sendConsentWhatsApp} disabled={consentSending || !consentType}
                style={{ padding: '12px 24px', minHeight: 48, background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: (consentSending || !consentType) ? 'not-allowed' : 'pointer', opacity: (consentSending || !consentType) ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
                {consentSending ? 'Opening…' : '💬 Send via WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <option value="pending">Waiting / Walk-in</option>
                    <option value="confirmed">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no_show">No Show</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date *</label>
                  <input type="date" value={form.appt_date} onChange={e => setForm(f => ({ ...f, appt_date: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Time *</label>
                  <select value={form.time_slot} onChange={e => setForm(f => ({ ...f, time_slot: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    <option value="">Select time</option>
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Treatment</label>
                  <select value={form.treatment_id} onChange={e => setForm(f => ({ ...f, treatment_id: e.target.value }))}
                    style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    <option value="">— Select treatment (optional)</option>
                    {treatments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {locations.length > 0 && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Branch</label>
                    <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                      style={{ width: '100%', padding: '12px', minHeight: 48, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                      <option value="">— Not assigned to a branch</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>{l.name || 'Branch'}{l.is_primary ? ' (primary)' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
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

      {/* Branch filter — only renders when the dentist has more than one
          clinic_locations row. "All branches" is the default; "Unassigned"
          surfaces appointments still missing a location_id (mostly older
          rows from before the multi-branch rollout). */}
      {locations.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Branch:</span>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', background: '#fff', cursor: 'pointer', outline: 'none' }}>
            <option value="all">All branches</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name || 'Branch'}{l.is_primary ? ' · primary' : ''}</option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>
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
            const sc = STATUS_COLORS[a.status] || STATUS_COLORS.pending
            const isInvoiced = invoicedPhones.has(a.patient_phone)
            const isPending = a.status === 'pending'
            const isConfirmed = a.status === 'confirmed'
            const isCompleted = a.status === 'completed'
            const isClosed = a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show'
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
                    {/* Branch tag — only show when the dentist actually has
                        more than one branch. For single-branch dentists the
                        location_id is redundant noise. */}
                    {locations.length > 1 && a.clinic_locations?.clinic_name && (
                      <span>🏥 {a.clinic_locations.clinic_name}</span>
                    )}
                  </div>
                  {a.notes && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>"{a.notes}"</p>}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* State-machine primary action. The DB only accepts
                      pending/confirmed/completed/cancelled/no_show, so the
                      transition buttons go directly to those terminal states. */}
                  {isPending && (
                    <button onClick={() => updateStatus(a.id, 'confirmed')} disabled={updating === a.id}
                      style={{ ...primaryBtn, background: '#DBEAFE', color: '#1D4ED8' }}>
                      ✓ Confirm
                    </button>
                  )}
                  {!isClosed && (
                    <button onClick={() => updateStatus(a.id, 'completed')} disabled={updating === a.id}
                      style={{ ...primaryBtn, background: '#DCFCE7', color: '#166534' }}>
                      ✓ Complete
                    </button>
                  )}
                  {isConfirmed && (
                    <button onClick={() => updateStatus(a.id, 'no_show')} disabled={updating === a.id}
                      title="Patient did not show up"
                      style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151' }}>
                      ⊘ No Show
                    </button>
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

                  {/* Patient file shortcut — present on EVERY row so the
                      dentist can jump to the patient record (visits, Rx,
                      invoices, treatment plans, dental chart) from the
                      appointment context without round-tripping through
                      the Patients tab. patient_id is set on online bookings
                      AND on walk-ins post-auto-link; older walk-ins that
                      predate the auto-link get a phone-match fallback;
                      anything that still doesn't resolve falls into the
                      "Create Patient File" branch that creates the patient
                      record + links the appointment + navigates. */}
                  {(() => {
                    const phoneDigits = String(a.patient_phone || '').replace(/\D/g, '')
                    const pid = a.patient_id || patientIdByPhone.get(phoneDigits) || null
                    if (pid) {
                      return (
                        <>
                          {!isClosed && (
                            <Link
                              href={`/for-dentists/dashboard/patients/${pid}?tab=treatments`}
                              title="Open the patient on the Visits / Treatments tab to begin the consultation"
                              style={{ ...primaryBtn, background: '#DCFCE7', color: '#166534', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              🩺 Start Consultation
                            </Link>
                          )}
                          <Link
                            href={`/for-dentists/dashboard/patients/${pid}`}
                            title="Open the patient's full file (overview, prescriptions, invoices, treatment plans, dental chart)"
                            style={{ ...primaryBtn, background: 'var(--blue-light)', color: 'var(--blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            👤 Open Patient File
                          </Link>
                        </>
                      )
                    }
                    return (
                      <button onClick={() => createAndOpenPatientFile(a)}
                        disabled={creatingPatientFor === a.id}
                        title="Create a patient record from this walk-in and open the full file"
                        style={{ ...primaryBtn, background: '#FEF3C7', color: '#92400E', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {creatingPatientFor === a.id ? '⏳ Creating…' : '👤 Create Patient File'}
                      </button>
                    )
                  })()}

                  {/* Consent form — available on every row */}
                  <button onClick={() => openConsentModal(a)} title="Send a consent form via WhatsApp"
                    style={{ ...secondaryBtn, color: '#1D4ED8', borderColor: '#BFDBFE' }}>
                    📝 Consent
                  </button>

                  {/* Edit — reschedule date/time, swap treatment, fix typos.
                      Available on every row so closed-out appointments can
                      still be corrected after the fact. */}
                  <button onClick={() => openEdit(a)} title="Edit appointment" style={secondaryBtn}>
                    ✏ Edit
                  </button>

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

                  {/* Share patient-portal access — WhatsApps the patient a link
                      to dentistinmumbai.in/patient where they log in with their
                      own number to view records. Uses the current host so the
                      link is city-correct. */}
                  {a.patient_phone && (() => {
                    const host = typeof window !== 'undefined' ? window.location.host : 'dentistinmumbai.in'
                    const portalText = `Hi ${a.patient_name}, access your dental records at ${host}/patient — enter your mobile number to view your appointments, prescriptions and invoices. — ${dentistMeta.clinic_name || 'our clinic'}`
                    return (
                      <a href={waLink(a.patient_phone, portalText)}
                        target="_blank" rel="noopener noreferrer"
                        title="Send the patient a link to their records portal"
                        style={{ ...secondaryBtn, color: '#0F766E', borderColor: '#99F6E4' }}>
                        🔐 Share Portal Access
                      </a>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
