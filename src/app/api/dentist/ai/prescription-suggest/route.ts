// AI drug-suggestion endpoint for the prescription writer. Given a dental
// diagnosis (and optionally the patient's age) it asks Claude for the standard
// medications used in Indian dental practice and returns them as a clean array
// the dashboard renders as "Add to Prescription" cards. Auth-gated to the
// logged-in dentist. Any failure degrades to a friendly "write manually"
// message — the AI must never block the form.
import { NextRequest, NextResponse } from 'next/server'
import { getDentistOwner } from '@/lib/dentistSession'
import { callClaude } from '@/lib/anthropic'

const SYSTEM_PROMPT = `You are a dental prescription assistant for Indian dentists.
When given a dental diagnosis, suggest the standard medications
used in Indian dental practice. Always include:
- Generic drug name (not brand)
- Standard dosage
- Frequency
- Duration
- Special instructions
Format as JSON array only. Max 5 medicines.
Only suggest medications appropriate for dental practice.
Never suggest controlled substances.`

const AI_DOWN = 'AI unavailable, please write manually'

function str(v: unknown): string {
  if (v == null) return ''
  return (typeof v === 'string' ? v : String(v)).trim()
}

// Claude is asked for a bare JSON array but may wrap it in a markdown fence or
// surround it with a sentence. Peel those off, then parse defensively.
function parseMedicines(raw: string) {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  if (!text.startsWith('[')) {
    const arr = text.match(/\[[\s\S]*\]/)
    if (arr) text = arr[0]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .slice(0, 5)
    .map((m: any) => ({
      name: str(m?.name ?? m?.drug ?? m?.medicine ?? m?.generic_name),
      dosage: str(m?.dosage ?? m?.dose),
      frequency: str(m?.frequency ?? m?.freq),
      duration: str(m?.duration),
      instructions: str(m?.instructions ?? m?.special_instructions ?? m?.notes),
    }))
    .filter((m) => m.name)
}

export async function POST(request: NextRequest) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const diagnosis = str(body.diagnosis)
  if (!diagnosis) return NextResponse.json({ error: 'Diagnosis is required' }, { status: 400 })

  const ageNum = Number(body.patient_age)
  const patientAge = Number.isFinite(ageNum) && ageNum > 0 && ageNum < 130 ? Math.round(ageNum) : null

  const userMsg = patientAge
    ? `Diagnosis: ${diagnosis}\nPatient age: ${patientAge} years`
    : `Diagnosis: ${diagnosis}`

  try {
    const raw = await callClaude({ system: SYSTEM_PROMPT, user: userMsg })
    const medicines = parseMedicines(raw)
    if (!medicines.length) return NextResponse.json({ error: AI_DOWN }, { status: 502 })
    return NextResponse.json({ medicines })
  } catch (err) {
    console.error('[ai:prescription-suggest]', err)
    return NextResponse.json({ error: AI_DOWN }, { status: 503 })
  }
}
