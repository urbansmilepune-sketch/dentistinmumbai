// AI note-refinement endpoint for the visit-notes editor. Takes the dentist's
// rough clinical note and rewrites it into clean, professional medical
// language — without inventing facts. Auth-gated to the logged-in dentist.
// Any failure degrades to a friendly "write manually" message so the editor is
// never blocked.
import { NextRequest, NextResponse } from 'next/server'
import { getDentistOwner } from '@/lib/dentistSession'
import { callClaude } from '@/lib/anthropic'

const SYSTEM_PROMPT = `You are a clinical documentation assistant for Indian dental practices.
Rewrite the dentist's rough treatment/consultation note into a clear, professional
clinical note using correct dental and medical terminology.
Rules:
- Preserve every clinical fact exactly. Do NOT invent procedures, teeth, tooth numbers,
  medications, dosages, findings, or follow-up that are not in the original note.
- Keep [  ] placeholders intact so the dentist can fill them in.
- Be concise and use standard clinical phrasing.
- Return ONLY the refined note text. No preamble, no headings, no markdown.`

const AI_DOWN = 'AI unavailable, please write manually'

export async function POST(request: NextRequest) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  if (!notes) return NextResponse.json({ error: 'Note text is required' }, { status: 400 })

  try {
    const refined = (await callClaude({ system: SYSTEM_PROMPT, user: notes })).trim()
    if (!refined) return NextResponse.json({ error: AI_DOWN }, { status: 502 })
    return NextResponse.json({ refined })
  } catch (err) {
    console.error('[ai:refine-notes]', err)
    return NextResponse.json({ error: AI_DOWN }, { status: 503 })
  }
}
