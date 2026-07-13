// POST /api/cases — create a clinical case. The client sends the text
// fields + an array of {url, kind, display_order} previously uploaded
// via /api/cases/upload-photo. We insert the case row first, then bulk-
// insert the photos. Status defaults to 'pending'; we flip it to
// 'approved' on the spot if the dentist already has ≥3 approved cases
// (the "first three need admin review, then auto-approve" rule).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SPECIALTIES } from '@/lib/dentalSpecialties'
import { ALL_MATERIALS } from '@/lib/dentalMaterials'

const SPECIALTY_SLUGS = new Set(SPECIALTIES.map(s => s.slug))
const ALLOWED_KINDS = new Set(['before', 'after', 'xray_before', 'xray_after'])
const MAX_PHOTOS = 12
const AUTO_APPROVE_THRESHOLD = 3

type IncomingPhoto = { url: string; kind: string; display_order?: number; caption?: string }

function cap(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

// Only keep an enum-style value if it's one of the allowed labels.
function oneOf(v: unknown, allowed: readonly string[]): string | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v : null
}

const GENDERS = ['Male', 'Female', 'Other'] as const
const SATISFACTIONS = ['Excellent', 'Good', 'Satisfactory', 'Requires follow-up'] as const

// The structured patient-template columns are added to `cases` out-of-band
// (Supabase SQL editor). Until that ALTER runs on the live DB, an insert
// that references them fails with 42703 / PGRST204. Detect that so we can
// retry without the template fields rather than 500 the whole submission.
function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42703' || err.code === 'PGRST204') return true
  return /could not find the .* column|column .* does not exist/i.test(err.message || '')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, is_active, is_verified')
    .eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })
  if (!dentist.is_active) return NextResponse.json({ error: 'Account inactive — contact support' }, { status: 403 })

  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // ── Validation ────────────────────────────────────────────────────────
  const title = cap(payload.title, 160)
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const specialty = typeof payload.specialty === 'string' ? payload.specialty.trim() : ''
  if (!SPECIALTY_SLUGS.has(specialty)) return NextResponse.json({ error: 'Unknown specialty' }, { status: 400 })

  const complexity = intInRange(payload.complexity, 1, 5) ?? 1
  const description = cap(payload.description, 5000)
  const clinicalNotes = cap(payload.clinical_notes, 5000)
  const isPrivateNotes = Boolean(payload.is_private_notes)
  const discussionEnabled = payload.discussion_enabled !== false
  const costMin = intInRange(payload.cost_min, 0, 10_000_000)
  const costMax = intInRange(payload.cost_max, 0, 10_000_000)
  const durationWeeks = intInRange(payload.duration_weeks, 0, 520)

  // Structured patient-case template (all optional server-side; the form
  // enforces diagnosis + treatment plan as required client-side).
  const patientAge = intInRange(payload.patient_age, 0, 130)
  const patientGender = oneOf(payload.patient_gender, GENDERS)
  const chiefComplaint = cap(payload.chief_complaint, 2000)
  const medicalHistory = cap(payload.medical_history, 2000)
  const diagnosis = cap(payload.diagnosis, 5000)
  const treatmentPlanDetail = cap(payload.treatment_plan_detail, 5000)
  const numSittings = intInRange(payload.num_sittings, 0, 999)
  const outcomeSummary = cap(payload.outcome_summary, 5000)
  const keyLearning = cap(payload.key_learning, 5000)
  const patientSatisfaction = oneOf(payload.patient_satisfaction, SATISFACTIONS)

  // Materials — accept only entries that match the curated catalogue.
  const rawMaterials = Array.isArray(payload.materials) ? payload.materials : []
  const materials = rawMaterials
    .filter((m: unknown): m is string => typeof m === 'string')
    .map((m: string) => m.trim())
    .filter((m: string) => ALL_MATERIALS.has(m))
    .slice(0, 25)

  // Photos
  const rawPhotos: IncomingPhoto[] = Array.isArray(payload.photos) ? payload.photos : []
  if (rawPhotos.length === 0) return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 })
  if (rawPhotos.length > MAX_PHOTOS) return NextResponse.json({ error: `Max ${MAX_PHOTOS} photos per case` }, { status: 400 })
  const photos = rawPhotos.map((p, i) => ({
    url: typeof p?.url === 'string' ? p.url.trim() : '',
    kind: typeof p?.kind === 'string' ? p.kind.trim() : '',
    caption: cap(p?.caption, 200),
    display_order: typeof p?.display_order === 'number' ? p.display_order : i,
  })).filter(p => p.url && ALLOWED_KINDS.has(p.kind))
  if (photos.length === 0) return NextResponse.json({ error: 'No valid photos' }, { status: 400 })

  // ── Auto-approve threshold check ─────────────────────────────────────
  const { count: approvedCount } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('dentist_id', dentist.id)
    .eq('status', 'approved')
  const initialStatus = (approvedCount ?? 0) >= AUTO_APPROVE_THRESHOLD ? 'approved' : 'pending'

  // ── Insert case + photos ─────────────────────────────────────────────
  const baseFields = {
    dentist_id: dentist.id,
    title,
    specialty,
    complexity,
    description,
    materials,
    cost_min: costMin,
    cost_max: costMax,
    duration_weeks: durationWeeks,
    clinical_notes: clinicalNotes,
    is_private_notes: isPrivateNotes,
    discussion_enabled: discussionEnabled,
    status: initialStatus,
  }
  const templateFields = {
    patient_age: patientAge,
    patient_gender: patientGender,
    chief_complaint: chiefComplaint,
    medical_history: medicalHistory,
    diagnosis,
    treatment_plan_detail: treatmentPlanDetail,
    num_sittings: numSittings,
    outcome_summary: outcomeSummary,
    key_learning: keyLearning,
    patient_satisfaction: patientSatisfaction,
  }

  const insertCase = (includeTemplate: boolean) =>
    supabase
      .from('cases')
      .insert(includeTemplate ? { ...baseFields, ...templateFields } : baseFields)
      .select('id, status')
      .single()

  let { data: caseRow, error: caseErr } = await insertCase(true)
  // Migration window: if the template columns aren't on the live DB yet,
  // retry without them so the case still saves (template data is dropped
  // until the ALTER runs — see the SQL handed off separately).
  if (caseErr && isMissingColumnError(caseErr)) {
    ;({ data: caseRow, error: caseErr } = await insertCase(false))
  }
  if (caseErr || !caseRow) {
    return NextResponse.json({ error: `Could not save case: ${caseErr?.message ?? 'unknown'}` }, { status: 500 })
  }

  // case_photos insert — if it fails, the case row is left in place; the
  // dentist can re-upload from /cases/[id]/edit (not built in Phase 1a;
  // for now they'd need to contact support to clean up). The alternative
  // would be a true DB transaction which Supabase client doesn't expose
  // without an RPC.
  const { error: photoErr } = await supabase
    .from('case_photos')
    .insert(photos.map(p => ({ case_id: caseRow.id, url: p.url, kind: p.kind, caption: p.caption, display_order: p.display_order })))
  if (photoErr) {
    return NextResponse.json({ error: `Case saved but photos failed: ${photoErr.message}`, case_id: caseRow.id }, { status: 500 })
  }

  return NextResponse.json({ success: true, case_id: caseRow.id, status: caseRow.status })
}
