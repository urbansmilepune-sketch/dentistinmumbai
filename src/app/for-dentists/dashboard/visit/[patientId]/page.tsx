'use client'

// One-screen visit: the dentist opens a patient (usually from "Waiting now"),
// sees what the patient told the tablet, and walks six numbered steps:
//   1 diagnosis on the chart → 2 treatment plan (cost, visits, crown type)
//   → 3 patient's answer (start today / later) → 4 done today
//   → 5 prescription (always) → 6 next sitting or reminder.
// One Save writes the visit, chart, plan, prescription and booking/reminder.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { whatsappLink } from '@/lib/phone'
import { NAVY, TEAL, TEAL_DARK, WHATSAPP } from '@/app/dentist/[slug]/profileTheme'
import {
  CROWN_TYPES, DIAGNOSES, DIAGNOSIS_PLAIN, DIAGNOSIS_TO_CONDITION, LOWER_TEETH, RX_TEMPLATES, TIME_SLOTS,
  TREATMENTS, TREATMENT_PLAIN, UPPER_TEETH, addDaysIso, applyAllergySwaps, complaintSummary, generateApptRef,
  istTodayIso, prettyDate, rupees, stepName, suggestDiagnoses, suggestTreatments, teethForArea, toothPlainName,
  type IntakeComplaint, type Medicine, type RxTemplate, type TreatmentDef,
} from '@/lib/visitFlow'

const LINE = '#E2E8F0'
const MUTED = '#64748B'
const TINT = '#CCFBF1'
const AMBER_BG = '#FFFBEB'
const AMBER_LINE = '#FCD34D'
const AMBER_INK = '#92400E'

type Progress = 'none' | 'sitting' | 'finished'
type NextMode = 'book' | 'remind' | 'none'

const CONDITION_STYLE: Record<string, { bg: string; line: string; ink: string }> = {
  caries: { bg: '#FEE2E2', line: '#EF4444', ink: '#991B1B' },
  abscess: { bg: '#FEE2E2', line: '#EF4444', ink: '#991B1B' },
  fracture: { bg: '#FEF3C7', line: '#F59E0B', ink: '#92400E' },
  rct: { bg: '#DBEAFE', line: '#60A5FA', ink: '#1E40AF' },
  crown: { bg: '#DBEAFE', line: '#60A5FA', ink: '#1E40AF' },
  implant: { bg: '#DBEAFE', line: '#60A5FA', ink: '#1E40AF' },
}

function chipStyle(on: boolean, suggested = false): React.CSSProperties {
  return {
    border: `1.5px solid ${on ? TEAL : suggested ? AMBER_LINE : LINE}`,
    background: on ? TINT : suggested ? AMBER_BG : '#fff',
    color: on ? TEAL_DARK : NAVY,
    borderRadius: 10, padding: '8px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font-body)', minHeight: 38,
  }
}

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, display: 'grid', gap: 12, alignContent: 'start' }
const smallMuted: React.CSSProperties = { fontSize: 12.5, color: MUTED }

function StepHead({ n, title, hint, done }: { n: number; title: string; hint?: string; done?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', background: done ? TEAL : NAVY, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
      {hint && <span style={{ marginLeft: 'auto', ...smallMuted, textAlign: 'right' }}>{hint}</span>}
    </div>
  )
}

export default function VisitPage() {
  const router = useRouter()
  const params = useParams<{ patientId: string }>()
  const patientId = String(params?.patientId || '')
  const today = istTodayIso()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dentist, setDentist] = useState<{ id: string; name: string; clinic_name: string | null } | null>(null)
  const [patient, setPatient] = useState<any>(null)
  const [intake, setIntake] = useState<any>(null)
  const [waiting, setWaiting] = useState<any[]>([])
  const [chart, setChart] = useState<Record<number, string>>({})
  const [openPlans, setOpenPlans] = useState<any[]>([])
  const [pastVisits, setPastVisits] = useState<any[]>([])
  const [feeByTreatment, setFeeByTreatment] = useState<Record<string, number>>({})
  const [lastPrice, setLastPrice] = useState<Record<string, number>>({})
  const [myTemplates, setMyTemplates] = useState<RxTemplate[]>([])

  // Visit state
  const [teeth, setTeeth] = useState<number[]>([])
  const [dx, setDx] = useState<string[]>([])
  const [showAllDx, setShowAllDx] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [crownType, setCrownType] = useState<string>('Zirconia')
  const [answer, setAnswer] = useState<'start' | 'later' | null>(null)
  const [doneNew, setDoneNew] = useState<Record<string, Progress>>({})
  const [doneOld, setDoneOld] = useState<Record<string, Progress>>({})
  const [acceptOld, setAcceptOld] = useState<Record<string, boolean>>({})
  const [rxName, setRxName] = useState<string>('')
  const [meds, setMeds] = useState<Medicine[]>([])
  const [rxNotes, setRxNotes] = useState<string[]>([])
  const [rxAdvice, setRxAdvice] = useState('')
  const [nextMode, setNextMode] = useState<NextMode>('book')
  const [nextDate, setNextDate] = useState(addDaysIso(today, 7))
  const [nextSlot, setNextSlot] = useState('11:00 AM')
  const [showPatientView, setShowPatientView] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [result, setResult] = useState<{ rxId: string | null; message: string; warnings: string[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const d = await resolveCurrentDentist<{ id: string; name: string; clinic_name: string | null }>(supabase, 'id, name, clinic_name')
        if (!d) { setLoadError('Could not find your clinic.'); return }
        if (cancelled) return
        setDentist(d)
        const startOfDayIst = new Date(`${today}T00:00:00+05:30`).toISOString()
        const [pt, intakes, chartRows, plans, visits, fees, steps, tpls] = await Promise.all([
          supabase.from('patients').select('*').eq('id', patientId).eq('dentist_id', d.id).maybeSingle(),
          supabase.from('patient_intakes').select('id, patient_id, complaint, status, created_at, patients(name)').eq('dentist_id', d.id).gte('created_at', startOfDayIst).order('created_at', { ascending: true }),
          supabase.from('dental_chart_entries').select('tooth_number, condition').eq('patient_id', patientId).eq('dentist_id', d.id),
          supabase.from('treatment_plans').select('id, title, status, total_estimated_cost, total_cost, created_at, notes, treatment_plan_steps(id, step_number, treatment_name, tooth_numbers, tooth_number, estimated_cost, status, notes)').eq('patient_id', patientId).eq('dentist_id', d.id).in('status', ['presented', 'accepted', 'in_progress']).order('created_at', { ascending: false }),
          supabase.from('visits').select('id, visit_date, chief_complaint, clinical_findings, treatment_done').eq('patient_id', patientId).eq('dentist_id', d.id).order('visit_date', { ascending: false }).limit(3),
          supabase.from('dentist_treatments').select('fee_from, treatments(name)').eq('dentist_id', d.id),
          supabase.from('treatment_plan_steps').select('treatment_name, estimated_cost, tooth_numbers, created_at').order('created_at', { ascending: false }).limit(300),
          supabase.from('emr_templates').select('name, sections_json, advice').eq('dentist_id', d.id),
        ])
        if (cancelled) return
        if (pt.error || !pt.data) { setLoadError('Patient not found.'); return }
        setPatient(pt.data)

        // patient_intakes may not exist yet (SQL not run) — the screen still works without it.
        const allIntakes = intakes.error ? [] : (intakes.data || [])
        setWaiting(allIntakes.filter((r: any) => r.status === 'waiting'))
        const mine = allIntakes.filter((r: any) => r.patient_id === patientId && r.status === 'waiting')
        const myIntake = mine.length ? mine[mine.length - 1] : null
        setIntake(myIntake)

        const cm: Record<number, string> = {}
        for (const r of chartRows.data || []) if (r.condition !== 'healthy') cm[r.tooth_number] = r.condition
        setChart(cm)
        setOpenPlans(plans.data || [])
        setPastVisits(visits.data || [])

        const fm: Record<string, number> = {}
        for (const r of (fees.data || []) as any[]) {
          const n = String(r.treatments?.name || '').toLowerCase()
          const fee = Number(r.fee_from || 0)
          if (!n || !fee) continue
          for (const def of TREATMENTS) if (!fm[def.name] && def.match.some(m => n.includes(m))) fm[def.name] = fee
        }
        setFeeByTreatment(fm)

        // Remember the price used last time for each step name (per tooth).
        const lp: Record<string, number> = {}
        for (const s of (steps.data || []) as any[]) {
          const nm = String(s.treatment_name || '')
          if (!nm || lp[nm] !== undefined) continue
          const count = String(s.tooth_numbers || '').split(',').map(x => x.trim()).filter(Boolean).length || 1
          const cost = Number(s.estimated_cost || 0)
          if (cost > 0) lp[nm] = Math.round(cost / count)
        }
        setLastPrice(lp)

        const mt: RxTemplate[] = []
        for (const r of (tpls.data || []) as any[]) {
          const m = Array.isArray(r.sections_json?.medications) ? r.sections_json.medications.filter((x: any) => x?.name?.trim()) : []
          if (m.length) mt.push({ name: r.name, medicines: m, advice: r.advice || undefined, mine: true })
        }
        setMyTemplates(mt)

        // Pre-select from the tablet answers.
        const c = myIntake?.complaint as IntakeComplaint | undefined
        const sugg = suggestDiagnoses(c)
        if (sugg.length) setDx([sugg[0]])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [patientId, router, today])

  const complaint = (intake?.complaint || null) as IntakeComplaint | null
  const hintTeeth = useMemo(() => teethForArea(complaint?.area), [complaint?.area])
  const suggestedDx = useMemo(() => suggestDiagnoses(complaint), [complaint])
  const suggestedTx = useMemo(() => suggestTreatments(dx), [dx])
  const toothLabel = teeth.length ? [...teeth].sort((a, b) => a - b).join(', ') : ''

  function defaultPrice(def: TreatmentDef, ct: string | null): number {
    return lastPrice[stepName(def.name, ct)] ?? lastPrice[def.name] ?? feeByTreatment[def.name] ?? 0
  }
  function priceOf(name: string): number {
    const def = TREATMENTS.find(t => t.name === name)!
    const raw = prices[name === 'Crown' ? `Crown:${crownType}` : name]
    return raw !== undefined ? Number(raw || 0) : defaultPrice(def, name === 'Crown' ? crownType : null)
  }
  function qtyOf(name: string): number {
    const def = TREATMENTS.find(t => t.name === name)!
    return def.perTooth ? Math.max(1, teeth.length) : 1
  }
  const planLines = picked.map(name => {
    const def = TREATMENTS.find(t => t.name === name)!
    return { def, name, label: stepName(name, def.crown ? crownType : null), unit: priceOf(name), qty: qtyOf(name), total: priceOf(name) * qtyOf(name) }
  })
  const planTotal = planLines.reduce((s, l) => s + l.total, 0)
  const planVisits = Math.max(1, planLines.reduce((s, l) => s + l.def.sittings, 0))
  const hasBraces = picked.includes('Braces')
  const planTime = hasBraces ? 'about 12 to 18 months' : planVisits > 1 ? `about ${planVisits - 1} week${planVisits - 1 > 1 ? 's' : ''}` : 'one visit'

  function toggleTooth(n: number) { setTeeth(t => t.includes(n) ? t.filter(x => x !== n) : [...t, n]) }
  function toggleDx(d: string) { setDx(l => l.includes(d) ? l.filter(x => x !== d) : [...l, d]) }
  function togglePick(n: string) {
    setPicked(l => l.includes(n) ? l.filter(x => x !== n) : [...l, n])
  }
  function pickRx(tpl: RxTemplate) {
    setRxName(tpl.name)
    const { medicines, notes } = applyAllergySwaps(tpl.medicines, patient?.allergies)
    setMeds(medicines); setRxNotes(notes); setRxAdvice(tpl.advice || '')
  }

  // The patient's answer also pre-picks the usual prescription and next step.
  function chooseAnswer(a: 'start' | 'later') {
    setAnswer(a)
    if (a === 'later') {
      setNextMode('remind')
      if (!rxName) pickRx(RX_TEMPLATES.find(t => t.name === 'Pain relief only')!)
    } else if (!rxName) {
      if (picked.includes('RCT')) pickRx(RX_TEMPLATES[0])
      else if (picked.includes('Extraction')) pickRx(RX_TEMPLATES[1])
    }
  }

  async function handleSave() {
    if (!dentist || !patient) return
    setSaveError(null)
    if (picked.length > 0 && !answer) { setSaveError('Step 3: tap "Start today" or "Later" for the new plan.'); return }
    if (picked.some(n => TREATMENTS.find(t => t.name === n)!.perTooth) && teeth.length === 0) { setSaveError('Pick the tooth on the chart for this treatment.'); return }
    setSaving(true)
    const warnings: string[] = []
    const supabase = createClient()
    try {
      const now = new Date().toISOString()
      const findings = dx.length ? `${toothLabel ? `${toothLabel}: ` : ''}${dx.join(', ')}` : ''
      const doneItems: string[] = []

      // 2-4. New plan + steps
      let newPlanTitle = ''
      if (planLines.length) {
        newPlanTitle = `${planLines.map(l => l.label).join(' + ')}${toothLabel ? ` · ${toothLabel}` : ''}`
        const progressAny = planLines.some(l => (doneNew[l.name] || 'none') !== 'none')
        const allDone = planLines.every(l => doneNew[l.name] === 'finished')
        const status = answer === 'later' ? 'presented' : allDone ? 'completed' : progressAny ? 'in_progress' : 'accepted'
        const { data: plan, error: planErr } = await supabase.from('treatment_plans').insert({
          patient_id: patient.id, dentist_id: dentist.id, title: newPlanTitle,
          total_cost: planTotal, total_estimated_cost: planTotal, status,
          presented_at: now, accepted_at: answer === 'start' ? now : null,
          notes: `About ${planVisits} visit${planVisits > 1 ? 's' : ''}, ${planTime}.${findings ? ` Diagnosis: ${findings}.` : ''}`,
        }).select('id').single()
        if (planErr) throw new Error(`Plan not saved: ${planErr.message}`)
        const stepRows = planLines.map((l, i) => {
          const p = answer === 'start' ? (doneNew[l.name] || 'none') : 'none'
          if (p !== 'none') doneItems.push(`${l.label}${l.def.perTooth && toothLabel ? ` ${toothLabel}` : ''}${p === 'sitting' ? ' (sitting done)' : ''}`)
          return {
            plan_id: plan.id, step_number: i + 1, treatment_name: l.label,
            tooth_number: l.def.perTooth ? toothLabel || null : null, tooth_numbers: l.def.perTooth ? toothLabel || null : null,
            estimated_cost: l.total,
            notes: `${l.def.sittings > 0 ? `${l.def.sittings} sitting${l.def.sittings > 1 ? 's' : ''}` : 'Same day'}${p === 'sitting' ? ` · sitting done ${today}` : ''}`,
            status: p === 'finished' ? 'completed' : p === 'sitting' ? 'scheduled' : 'pending',
            completed_at: p === 'finished' ? now : null,
          }
        })
        const { error: stepErr } = await supabase.from('treatment_plan_steps').insert(stepRows)
        if (stepErr) throw new Error(`Plan steps not saved: ${stepErr.message}`)
      }

      // Existing open plans: acceptance + today's progress
      for (const plan of openPlans) {
        const steps: any[] = plan.treatment_plan_steps || []
        let touched = false
        for (const s of steps) {
          const p = doneOld[s.id] || 'none'
          if (p === 'none') continue
          touched = true
          doneItems.push(`${s.treatment_name}${s.tooth_numbers ? ` ${s.tooth_numbers}` : ''}${p === 'sitting' ? ' (sitting done)' : ''}`)
          const { error: e } = await supabase.from('treatment_plan_steps').update({
            status: p === 'finished' ? 'completed' : 'scheduled',
            completed_at: p === 'finished' ? now : null,
            notes: `${s.notes ? `${s.notes} · ` : ''}${p === 'finished' ? 'finished' : 'sitting done'} ${today}`,
          }).eq('id', s.id)
          if (e) warnings.push(`Could not update "${s.treatment_name}": ${e.message}`)
        }
        const accepted = acceptOld[plan.id]
        if (touched || accepted) {
          const after = steps.map(s => {
            const p = doneOld[s.id] || 'none'
            return p === 'finished' ? 'completed' : p === 'sitting' ? 'scheduled' : s.status
          })
          const allDone = after.length > 0 && after.every(st => st === 'completed' || st === 'skipped')
          const status = allDone ? 'completed' : touched ? 'in_progress' : 'accepted'
          const { error: e } = await supabase.from('treatment_plans').update({
            status, ...(plan.status === 'presented' ? { accepted_at: now } : {}),
          }).eq('id', plan.id)
          if (e) warnings.push(`Could not update plan status: ${e.message}`)
        }
      }

      // 1. Chart: one condition per tooth, same delete-then-insert rule as the Tooth Chart tab.
      const cond = dx.map(d => DIAGNOSIS_TO_CONDITION[d]).find(Boolean)
      if (cond && teeth.length) {
        const { error: delErr } = await supabase.from('dental_chart_entries').delete().eq('patient_id', patient.id).eq('dentist_id', dentist.id).in('tooth_number', teeth)
        if (delErr) warnings.push(`Chart not updated: ${delErr.message}`)
        else {
          const { error: insErr } = await supabase.from('dental_chart_entries').insert(teeth.map(n => ({ patient_id: patient.id, dentist_id: dentist.id, tooth_number: n, condition: cond, notes: dx.join(', ') })))
          if (insErr) warnings.push(`Chart not updated: ${insErr.message}`)
        }
      }

      // 5. Prescription (always offered; skipped only when "No medicine")
      let rxId: string | null = null
      if (meds.length) {
        const { data: rx, error: rxErr } = await supabase.from('prescriptions').insert({
          patient_id: patient.id, dentist_id: dentist.id, medicines: meds,
          instructions: rxAdvice || null, template_used: rxName || 'Prescription',
        }).select('id').single()
        if (rxErr) warnings.push(`Prescription not saved: ${rxErr.message}`)
        else rxId = rx.id
      }

      // 6. Next sitting or reminder
      let nextLine = ''
      const nextNote = picked.length ? newPlanTitle : openPlans[0]?.title || 'Follow-up'
      if (nextMode === 'book') {
        const { error: apErr } = await supabase.from('appointments').insert({
          dentist_id: dentist.id, patient_id: patient.id, patient_name: patient.name, patient_phone: patient.phone,
          appt_date: nextDate, time_slot: nextSlot, status: 'confirmed', notes: nextNote, reference_no: generateApptRef(),
        })
        if (apErr) {
          warnings.push(apErr.code === '23505' ? `${prettyDate(nextDate)} ${nextSlot} is already booked. Book the next sitting from Appointments.` : `Appointment not booked: ${apErr.message}`)
        } else nextLine = `Next visit: ${prettyDate(nextDate)}, ${nextSlot}.`
      } else if (nextMode === 'remind') {
        const { error: rcErr } = await supabase.from('recall_reminders').insert({
          patient_id: patient.id, dentist_id: dentist.id, reminder_type: 'follow_up', due_date: nextDate,
          status: 'pending', message_channel: 'whatsapp', notes: `Pending plan: ${nextNote}`,
        })
        if (rcErr) warnings.push(`Reminder not set: ${rcErr.message}`)
      }

      // Visit note
      const { data: visit, error: vErr } = await supabase.from('visits').insert({
        patient_id: patient.id, dentist_id: dentist.id, visit_date: today,
        chief_complaint: complaintSummary(complaint) || null,
        clinical_findings: findings || null,
        treatment_done: doneItems.length ? doneItems.join('; ') : 'Consultation',
        next_appointment_recommended: nextMode === 'none' ? null : nextDate,
        next_appointment_notes: nextMode === 'remind' ? `Reminder: ${nextNote}` : nextMode === 'book' ? nextNote : null,
      }).select('id').single()
      if (vErr) warnings.push(`Visit note not saved: ${vErr.message}`)

      if (intake) {
        const { error: iErr } = await supabase.from('patient_intakes').update({ status: 'seen', seen_at: now, visit_id: visit?.id || null }).eq('id', intake.id)
        if (iErr) warnings.push(`Waiting list not updated: ${iErr.message}`)
      }

      // WhatsApp summary for the patient
      const clinic = dentist.clinic_name || dentist.name
      const lines: string[] = [`Hi ${String(patient.name || '').split(/\s+/)[0]}, from ${clinic}.`]
      if (dx.length) lines.push(`What we found${toothLabel ? ` (tooth ${toothLabel})` : ''}: ${dx.map(d => DIAGNOSIS_PLAIN[d] || d).join(', ')}.`)
      if (planLines.length) {
        lines.push(`Treatment plan: ${planLines.map(l => `${l.label} ${rupees(l.total)}`).join('; ')}. Total ${rupees(planTotal)}, about ${planVisits} visit${planVisits > 1 ? 's' : ''}.`)
        if (answer === 'later') lines.push('Your plan is saved. Reply here when you are ready to start.')
      }
      if (rxId) lines.push(`Your prescription: ${window.location.origin}/api/prescriptions/pdf?id=${rxId}`)
      if (nextLine) lines.push(nextLine)
      setResult({ rxId, message: lines.join('\n'), warnings })
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ---- Render -------------------------------------------------------------

  if (loading) return <div style={{ padding: 40, color: MUTED }}>Loading…</div>
  if (loadError || !patient) return <div style={{ padding: 40 }}>{loadError || 'Patient not found.'} <Link href="/for-dentists/dashboard/visit" style={{ color: TEAL_DARK }}>Back to waiting list</Link></div>

  if (result) {
    const wa = whatsappLink(patient.phone, result.message)
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px', display: 'grid', gap: 14 }}>
        <div style={{ ...card, borderColor: '#86EFAC', background: '#F0FDF4' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20 }}>Visit saved</div>
          <div style={{ fontSize: 14, color: '#166534' }}>{patient.name} · {prettyDate(today)}</div>
        </div>
        {result.warnings.length > 0 && (
          <div role="alert" style={{ ...card, borderColor: AMBER_LINE, background: AMBER_BG, color: AMBER_INK, fontSize: 14 }}>
            {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
        <div style={card}>
          <div style={{ fontWeight: 700 }}>Message for the patient</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', fontSize: 14, margin: 0, color: NAVY }}>{result.message}</pre>
          {wa
            ? <a href={wa} target="_blank" rel="noopener noreferrer" style={{ background: WHATSAPP, color: '#fff', borderRadius: 12, padding: 14, textAlign: 'center', fontWeight: 700, textDecoration: 'none' }}>Send on WhatsApp</a>
            : <div style={smallMuted}>No mobile number saved for this patient.</div>}
          {result.rxId && <a href={`/api/prescriptions/pdf?id=${result.rxId}`} target="_blank" rel="noopener noreferrer" style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, textAlign: 'center', fontWeight: 700, color: NAVY, textDecoration: 'none' }}>Print prescription</a>}
          <Link href={`/for-dentists/dashboard/billing?patient_id=${patient.id}`} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, textAlign: 'center', fontWeight: 700, color: NAVY, textDecoration: 'none' }}>Bill today&apos;s work</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Link href="/for-dentists/dashboard/visit" style={{ background: NAVY, color: '#fff', borderRadius: 12, padding: 12, textAlign: 'center', fontWeight: 700, textDecoration: 'none' }}>Next patient</Link>
          <Link href={`/for-dentists/dashboard/patients/${patient.id}`} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, textAlign: 'center', fontWeight: 700, color: NAVY, textDecoration: 'none' }}>Open patient file</Link>
        </div>
      </div>
    )
  }

  const allergyText = patient.allergies ? String(patient.allergies) : ''
  const otherWaiting = waiting.filter(w => w.patient_id !== patient.id)
  const dxList = showAllDx ? DIAGNOSES : Array.from(new Set([...suggestedDx, ...dx, ...DIAGNOSES.slice(0, 6)]))
  const rxChoices = [...RX_TEMPLATES.slice(0, 4), ...myTemplates, RX_TEMPLATES[4]]

  const tooth = (n: number, upper: boolean) => {
    const sel = teeth.includes(n)
    const c = chart[n]
    const cs = c ? CONDITION_STYLE[c] : undefined
    const missing = c === 'missing'
    const hint = hintTeeth.includes(n)
    return (
      <button key={n} type="button" onClick={() => toggleTooth(n)} aria-pressed={sel} title={c ? `${n}: ${c}` : String(n)}
        style={{
          flex: '1 1 0', minWidth: 0, height: 42, padding: 0, cursor: 'pointer', fontFamily: 'var(--font-body)',
          borderRadius: upper ? '8px 8px 12px 12px' : '12px 12px 8px 8px',
          border: `2px ${missing && !sel ? 'dashed' : 'solid'} ${sel ? TEAL : cs ? cs.line : hint ? '#F59E0B' : LINE}`,
          background: sel ? TEAL : cs ? cs.bg : '#fff', color: sel ? '#fff' : cs ? cs.ink : missing ? '#CBD5E1' : MUTED,
          fontSize: 11, fontWeight: 700, boxShadow: sel ? `0 0 0 3px ${TINT}` : 'none',
        }}>{n}</button>
    )
  }
  const arch = (list: number[], upper: boolean) => (
    <div style={{ display: 'flex', gap: 2, width: '100%' }}>
      {list.slice(0, 8).map(n => tooth(n, upper))}
      <div style={{ width: 2, background: LINE, margin: '0 4px', flexShrink: 0 }} />
      {list.slice(8).map(n => tooth(n, upper))}
    </div>
  )

  const progressChips = (value: Progress, set: (p: Progress) => void, multiSitting: boolean) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => set('none')} style={chipStyle(value === 'none')}>Not today</button>
      {multiSitting && <button type="button" onClick={() => set('sitting')} style={chipStyle(value === 'sitting')}>Sitting done</button>}
      <button type="button" onClick={() => set('finished')} style={chipStyle(value === 'finished')}>Finished</button>
    </div>
  )

  return (
    <div style={{ padding: '16px 12px 120px', maxWidth: 1180, margin: '0 auto', color: NAVY }}>
      {/* Waiting strip */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', paddingBottom: 6, marginBottom: 12 }}>
        <Link href="/for-dentists/dashboard/visit" style={{ ...smallMuted, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>‹ Waiting</Link>
        {otherWaiting.map(w => (
          <Link key={w.id} href={`/for-dentists/dashboard/visit/${w.patient_id}`} style={{ whiteSpace: 'nowrap', border: `1px solid ${LINE}`, background: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: NAVY, textDecoration: 'none' }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: WHATSAPP, marginRight: 6 }} />{w.patients?.name || 'Patient'}
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 14, alignItems: 'start' }}>
        {/* LEFT: patient + chart */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: 0 }}>{patient.name}</h1>
                <div style={smallMuted}>{[patient.age ? `${patient.age} yrs` : null, patient.gender, patient.phone].filter(Boolean).join(' · ')}</div>
              </div>
              <Link href={`/for-dentists/dashboard/patients/${patient.id}`} style={{ fontSize: 13, color: TEAL_DARK, fontWeight: 700, textDecoration: 'none' }}>Full file ›</Link>
            </div>
            {(allergyText || patient.medical_history || patient.current_medications) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {allergyText && <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 13 }}>Allergic: {allergyText}</span>}
                {patient.medical_history && <span style={{ background: '#FEF3C7', color: AMBER_INK, borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 13 }}>{patient.medical_history}</span>}
                {patient.current_medications && <span style={{ background: '#E0F2FE', color: '#075985', borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 13 }}>Takes: {patient.current_medications}</span>}
              </div>
            )}
            {complaint && (
              <div style={{ background: '#F8FAFC', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: TEAL_DARK, textTransform: 'uppercase', letterSpacing: '0.06em' }}>From the tablet</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{complaintSummary(complaint)}</div>
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700 }}>Dental chart</span>
              <span style={smallMuted}>Tap the tooth (or several)</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {arch(UPPER_TEETH, true)}
              {arch(LOWER_TEETH, false)}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', ...smallMuted }}>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: TEAL, marginRight: 4 }} />Selected</span>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#FEE2E2', border: '1.5px solid #EF4444', marginRight: 4 }} />Decay / infection</span>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#DBEAFE', border: '1.5px solid #60A5FA', marginRight: 4 }} />Treated</span>
              {hintTeeth.length > 0 && <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, border: '1.5px solid #F59E0B', marginRight: 4 }} />Where it hurts</span>}
            </div>
            {(teeth.length > 0 || dx.length > 0) && (
              <div style={{ background: '#F8FAFC', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', fontSize: 14 }}>
                <b>{toothLabel ? `Tooth ${toothLabel}` : 'No tooth picked'}</b>{dx.length ? ` · ${dx.join(', ')}` : ''}
                {planLines.length > 0 && <> → {planLines.map(l => l.label).join(' + ')}</>}
                {answer && <span style={{ color: answer === 'start' ? '#166534' : AMBER_INK, fontWeight: 700 }}> · {answer === 'start' ? 'starting today' : 'later'}</span>}
              </div>
            )}
          </div>

          {openPlans.length > 0 && (
            <div style={card}>
              <span style={{ fontWeight: 700 }}>Ongoing plans</span>
              {openPlans.map(plan => (
                <div key={plan.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b style={{ fontSize: 14 }}>{plan.title}</b>
                    <b style={{ fontSize: 14 }}>{rupees(Number(plan.total_estimated_cost || plan.total_cost || 0))}</b>
                  </div>
                  {plan.status === 'presented' && (
                    <button type="button" onClick={() => setAcceptOld(a => ({ ...a, [plan.id]: !a[plan.id] }))} style={{ ...chipStyle(!!acceptOld[plan.id], true), justifySelf: 'start' }}>
                      {acceptOld[plan.id] ? 'Patient said yes ✓' : 'Waiting for patient · tap if she says yes'}
                    </button>
                  )}
                  {(plan.treatment_plan_steps || []).sort((a: any, b: any) => a.step_number - b.step_number).map((s: any) => (
                    <div key={s.id} style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 13.5 }}>
                        <b>{s.treatment_name}</b>{s.tooth_numbers ? ` · ${s.tooth_numbers}` : ''}
                        <span style={smallMuted}> · {s.status === 'completed' ? 'finished' : s.status === 'scheduled' ? 'in progress' : 'not started'}{s.notes ? ` · ${s.notes}` : ''}</span>
                      </div>
                      {s.status !== 'completed' && s.status !== 'skipped' && (plan.status !== 'presented' || acceptOld[plan.id]) &&
                        progressChips(doneOld[s.id] || 'none', p => setDoneOld(d => ({ ...d, [s.id]: p })), true)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {pastVisits.length > 0 && (
            <div style={card}>
              <span style={{ fontWeight: 700 }}>Past visits</span>
              {pastVisits.map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, borderBottom: `1px dashed ${LINE}`, paddingBottom: 6 }}>
                  <span>{v.treatment_done || v.clinical_findings || v.chief_complaint || 'Visit'}</span>
                  <span style={{ color: MUTED, whiteSpace: 'nowrap' }}>{prettyDate(v.visit_date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: six steps */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={card}>
            <StepHead n={1} title={`Diagnosis${toothLabel ? ` on ${toothLabel}` : ''}`} done={dx.length > 0} />
            {suggestedDx.length > 0 && <div style={smallMuted}><b style={{ color: AMBER_INK }}>Suggested</b> from what the patient told the tablet</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dxList.map(d => <button key={d} type="button" onClick={() => toggleDx(d)} style={chipStyle(dx.includes(d), suggestedDx.includes(d))}>{d}</button>)}
              {!showAllDx && <button type="button" onClick={() => setShowAllDx(true)} style={chipStyle(false)}>+ More</button>}
            </div>
          </div>

          <div style={card}>
            <StepHead n={2} title="Treatment plan" hint="Prices remember your last entry" done={picked.length > 0} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TREATMENTS.map(t => <button key={t.name} type="button" onClick={() => togglePick(t.name)} style={chipStyle(picked.includes(t.name), suggestedTx.includes(t.name))}>{t.name}</button>)}
            </div>
            {picked.includes('Crown') && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={smallMuted}>Crown type (the patient can change it when you show the plan)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {CROWN_TYPES.map(ct => (
                    <button key={ct.id} type="button" onClick={() => setCrownType(ct.id)} style={{ ...chipStyle(crownType === ct.id), textAlign: 'left', display: 'grid', gap: 2 }}>
                      <span>{ct.id}</span>
                      <span style={{ fontWeight: 500, fontSize: 12.5, color: MUTED }}>{rupees(defaultPrice(TREATMENTS.find(t => t.name === 'Crown')!, ct.id))}{defaultPrice(TREATMENTS.find(t => t.name === 'Crown')!, ct.id) ? '' : ' · set price'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {planLines.length > 0 && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
                {planLines.map(l => (
                  <div key={l.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${LINE}`, alignItems: 'center' }}>
                    <div>
                      <b style={{ fontSize: 14 }}>{l.label}{l.def.perTooth && toothLabel ? `, ${toothLabel}` : ''}</b>
                      <div style={smallMuted}>{l.def.sittings === 0 ? 'Same day' : `${l.def.sittings} sitting${l.def.sittings > 1 ? 's' : ''}`}{l.qty > 1 ? ` · ${l.qty} teeth` : ''}</div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                      ₹<input inputMode="numeric" aria-label={`${l.label} price`} value={prices[l.name === 'Crown' ? `Crown:${crownType}` : l.name] ?? (l.unit ? String(l.unit) : '')}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); setPrices(p => ({ ...p, [l.name === 'Crown' ? `Crown:${crownType}` : l.name]: v })) }}
                        placeholder="Price" style={{ width: 80, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 8px', fontSize: 14, fontWeight: 700, textAlign: 'right', fontFamily: 'var(--font-body)' }} />
                      {l.qty > 1 && <span style={smallMuted}>×{l.qty}</span>}
                    </label>
                  </div>
                ))}
                <div style={{ background: NAVY, color: '#fff', display: 'flex', justifyContent: 'space-between', padding: '10px 12px', fontWeight: 700 }}>
                  <span>Estimate <span style={{ color: '#94A3B8', fontWeight: 500, fontSize: 12.5 }}>· {planVisits} visit{planVisits > 1 ? 's' : ''} · {planTime}</span></span>
                  <span>{rupees(planTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {picked.length > 0 && (
            <div style={card}>
              <StepHead n={3} title="Patient's answer" done={!!answer} />
              <button type="button" onClick={() => setShowPatientView(true)} style={{ border: `1px solid ${LINE}`, background: '#F8FAFC', borderRadius: 12, padding: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', color: NAVY }}>Show plan to patient</button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => chooseAnswer('start')} style={{ ...chipStyle(answer === 'start'), padding: 12 }}>Start today</button>
                <button type="button" onClick={() => chooseAnswer('later')} style={{ ...chipStyle(answer === 'later'), padding: 12 }}>Later, save plan</button>
              </div>
              {answer === 'later' && <div style={smallMuted}>The plan is saved under Pending plans and the patient gets a reminder.</div>}
            </div>
          )}

          {answer === 'start' && planLines.length > 0 && (
            <div style={card}>
              <StepHead n={4} title="Done today" hint="Tick what you did" />
              {planLines.map(l => (
                <div key={l.name} style={{ display: 'grid', gap: 6 }}>
                  <b style={{ fontSize: 14 }}>{l.label}{l.def.perTooth && toothLabel ? `, ${toothLabel}` : ''}</b>
                  {progressChips(doneNew[l.name] || 'none', p => setDoneNew(d => ({ ...d, [l.name]: p })), l.def.sittings > 1)}
                </div>
              ))}
            </div>
          )}

          <div style={card}>
            <StepHead n={5} title="Prescription" hint="Your templates included" done={!!rxName} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {rxChoices.map(tpl => <button key={`${tpl.mine ? 'm' : 'd'}-${tpl.name}`} type="button" onClick={() => pickRx(tpl)} style={chipStyle(rxName === tpl.name)}>{tpl.name}</button>)}
            </div>
            {meds.length > 0 && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '8px 12px', display: 'grid', gap: 6, fontSize: 13.5 }}>
                {meds.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span><b>{m.name}</b> {m.dosage}</span>
                    <span style={{ color: MUTED, display: 'flex', gap: 8, alignItems: 'center' }}>
                      {m.frequency} · {m.duration}
                      <button type="button" aria-label={`Remove ${m.name}`} onClick={() => setMeds(ms => ms.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', color: MUTED, cursor: 'pointer', fontSize: 16 }}>×</button>
                    </span>
                  </div>
                ))}
                {rxNotes.map((n, i) => <div key={i} style={{ fontSize: 12.5, color: AMBER_INK, fontWeight: 600 }}>{n}</div>)}
                <div style={smallMuted}>Check doses before sending. To change a medicine, use the Prescriptions tab in the patient file.</div>
              </div>
            )}
          </div>

          <div style={card}>
            <StepHead n={6} title="Next visit" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setNextMode('book')} style={chipStyle(nextMode === 'book')}>Book a sitting</button>
              <button type="button" onClick={() => setNextMode('remind')} style={chipStyle(nextMode === 'remind')}>Remind on WhatsApp</button>
              <button type="button" onClick={() => setNextMode('none')} style={chipStyle(nextMode === 'none')}>Nothing needed</button>
            </div>
            {nextMode !== 'none' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[3, 7, 14, 30].map(d => (
                    <button key={d} type="button" onClick={() => setNextDate(addDaysIso(today, d))} style={chipStyle(nextDate === addDaysIso(today, d))}>
                      {d === 7 ? '1 week' : d === 14 ? '2 weeks' : d === 30 ? '1 month' : `${d} days`}
                    </button>
                  ))}
                  <input type="date" value={nextDate} min={today} onChange={e => setNextDate(e.target.value)} aria-label="Pick date" style={{ border: `1.5px solid ${LINE}`, borderRadius: 10, padding: '6px 8px', fontFamily: 'var(--font-body)', fontSize: 14 }} />
                </div>
                {nextMode === 'book' && (
                  <select value={nextSlot} onChange={e => setNextSlot(e.target.value)} aria-label="Time" style={{ border: `1.5px solid ${LINE}`, borderRadius: 10, padding: '8px 10px', fontFamily: 'var(--font-body)', fontSize: 14, background: '#fff' }}>
                    {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <div style={smallMuted}>{nextMode === 'book' ? `Booking ${prettyDate(nextDate)}, ${nextSlot}.` : `Reminder goes out on ${prettyDate(nextDate)} and shows in Recalls.`}</div>
              </div>
            )}
          </div>

          {saveError && <div role="alert" style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 12, padding: '10px 14px', fontWeight: 600, fontSize: 14 }}>{saveError}</div>}
          <button type="button" onClick={handleSave} disabled={saving} style={{ background: TEAL, color: '#fff', border: 0, borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'var(--font-heading)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save visit'}
          </button>
          <div style={{ ...smallMuted, textAlign: 'center' }}>Nothing is saved until you press Save. After saving you can send everything on WhatsApp.</div>
        </div>
      </div>

      {showPatientView && (
        <div role="dialog" aria-modal="true" aria-label="Treatment plan for the patient" style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#F8FAFC', overflowY: 'auto' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 18px 60px', display: 'grid', gap: 18 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your treatment plan · {dentist?.clinic_name || dentist?.name}</div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 800, margin: '4px 0 0' }}>{teeth.length === 1 ? `${toothPlainName(teeth[0])} (${teeth[0]})` : teeth.length ? `Teeth ${toothLabel}` : patient.name}</h2>
            </div>
            {dx.length > 0 && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 14, padding: '12px 16px', fontSize: 16 }}>
                <b>What the doctor found:</b> {dx.map(d => DIAGNOSIS_PLAIN[d] || d).join(', ')}.
              </div>
            )}
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
              {planLines.map(l => (
                <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${LINE}`, fontSize: 16 }}>
                  <div><b>{l.def.crown ? `Cap (crown), ${crownType}` : TREATMENT_PLAIN[l.name] || l.name}</b>
                    <div style={{ fontSize: 13.5, color: MUTED }}>{l.def.sittings === 0 ? 'Today' : `${l.def.sittings} visit${l.def.sittings > 1 ? 's' : ''}`}</div></div>
                  <b>{rupees(l.total)}</b>
                </div>
              ))}
              <div style={{ background: NAVY, color: '#fff', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
                <span>Total<div style={{ color: '#94A3B8', fontWeight: 500, fontSize: 13.5 }}>About {planVisits} visit{planVisits > 1 ? 's' : ''}, {planTime} · pay per visit</div></span>
                <span>{rupees(planTotal)}</span>
              </div>
            </div>
            {picked.includes('Crown') && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Choose your cap</div>
                {CROWN_TYPES.map(ct => {
                  const p = defaultPrice(TREATMENTS.find(t => t.name === 'Crown')!, ct.id) * Math.max(1, teeth.length)
                  return (
                    <button key={ct.id} type="button" onClick={() => setCrownType(ct.id)} style={{ border: `2px solid ${crownType === ct.id ? TEAL : LINE}`, background: crownType === ct.id ? TINT : '#fff', borderRadius: 14, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: NAVY }}>
                      <span><b style={{ fontSize: 16 }}>{ct.id}</b><span style={{ display: 'block', fontSize: 13.5, color: MUTED }}>{ct.patientNote}</span></span>
                      {p > 0 && <b style={{ fontSize: 17 }}>{rupees(p)}</b>}
                    </button>
                  )
                })}
              </div>
            )}
            <button type="button" onClick={() => { chooseAnswer('start'); setShowPatientView(false) }} style={{ background: TEAL, color: '#fff', border: 0, borderRadius: 16, padding: 18, fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-heading)' }}>Yes, start treatment</button>
            <button type="button" onClick={() => { chooseAnswer('later'); setShowPatientView(false) }} style={{ background: '#fff', color: NAVY, border: `2px solid ${LINE}`, borderRadius: 16, padding: 16, fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-heading)' }}>Not today, save my plan</button>
            <button type="button" onClick={() => setShowPatientView(false)} style={{ background: 'none', border: 0, color: MUTED, fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>Back to doctor&apos;s screen</button>
          </div>
        </div>
      )}
    </div>
  )
}
