// POST /api/cases/ai-assist — the AI case helper on /cases/new (v2 network,
// Nov 2026). Looks at the uploaded photos and what the dentist has typed so
// far, and returns:
//   - per photo: is a face visible, is a patient name / ID printed on it (with
//     a rough box so the form can cover it), and whether it looks like an
//     X-ray or a clinical photo
//   - a draft title, short summary, specialty, question and tags
//   - draft chief complaint, diagnosis, plan, age/gender (notes only) and
//     complexity, used to pre-fill the form for WhatsApp cases
// The dentist reviews everything; nothing is applied without a tap, and the
// patient-consent tick is still theirs to give.
//
// Signed-in dentists only, Cloudinary URLs only, shares the daily AI budget
// (src/lib/aiUsage.ts). Degrades to a friendly error if AI is unavailable.

import { NextRequest, NextResponse } from 'next/server'
import { getViewerDentist } from '@/lib/national'
import { callClaudeVision, AIUnavailableError } from '@/lib/anthropic'
import { checkAiRateLimit, logAiUsage } from '@/lib/aiUsage'
import { SPECIALTIES } from '@/lib/dentalSpecialties'

export const maxDuration = 60

const MAX_PHOTOS = 8
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//

const SYSTEM = `You help dentists in India prepare a clinical case to share with other dentists.
You get the case photos and the dentist's notes. Reply with JSON only, no prose, in exactly this shape:
{"photos":[{"index":1,"face_visible":false,"identifying_text":false,"text_box":null,"looks_like":"xray"}],
 "title":"","summary":"","specialty":"","question":"","tags":[],
 "chief_complaint":"","diagnosis":"","treatment_plan":"","patient_age":null,"patient_gender":"","complexity":null}
Rules:
- photos: one entry per photo, index starting at 1.
  face_visible: true if any part of the patient's face beyond lips and teeth is visible (eyes, nose, full face) that could identify them.
  identifying_text: true if the image shows text that could identify the patient: a name, patient ID, phone number or date of birth (X-ray machine labels, OPG headers, file names). Clinic names, tooth numbers, R/L markers and rulers do NOT count.
  text_box: when identifying_text is true, the smallest box covering that text as fractions of the image {"x":0-1,"y":0-1,"w":0-1,"h":0-1} from the top-left corner, with a little margin; else null.
  looks_like: "xray" for OPG, CBCT, periapical or other radiographs; "photo" for clinical photos.
- title: under 90 characters, clinical and specific, e.g. "Immediate implant in upper left central incisor with thin buccal plate". No patient details.
- summary: 2 to 3 plain sentences describing the case from the notes and photos. Do not invent findings you cannot see or that are not in the notes.
- specialty: one of ${SPECIALTIES.map(s => s.slug).join(', ')}.
- question: one short question the dentist could ask peers about this case, or "" if the notes do not suggest one.
- tags: 3 to 6 short lowercase clinical tags.
- chief_complaint: the patient's complaint in one line, only if the notes say it; else "".
- diagnosis: a short clinical diagnosis from the notes and what is clearly visible (tooth numbers in FDI notation if known). If unsure, write what is visible, e.g. "Deep caries on 36 with periapical radiolucency"; "" if nothing can be said.
- treatment_plan: the treatment done or planned, as short steps, only from the notes or what the after photos clearly show; else "".
- patient_age: a number only if the notes give the age; else null. patient_gender: "Male", "Female" or "" only from the notes, never guessed from photos.
- complexity: 1 (simple) to 5 (complex) for this kind of case, or null if unclear.
Notes may be short WhatsApp shorthand (e.g. "36 rct pt 34m pain 2wk"): expand it into proper clinical wording.
Never include patient names, ages tied to names, or other personal details in any field.`

export async function POST(req: NextRequest) {
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in as a dentist' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const photos: Array<{ url: string; kind?: string }> = Array.isArray(body?.photos) ? body.photos.slice(0, MAX_PHOTOS) : []
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 4000) : ''
  if (!photos.length) return NextResponse.json({ error: 'Upload at least one photo first' }, { status: 400 })
  if (photos.some(p => typeof p?.url !== 'string' || !CLOUDINARY.test(p.url))) {
    return NextResponse.json({ error: 'Photos must be uploaded through this form' }, { status: 400 })
  }

  const limit = await checkAiRateLimit(viewer.id)
  if (!limit.ok) return NextResponse.json({ error: limit.message }, { status: 429 })

  // Smaller copies keep the request fast and cheap.
  const urls = photos.map(p => p.url.replace('/image/upload/', '/image/upload/w_1200,c_limit/'))
  try {
    const { text, usage } = await callClaudeVision({
      system: SYSTEM,
      imageUrls: urls,
      text: `Dentist's notes so far (may be empty):\n${notes || '(none)'}\n\nReturn the JSON now.`,
      maxTokens: 2000,
    })
    await logAiUsage(viewer.id, 'case_ai_assist', usage.totalTokens)
    const json = parseJson(text)
    if (!json) return NextResponse.json({ error: 'The AI reply could not be read. Please try again.' }, { status: 502 })
    return NextResponse.json({ success: true, result: clean(json, photos.length) })
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      console.error('[case-ai-assist]', err.message)
      return NextResponse.json({ error: 'The AI helper is not available right now. You can fill the form yourself.' }, { status: 503 })
    }
    throw err
  }
}

function parseJson(text: string): any | null {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

const frac = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0))

function clean(j: any, n: number) {
  const photos = Array.from({ length: n }, (_, i) => {
    const p = (Array.isArray(j.photos) ? j.photos : []).find((x: any) => Number(x?.index) === i + 1) || {}
    const box = p.identifying_text && p.text_box
      ? { x: frac(p.text_box.x), y: frac(p.text_box.y), w: frac(p.text_box.w), h: frac(p.text_box.h) }
      : null
    return {
      face_visible: !!p.face_visible,
      identifying_text: !!p.identifying_text,
      text_box: box && box.w > 0 && box.h > 0 ? box : null,
      looks_like: p.looks_like === 'xray' ? 'xray' : 'photo',
    }
  })
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  return {
    photos,
    title: str(j.title, 120),
    summary: str(j.summary, 800),
    specialty: SPECIALTIES.some(s => s.slug === j.specialty) ? j.specialty : '',
    question: str(j.question, 300),
    chief_complaint: str(j.chief_complaint, 400),
    diagnosis: str(j.diagnosis, 600),
    treatment_plan: str(j.treatment_plan, 1000),
    patient_age: Number.isInteger(Number(j.patient_age)) && Number(j.patient_age) > 0 && Number(j.patient_age) < 110 && j.patient_age !== null ? Number(j.patient_age) : null,
    patient_gender: ['Male', 'Female'].includes(j.patient_gender) ? j.patient_gender : '',
    complexity: Number.isInteger(Number(j.complexity)) && Number(j.complexity) >= 1 && Number(j.complexity) <= 5 && j.complexity !== null ? Number(j.complexity) : null,
    tags: (Array.isArray(j.tags) ? j.tags : []).filter((t: unknown) => typeof t === 'string').slice(0, 6).map((t: string) => t.slice(0, 40)),
  }
}
