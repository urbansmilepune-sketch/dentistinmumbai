'use client'

// Dedicated treatment-plan workflow page. The patient detail page already has
// a "Plans" tab that creates a basic plan (title + steps + total) with no
// lifecycle. This route adds:
//   - draft → presented → accepted/declined → in_progress → completed flow
//   - per-step status (pending/scheduled/completed/skipped) with timestamps
//   - drag-to-reorder steps (HTML5 native, no extra deps)
//   - progress bar (completed / total steps)
//   - one-click "Convert to Invoice" — creates an invoices row from the steps
//   - WhatsApp "Send to Patient" with a public PDF link
//   - PDF generator (jsPDF) styled to match invoicePdf.ts / consent PDFs
//
// Reads + writes BOTH the new (total_estimated_cost, tooth_numbers, status)
// columns added in migration 20260522140000 AND the legacy ones
// (total_cost, tooth_number) so the old Plans tab continues to render rows
// created here.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { jsPDF } from 'jspdf' // v4: named export (see src/lib/invoicePdf.ts)
import { createClient } from '@/lib/supabase/client'
import { getCityBySlug } from '@/config/cities'

type StepStatus = 'pending' | 'scheduled' | 'completed' | 'skipped'
type PlanStatus = 'draft' | 'presented' | 'accepted' | 'in_progress' | 'completed' | 'declined'

// TODO(type-boundary): the DB stores tooth_numbers as text[] but in-app state
// uses a display string (normalisePlan collapses the array). Make the boundary
// explicit: add `type StepRow = Omit<Step,'tooth_numbers'> & { tooth_numbers:
// string[] | null }` + a `PlanRow` wrapper + a `normaliseStep(StepRow): Step`
// helper, then replace the `as unknown as Step/Plan` casts (in normalisePlan,
// addStep, patchStep). Deferred: ~16-line refactor, not a bug — current casts
// are harmless. Verify supabase-js result types still need `as unknown`.
type Step = {
  id: string
  plan_id: string
  step_number: number
  treatment_name: string
  tooth_numbers: string | null
  tooth_number: string | null
  estimated_cost: number | null
  status: StepStatus
  notes: string | null
  completed_at: string | null
}

type Plan = {
  id: string
  patient_id: string
  dentist_id: string
  title: string
  status: PlanStatus
  total_estimated_cost: number | null
  total_cost: number | null
  notes: string | null
  created_at: string
  updated_at: string | null
  presented_at: string | null
  accepted_at: string | null
  declined_at: string | null
  treatment_plan_steps: Step[]
}

type Patient = {
  id: string
  name: string
  phone: string | null
  age: number | null
  gender: string | null
  address: string | null
}

type Dentist = {
  id: string
  name: string | null
  degree: string | null
  clinic_name: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  mci_number: string | null
  city: string | null
  areas: { name: string | null } | null
}

const PLAN_STATUS_META: Record<PlanStatus, { label: string; bg: string; text: string }> = {
  draft:       { label: 'Draft',        bg: '#F3F4F6', text: '#374151' },
  presented:   { label: 'Presented',    bg: '#DBEAFE', text: '#1D4ED8' },
  accepted:    { label: 'Accepted',     bg: '#DCFCE7', text: '#166534' },
  declined:    { label: 'Declined',     bg: '#FEE2E2', text: '#991B1B' },
  in_progress: { label: 'In Progress',  bg: '#FEF3C7', text: '#92400E' },
  completed:   { label: 'Completed',    bg: '#E0E7FF', text: '#4338CA' },
}

const STEP_STATUS_META: Record<StepStatus, { label: string; bg: string; text: string }> = {
  pending:   { label: 'Pending',   bg: '#F3F4F6', text: '#374151' },
  scheduled: { label: 'Scheduled', bg: '#DBEAFE', text: '#1D4ED8' },
  completed: { label: 'Completed', bg: '#DCFCE7', text: '#166534' },
  skipped:   { label: 'Skipped',   bg: '#FEE2E2', text: '#991B1B' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: 13,
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
}

// tooth_numbers is a Postgres text[] column, but dentists type free text like
// "25, 26 and 27". Normalise to a string array: strip the word "and", split on
// commas / whitespace, trim, drop empties. "25, 26 and 27" → ["25","26","27"].
function parseToothNumbers(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .replace(/\band\b/gi, ' ')
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean)
}

// Reverse direction: text[] rows come back from PostgREST as JS arrays, but the
// UI/PDF/invoice code renders tooth_numbers as a plain string. Collapse arrays
// (and the legacy text column) to a readable "25, 26, 27" for display state.
function toothNumbersToText(v: unknown): string | null {
  if (Array.isArray(v)) return v.length ? v.join(', ') : null
  if (typeof v === 'string') return v.trim() || null
  return null
}

export default function TreatmentPlanPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [dentist, setDentist] = useState<Dentist | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [newPlanTitle, setNewPlanTitle] = useState('')
  const [newPlanNotes, setNewPlanNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const { data: dRow } = await supabase
          .from('dentists')
          .select('id, name, degree, clinic_name, phone, whatsapp, address, mci_number, city, areas(name)')
          .eq('email', user.email)
          .single()
        if (!dRow) { router.push('/for-dentists/login'); return }
        setDentist(dRow as unknown as Dentist)

        const [{ data: p }, { data: pl }] = await Promise.all([
          supabase.from('patients')
            .select('id, name, phone, age, gender, address')
            .eq('id', patientId).eq('dentist_id', dRow.id).single(),
          supabase.from('treatment_plans')
            .select('*, treatment_plan_steps(*)')
            .eq('patient_id', patientId).eq('dentist_id', dRow.id)
            .order('created_at', { ascending: false }),
        ])
        if (!p) { router.push('/for-dentists/dashboard/patients'); return }
        setPatient(p as Patient)
        setPlans(((pl ?? []) as unknown as Plan[]).map(normalisePlan))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patientId, router])

  function normalisePlan(p: Plan): Plan {
    return {
      ...p,
      status: (p.status || 'draft') as PlanStatus,
      treatment_plan_steps: (p.treatment_plan_steps || [])
        .map(s => ({
          ...s,
          status: (s.status || 'pending') as StepStatus,
          tooth_numbers: toothNumbersToText(s.tooth_numbers) ?? s.tooth_number ?? null,
        }))
        .sort((a, b) => a.step_number - b.step_number),
    }
  }

  async function createPlan() {
    if (!dentist) return
    if (!newPlanTitle.trim()) { setError('Plan title is required.'); return }
    setError(null)
    setSaving(true)
    const supabase = createClient()
    const { data, error: insErr } = await supabase.from('treatment_plans').insert({
      patient_id: patientId,
      dentist_id: dentist.id,
      title: newPlanTitle.trim(),
      status: 'draft' as PlanStatus,
      total_cost: 0,
      total_estimated_cost: 0,
      notes: newPlanNotes.trim() || null,
    }).select('*, treatment_plan_steps(*)').single()
    setSaving(false)
    if (insErr || !data) {
      setError(insErr?.message || 'Could not create plan.')
      return
    }
    setPlans(prev => [normalisePlan(data as unknown as Plan), ...prev])
    setNewPlanTitle('')
    setNewPlanNotes('')
    setShowCreate(false)
  }

  async function updatePlan(planId: string, patch: Partial<Plan>) {
    setBusyId(planId)
    const supabase = createClient()
    const { data, error: upErr } = await supabase
      .from('treatment_plans').update(patch).eq('id', planId)
      .select('*, treatment_plan_steps(*)').single()
    setBusyId(null)
    if (upErr || !data) {
      setError(upErr?.message || 'Update failed.')
      return null
    }
    const next = normalisePlan(data as unknown as Plan)
    setPlans(prev => prev.map(p => p.id === planId ? next : p))
    return next
  }

  async function deletePlan(planId: string) {
    if (!confirm('Delete this entire treatment plan? This cannot be undone.')) return
    setBusyId(planId)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('treatment_plans').delete().eq('id', planId)
    setBusyId(null)
    if (delErr) { setError(delErr.message); return }
    setPlans(prev => prev.filter(p => p.id !== planId))
  }

  async function setPlanStatus(plan: Plan, status: PlanStatus) {
    const patch: Partial<Plan> = { status }
    const now = new Date().toISOString()
    if (status === 'presented' && !plan.presented_at) patch.presented_at = now
    if (status === 'accepted' && !plan.accepted_at) patch.accepted_at = now
    if (status === 'declined' && !plan.declined_at) patch.declined_at = now
    await updatePlan(plan.id, patch)
  }

  // ---------- step CRUD ----------

  async function addStep(plan: Plan, stepDraft: Omit<Step, 'id' | 'plan_id' | 'step_number' | 'completed_at'>) {
    const supabase = createClient()
    const nextNumber = (plan.treatment_plan_steps[plan.treatment_plan_steps.length - 1]?.step_number || 0) + 1
    // tooth_numbers is text[] (needs an array); the legacy tooth_number is text.
    const teeth = parseToothNumbers(stepDraft.tooth_numbers)
    const { data, error: insErr } = await supabase.from('treatment_plan_steps').insert({
      plan_id: plan.id,
      step_number: nextNumber,
      treatment_name: stepDraft.treatment_name,
      tooth_numbers: teeth,
      tooth_number: teeth.join(', ') || null,
      estimated_cost: stepDraft.estimated_cost,
      status: stepDraft.status,
      notes: stepDraft.notes,
    }).select('*').single()
    if (insErr || !data) {
      setError(insErr?.message || 'Could not add step.')
      return
    }
    const newStep = data as unknown as Step
    const updatedSteps = [...plan.treatment_plan_steps, newStep]
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, treatment_plan_steps: updatedSteps } : p))
    await syncTotalCost(plan.id, updatedSteps)
  }

  async function patchStep(plan: Plan, stepId: string, patch: Partial<Step>) {
    const supabase = createClient()
    // Build the DB payload from the patch. tooth_numbers is text[], so convert
    // the free-text field to a string array; the legacy tooth_number stays text.
    const payload: Record<string, unknown> = { ...patch }
    if (patch.tooth_numbers !== undefined) {
      const teeth = parseToothNumbers(patch.tooth_numbers)
      payload.tooth_numbers = teeth
      payload.tooth_number = teeth.join(', ') || null
    }
    if (patch.status === 'completed' && !patch.completed_at) payload.completed_at = new Date().toISOString()
    if (patch.status && patch.status !== 'completed') payload.completed_at = null
    const { data, error: upErr } = await supabase
      .from('treatment_plan_steps').update(payload).eq('id', stepId)
      .select('*').single()
    if (upErr || !data) { setError(upErr?.message || 'Step update failed.'); return }
    const next = data as unknown as Step
    const updatedSteps = plan.treatment_plan_steps.map(s => s.id === stepId ? next : s)
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, treatment_plan_steps: updatedSteps } : p))
    if (patch.estimated_cost !== undefined) {
      await syncTotalCost(plan.id, updatedSteps)
    }
    // Auto-flip plan status as steps progress so the dentist doesn't have to
    // manually click "Mark In Progress" / "Mark Completed".
    await maybeAdvancePlanStatus(plan, updatedSteps)
  }

  async function deleteStep(plan: Plan, stepId: string) {
    const supabase = createClient()
    const { error: delErr } = await supabase.from('treatment_plan_steps').delete().eq('id', stepId)
    if (delErr) { setError(delErr.message); return }
    const updatedSteps = plan.treatment_plan_steps
      .filter(s => s.id !== stepId)
      .map((s, i) => ({ ...s, step_number: i + 1 }))
    // Persist the renumber so subsequent inserts pick up the right next slot.
    // .select('id') makes an RLS denial observable, which matters more here than
    // anywhere else: treatment_plan_steps is the one table a dentist writes from
    // the dashboard that has no working policy on the live DB, so every one of
    // these updates is currently filtered out and returns no error.
    const renumbered = await Promise.all(updatedSteps.map(s =>
      supabase.from('treatment_plan_steps').update({ step_number: s.step_number }).eq('id', s.id).select('id')
    ))
    if (renumbered.some(r => r.error || !r.data || r.data.length === 0)) {
      setError('The steps were renumbered on screen but the new order was not saved. Please reload.')
    }
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, treatment_plan_steps: updatedSteps } : p))
    await syncTotalCost(plan.id, updatedSteps)
  }

  async function reorderSteps(plan: Plan, newOrder: Step[]) {
    const renumbered = newOrder.map((s, i) => ({ ...s, step_number: i + 1 }))
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, treatment_plan_steps: renumbered } : p))
    const supabase = createClient()
    // The setPlans above is optimistic, so without .select('id') an RLS-filtered
    // write leaves the dentist looking at a reordered list that the database
    // never accepted — and it reverts on the next reload with no explanation.
    const results = await Promise.all(renumbered.map(s =>
      supabase.from('treatment_plan_steps').update({ step_number: s.step_number }).eq('id', s.id).select('id')
    ))
    if (results.some(r => r.error || !r.data || r.data.length === 0)) {
      setError('The new step order was not saved. Please reload — the list you are seeing is not what is stored.')
    }
  }

  async function syncTotalCost(planId: string, steps: Step[]) {
    const total = steps.reduce((sum, s) => sum + (Number(s.estimated_cost) || 0), 0)
    const supabase = createClient()
    // .select('id') makes an RLS denial observable — without it the plan total
    // shown to the dentist (and quoted to the patient) can silently disagree
    // with the stored value.
    const { data: synced, error: syncErr } = await supabase.from('treatment_plans')
      .update({ total_estimated_cost: total, total_cost: total })
      .eq('id', planId)
      .select('id')
    if (syncErr || !synced || synced.length === 0) {
      setError('The plan total was not saved. Please reload before quoting this figure to the patient.')
      return
    }
    setPlans(prev => prev.map(p => p.id === planId
      ? { ...p, total_estimated_cost: total, total_cost: total }
      : p))
  }

  // If at least one step is completed but the plan is still draft/presented/
  // accepted, bump it to in_progress. If every step is completed or skipped
  // (and at least one is completed), mark the plan completed.
  async function maybeAdvancePlanStatus(plan: Plan, steps: Step[]) {
    if (steps.length === 0) return
    const completed = steps.filter(s => s.status === 'completed').length
    const finished = steps.every(s => s.status === 'completed' || s.status === 'skipped')
    if (finished && completed > 0 && plan.status !== 'completed') {
      await updatePlan(plan.id, { status: 'completed' })
      return
    }
    if (completed > 0 && (plan.status === 'draft' || plan.status === 'presented' || plan.status === 'accepted')) {
      await updatePlan(plan.id, { status: 'in_progress' })
    }
  }

  // ---------- convert to invoice ----------

  async function convertToInvoice(plan: Plan) {
    if (!dentist || !patient) return
    const items = plan.treatment_plan_steps.map(s => ({
      treatment_name: s.treatment_name + (s.tooth_numbers ? ` (Tooth ${s.tooth_numbers})` : ''),
      description: s.treatment_name + (s.tooth_numbers ? ` (Tooth ${s.tooth_numbers})` : ''),
      quantity: 1,
      unit_price: Number(s.estimated_cost) || 0,
      amount: Number(s.estimated_cost) || 0,
    }))
    const subtotal = items.reduce((sum, i) => sum + i.amount, 0)
    const invNo = `INV-${Date.now().toString().slice(-6)}`
    setBusyId(plan.id)
    const supabase = createClient()
    const { data, error: insErr } = await supabase.from('invoices').insert({
      invoice_no: invNo,
      dentist_id: dentist.id,
      patient_id: patient.id,
      invoice_date: new Date().toISOString().slice(0, 10),
      items,
      subtotal,
      discount: 0,
      gst_amount: 0,
      total: subtotal,
      notes: `Generated from treatment plan: ${plan.title}`,
      payment_status: 'pending',
    }).select('id').single()
    setBusyId(null)
    if (insErr || !data) {
      setError(insErr?.message || 'Could not create invoice.')
      return
    }
    router.push(`/for-dentists/dashboard/patients/${patientId}?tab=invoices`)
  }

  // ---------- PDF ----------

  function buildPdf(plan: Plan): jsPDF {
    if (!patient || !dentist) throw new Error('Missing patient or dentist')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const PAGE_W = doc.internal.pageSize.getWidth()
    const PAGE_H = doc.internal.pageSize.getHeight()
    const MARGIN = 40
    const RIGHT_X = PAGE_W - MARGIN
    const MAX_W = PAGE_W - MARGIN * 2

    let y = 60
    // Clinic header
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0, 87, 168)
    doc.text(dentist.clinic_name || dentist.name || 'Clinic', MARGIN, y)
    if (dentist.name) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40, 40, 40)
      const doctorName = /^dr\.?\s/i.test(dentist.name) ? dentist.name : `Dr. ${dentist.name}`
      doc.text(dentist.degree ? `${doctorName}, ${dentist.degree}` : doctorName, MARGIN, y + 16)
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 100, 100)
    const cityName = getCityBySlug(dentist.city).cityName
    const addr = dentist.address || (dentist.areas?.name ? `${dentist.areas.name}, ${cityName}` : cityName)
    const addrLines = doc.splitTextToSize(addr, 280) as string[]
    if (addrLines[0]) doc.text(addrLines[0], MARGIN, y + 29)
    if (addrLines[1]) doc.text(addrLines[1], MARGIN, y + 40)
    if (dentist.phone || dentist.whatsapp) doc.text(`Phone: ${dentist.phone || dentist.whatsapp}`, MARGIN, y + (addrLines[1] ? 51 : 40))

    // Right side: TREATMENT PLAN label
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(15, 25, 35)
    doc.text('TREATMENT PLAN', RIGHT_X, y, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 100, 100)
    doc.text(`Date: ${new Date(plan.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, RIGHT_X, y + 16, { align: 'right' })
    doc.text(`Plan: ${plan.title}`, RIGHT_X, y + 30, { align: 'right' })

    y = 140
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(1)
    doc.line(MARGIN, y, RIGHT_X, y)
    y += 24

    // Patient block
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(100, 116, 139)
    doc.text('PATIENT', MARGIN, y); y += 14
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(15, 25, 35)
    doc.text(patient.name, MARGIN, y); y += 14
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 100, 100)
    const meta = [patient.age ? `${patient.age} yrs` : null, patient.gender, patient.phone ? `Phone: ${patient.phone}` : null]
      .filter(Boolean).join('  ·  ')
    if (meta) { doc.text(meta, MARGIN, y); y += 14 }
    y += 14

    // Steps table header
    const COL_NUM_X = MARGIN
    const COL_TREAT_X = MARGIN + 30
    const COL_TEETH_X = 320
    const COL_COST_X = 410
    const COL_STATUS_X = RIGHT_X

    doc.setFillColor(245, 247, 252)
    doc.rect(MARGIN, y, RIGHT_X - MARGIN, 22, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(100, 116, 139)
    doc.text('#',        COL_NUM_X,    y + 15)
    doc.text('TREATMENT',COL_TREAT_X,  y + 15)
    doc.text('TEETH',    COL_TEETH_X,  y + 15)
    doc.text('COST',     COL_COST_X,   y + 15)
    doc.text('STATUS',   COL_STATUS_X, y + 15, { align: 'right' })
    y += 32

    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 41, 59)
    for (const step of plan.treatment_plan_steps) {
      if (y > PAGE_H - 220) { doc.addPage(); y = MARGIN + 20 }
      const wrapped = doc.splitTextToSize(step.treatment_name, COL_TEETH_X - COL_TREAT_X - 8) as string[]
      doc.text(String(step.step_number), COL_NUM_X, y)
      wrapped.forEach((line, idx) => doc.text(line, COL_TREAT_X, y + idx * 14))
      doc.text(step.tooth_numbers || '—', COL_TEETH_X, y)
      doc.text('Rs.' + Number(step.estimated_cost || 0).toLocaleString('en-IN'), COL_COST_X, y)
      const statusLabel = STEP_STATUS_META[step.status]?.label || step.status
      doc.text(statusLabel, COL_STATUS_X, y, { align: 'right' })
      const rowH = 22 + Math.max(0, (wrapped.length - 1) * 14)
      y += rowH - 6
      doc.setDrawColor(238, 240, 244); doc.line(MARGIN, y, RIGHT_X, y)
      y += 14
    }

    // Total
    y += 12
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(1)
    doc.line(380, y - 4, RIGHT_X, y - 4); y += 6
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0, 87, 168)
    doc.text('Total Estimated', 380, y)
    const total = plan.treatment_plan_steps.reduce((sum, s) => sum + (Number(s.estimated_cost) || 0), 0)
    doc.text('Rs.' + total.toLocaleString('en-IN'), RIGHT_X, y, { align: 'right' })
    y += 30

    if (plan.notes) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(100, 116, 139)
      doc.text('NOTES', MARGIN, y); y += 14
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 50, 50)
      const lines = doc.splitTextToSize(plan.notes, MAX_W) as string[]
      lines.forEach(l => { doc.text(l, MARGIN, y); y += 14 })
      y += 8
    }

    // Validity notice
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(120, 120, 120)
    doc.text('This treatment plan is valid for 90 days from the date of issue.', MARGIN, y)
    y += 30

    // Signature area (anchored to bottom so short plans still get the footer)
    const SIG_Y = Math.max(y + 60, PAGE_H - 120)
    // Patient signature line (left)
    doc.setDrawColor(40, 40, 40); doc.setLineWidth(1)
    doc.line(MARGIN, SIG_Y, MARGIN + 200, SIG_Y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120)
    doc.text('Patient Signature', MARGIN, SIG_Y + 14)
    // Doctor signature line (right)
    doc.line(RIGHT_X - 200, SIG_Y, RIGHT_X, SIG_Y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 25, 35)
    const sig = dentist.name ? (/^dr\.?\s/i.test(dentist.name) ? dentist.name : `Dr. ${dentist.name}`) : 'Authorized Signature'
    doc.text(sig, RIGHT_X, SIG_Y + 14, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120)
    doc.text('Doctor Signature', RIGHT_X, SIG_Y + 26, { align: 'right' })

    // Footer
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(140, 140, 140)
    doc.text(`Powered by ${getCityBySlug(dentist.city).domain}`, PAGE_W / 2, PAGE_H - 24, { align: 'center' })
    return doc
  }

  function downloadPdf(plan: Plan) {
    try {
      const doc = buildPdf(plan)
      doc.save(`treatment-plan-${(patient?.name || 'patient').replace(/\s+/g, '-').toLowerCase()}.pdf`)
    } catch (err: any) {
      setError(err?.message || 'Could not generate PDF.')
    }
  }

  function sendOnWhatsApp(plan: Plan) {
    if (!patient?.phone) { setError('Patient phone is missing — add it on the patient profile.'); return }
    // Build the PDF, hand it off as a data URL so the patient can save it from
    // the WhatsApp message. Most WhatsApp clients won't follow data URLs, so
    // we also copy the PDF blob to the clipboard and prompt the dentist to
    // attach it manually. (Server-hosted PDF route would be ideal but the
    // rest of the dashboard generates plan PDFs client-side too.)
    try {
      const doc = buildPdf(plan)
      const fileName = `treatment-plan-${(patient.name || 'patient').replace(/\s+/g, '-').toLowerCase()}.pdf`
      doc.save(fileName)
      const phone = String(patient.phone).replace(/\D/g, '').slice(-10)
      const clinic = dentist?.clinic_name || dentist?.name || 'your clinic'
      const total = plan.treatment_plan_steps.reduce((sum, s) => sum + (Number(s.estimated_cost) || 0), 0)
      const lines = [
        `Hi ${patient.name},`,
        ``,
        `Here is the treatment plan ${clinic} has prepared for you:`,
        `Plan: ${plan.title}`,
        `Total estimated cost: Rs.${total.toLocaleString('en-IN')}`,
        ``,
        `The PDF has been downloaded to your dentist's device — they will attach it to this WhatsApp chat. Please review and let us know if you'd like to proceed.`,
        ``,
        `Thank you,`,
        clinic,
      ]
      const url = `https://wa.me/91${phone}?text=${encodeURIComponent(lines.join('\n'))}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      setError(err?.message || 'Could not send.')
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading treatment plans…</p>
    </div>
  }
  if (!patient) return null

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href={`/for-dentists/dashboard/patients/${patientId}`}
          style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← {patient.name}</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>Treatment Plans</h1>
        <button onClick={() => { setShowCreate(true); setError(null) }}
          style={{ marginLeft: 'auto', padding: '10px 18px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          + Create Treatment Plan
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {showCreate && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 14 }}>New Treatment Plan</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Title</label>
            <input value={newPlanTitle} onChange={e => setNewPlanTitle(e.target.value)}
              placeholder="e.g. Full Mouth Rehabilitation" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Plan Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea value={newPlanNotes} onChange={e => setNewPlanNotes(e.target.value)}
              rows={2} placeholder="Anything the patient should know up front…"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowCreate(false); setNewPlanTitle(''); setNewPlanNotes('') }}
              style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
            <button onClick={createPlan} disabled={saving}
              style={{ padding: '9px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {saving ? 'Creating…' : 'Create plan'}
            </button>
          </div>
        </div>
      )}

      {plans.length === 0 && !showCreate ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No treatment plans yet</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Click "Create Treatment Plan" above to start.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              busy={busyId === plan.id}
              onAddStep={(d) => addStep(plan, d)}
              onPatchStep={(id, patch) => patchStep(plan, id, patch)}
              onDeleteStep={(id) => deleteStep(plan, id)}
              onReorder={(order) => reorderSteps(plan, order)}
              onSetStatus={(s) => setPlanStatus(plan, s)}
              onConvert={() => convertToInvoice(plan)}
              onSend={() => sendOnWhatsApp(plan)}
              onDownload={() => downloadPdf(plan)}
              onDelete={() => deletePlan(plan.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlanCard — one card per treatment plan: header (title, status, progress,
// total), step table with drag-handle / inline status controls, add-step
// inline form, and the bottom action bar.
// ---------------------------------------------------------------------------

function PlanCard({
  plan, busy, onAddStep, onPatchStep, onDeleteStep, onReorder,
  onSetStatus, onConvert, onSend, onDownload, onDelete,
}: {
  plan: Plan
  busy: boolean
  onAddStep: (d: Omit<Step, 'id' | 'plan_id' | 'step_number' | 'completed_at'>) => void
  onPatchStep: (id: string, patch: Partial<Step>) => void
  onDeleteStep: (id: string) => void
  onReorder: (order: Step[]) => void
  onSetStatus: (s: PlanStatus) => void
  onConvert: () => void
  onSend: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [stepDraft, setStepDraft] = useState({
    treatment_name: '', tooth_numbers: '', estimated_cost: '', notes: '',
  })
  const dragIndex = useRef<number | null>(null)

  const total = useMemo(
    () => plan.treatment_plan_steps.reduce((s, x) => s + (Number(x.estimated_cost) || 0), 0),
    [plan.treatment_plan_steps]
  )
  const done = plan.treatment_plan_steps.filter(s => s.status === 'completed').length
  const totalSteps = plan.treatment_plan_steps.length
  const progressPct = totalSteps === 0 ? 0 : Math.round((done / totalSteps) * 100)

  const meta = PLAN_STATUS_META[plan.status]

  function submitStep() {
    if (!stepDraft.treatment_name.trim()) return
    onAddStep({
      treatment_name: stepDraft.treatment_name.trim(),
      tooth_numbers: stepDraft.tooth_numbers.trim() || null,
      tooth_number: stepDraft.tooth_numbers.trim() || null,
      estimated_cost: stepDraft.estimated_cost ? parseFloat(stepDraft.estimated_cost) : 0,
      status: 'pending',
      notes: stepDraft.notes.trim() || null,
    })
    setStepDraft({ treatment_name: '', tooth_numbers: '', estimated_cost: '', notes: '' })
    setAdding(false)
  }

  function onDragStart(idx: number) { dragIndex.current = idx }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(idx: number) {
    const from = dragIndex.current
    dragIndex.current = null
    if (from === null || from === idx) return
    const order = [...plan.treatment_plan_steps]
    const [moved] = order.splice(from, 1)
    order.splice(idx, 0, moved)
    onReorder(order)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', opacity: busy ? 0.7 : 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>🦷 {plan.title}</h3>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: meta.bg, color: meta.text }}>
              {meta.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Created {new Date(plan.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {plan.presented_at && ` · Presented ${new Date(plan.presented_at).toLocaleDateString('en-IN')}`}
            {plan.accepted_at && ` · Accepted ${new Date(plan.accepted_at).toLocaleDateString('en-IN')}`}
            {plan.declined_at && ` · Declined ${new Date(plan.declined_at).toLocaleDateString('en-IN')}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--blue)' }}>
            ₹{total.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total estimated</div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Progress</span>
          <span style={{ fontWeight: 700 }}>{done} / {totalSteps} steps {totalSteps > 0 && `(${progressPct}%)`}</span>
        </div>
        <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct === 100 ? '#16A34A' : 'var(--blue)', transition: 'width 200ms' }} />
        </div>
      </div>

      {/* Steps table */}
      {totalSteps > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['', '#', 'Treatment', 'Teeth', 'Cost', 'Status', ''].map((h, i) => (
                  <th key={i} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.treatment_plan_steps.map((step, idx) => {
                const sm = STEP_STATUS_META[step.status]
                return (
                  <tr key={step.id}
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop(idx)}
                    style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)', background: step.status === 'completed' ? '#F0FDF4' : '#fff' }}>
                    <td style={{ padding: '8px 10px', cursor: 'grab', color: 'var(--muted)', fontSize: 16, userSelect: 'none' }} title="Drag to reorder">⋮⋮</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{step.step_number}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 500 }}>
                      {step.treatment_name}
                      {step.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>{step.notes}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 13 }}>{step.tooth_numbers || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600 }}>₹{Number(step.estimated_cost || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <select value={step.status}
                        onChange={e => onPatchStep(step.id, { status: e.target.value as StepStatus })}
                        style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 14, background: sm.bg, color: sm.text, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        {(Object.keys(STEP_STATUS_META) as StepStatus[]).map(s => (
                          <option key={s} value={s}>{STEP_STATUS_META[s].label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {step.status !== 'completed' && (
                        <button onClick={() => onPatchStep(step.id, { status: 'completed' })}
                          title="Mark this step completed"
                          style={{ padding: '4px 8px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginRight: 4, fontFamily: 'var(--font-body)' }}>
                          ✓ Done
                        </button>
                      )}
                      <button onClick={() => onDeleteStep(step.id)}
                        title="Delete step"
                        style={{ padding: '4px 8px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add step */}
      {adding ? (
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
            <input autoFocus placeholder="Treatment (e.g. RCT 36)" value={stepDraft.treatment_name}
              onChange={e => setStepDraft(d => ({ ...d, treatment_name: e.target.value }))} style={inputStyle} />
            <input placeholder="e.g. 25, 26, 27" value={stepDraft.tooth_numbers}
              onChange={e => setStepDraft(d => ({ ...d, tooth_numbers: e.target.value }))} style={inputStyle} />
            <input type="number" placeholder="₹ Cost" value={stepDraft.estimated_cost}
              onChange={e => setStepDraft(d => ({ ...d, estimated_cost: e.target.value }))} style={inputStyle} />
            <input placeholder="Notes (optional)" value={stepDraft.notes}
              onChange={e => setStepDraft(d => ({ ...d, notes: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setAdding(false); setStepDraft({ treatment_name: '', tooth_numbers: '', estimated_cost: '', notes: '' }) }}
              style={{ padding: '7px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
            <button onClick={submitStep}
              style={{ padding: '7px 14px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Add Step</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ padding: '8px 14px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)', width: '100%', marginBottom: 14 }}>
          + Add step
        </button>
      )}

      {/* Action bar */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {plan.status === 'draft' && (
          <button onClick={() => onSetStatus('presented')}
            style={btnStyle('#DBEAFE', '#1D4ED8')}>📤 Mark Presented</button>
        )}
        {(plan.status === 'presented' || plan.status === 'draft') && (
          <>
            <button onClick={() => onSetStatus('accepted')}
              style={btnStyle('#DCFCE7', '#166534')}>✓ Patient Accepted</button>
            <button onClick={() => onSetStatus('declined')}
              style={btnStyle('#FEE2E2', '#991B1B')}>✕ Patient Declined</button>
          </>
        )}
        {plan.status === 'declined' && (
          <button onClick={() => onSetStatus('draft')}
            style={btnStyle('#F3F4F6', '#374151')}>↺ Reopen as Draft</button>
        )}

        <span style={{ flex: 1 }} />

        <button onClick={onDownload}
          style={btnStyle('var(--blue-light)', 'var(--blue)')}>⬇ Download PDF</button>
        <button onClick={onSend} disabled={totalSteps === 0}
          style={{ ...btnStyle('#25D366', '#fff'), opacity: totalSteps === 0 ? 0.5 : 1 }}>💚 Send to Patient</button>
        <button onClick={onConvert} disabled={totalSteps === 0}
          style={{ ...btnStyle('var(--blue)', '#fff'), opacity: totalSteps === 0 ? 0.5 : 1 }}>🧾 Convert to Invoice</button>
        <button onClick={onDelete}
          style={btnStyle('#FEE2E2', '#991B1B')}>🗑 Delete</button>
      </div>
    </div>
  )
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '8px 14px', minHeight: 36, background: bg, color, border: 'none',
    borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  }
}
