// Case drafts (Nov 2026): the shape of a half-filled case form, saved by
// /api/cases/drafts into case_drafts.data and handed back to CaseForm on
// resume. Consent is deliberately NOT part of a draft: the dentist must
// tick it fresh every time they publish.

export type DraftPhotoKind = 'before' | 'after' | 'xray_before' | 'xray_after'

export interface CaseDraftData {
  title: string
  specialty: string
  complexity: number
  description: string
  question: string
  patientAge: string
  patientGender: string
  chiefComplaint: string
  medicalHistory: string
  diagnosis: string
  treatmentPlanDetail: string
  numSittings: string
  outcomeSummary: string
  keyLearning: string
  patientSatisfaction: string
  materials: string[]
  costMin: string
  costMax: string
  durationWeeks: string
  clinicalNotes: string
  isPrivateNotes: boolean
  discussionEnabled: boolean
  photos: Array<{ url: string; kind: DraftPhotoKind; caption: string }>
}

const KINDS = new Set<string>(['before', 'after', 'xray_before', 'xray_after'])

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const digits = (v: unknown, max: number) => str(v, max).replace(/\D/g, '')

// Everything from the client is untrusted: keep only known fields, cap
// lengths, and keep only http(s) photo URLs.
export function cleanDraft(raw: unknown): CaseDraftData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const c = Number(r.complexity)
  const photos = (Array.isArray(r.photos) ? r.photos : [])
    .map((p: any) => ({ url: str(p?.url, 1000).trim(), kind: str(p?.kind, 20), caption: str(p?.caption, 200) }))
    .filter(p => /^https?:\/\//i.test(p.url) && KINDS.has(p.kind))
    .slice(0, 16) as CaseDraftData['photos']
  return {
    title: str(r.title, 160),
    specialty: str(r.specialty, 60),
    complexity: Number.isInteger(c) && c >= 1 && c <= 5 ? c : 3,
    description: str(r.description, 5000),
    question: str(r.question, 300),
    patientAge: digits(r.patientAge, 3),
    patientGender: str(r.patientGender, 10),
    chiefComplaint: str(r.chiefComplaint, 2000),
    medicalHistory: str(r.medicalHistory, 2000),
    diagnosis: str(r.diagnosis, 5000),
    treatmentPlanDetail: str(r.treatmentPlanDetail, 5000),
    numSittings: digits(r.numSittings, 3),
    outcomeSummary: str(r.outcomeSummary, 5000),
    keyLearning: str(r.keyLearning, 5000),
    patientSatisfaction: str(r.patientSatisfaction, 30),
    materials: (Array.isArray(r.materials) ? r.materials : []).filter((m): m is string => typeof m === 'string').map(m => m.slice(0, 100)).slice(0, 25),
    costMin: digits(r.costMin, 8),
    costMax: digits(r.costMax, 8),
    durationWeeks: digits(r.durationWeeks, 3),
    clinicalNotes: str(r.clinicalNotes, 5000),
    isPrivateNotes: r.isPrivateNotes === true,
    discussionEnabled: r.discussionEnabled !== false,
    photos,
  }
}

// The case_drafts table is created by a SQL file Ashish runs; until then
// any query on it fails with one of these.
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(err.message || '')
}
