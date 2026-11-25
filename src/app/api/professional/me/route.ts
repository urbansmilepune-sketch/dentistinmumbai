// PATCH /api/professional/me — update the three free-text fields on the
// dentist's professional profile (bio, publications, hospital
// affiliations). Auth-gated; updates the dentists row scoped to the
// caller's email so a malicious payload can't target another dentist.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SKILL_OPTIONS, isMissingColumnError } from '@/lib/national'

function cap(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.slice(0, max)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const update: Record<string, string | string[] | null> = {}
  // Allow clearing a field by sending an empty string; cap() coerces
  // empty/whitespace to null which the column accepts.
  if ('professional_bio' in payload)        update.professional_bio        = cap(payload.professional_bio, 4000)
  if ('publications' in payload)            update.publications            = cap(payload.publications, 4000)
  if ('hospital_affiliations' in payload)   update.hospital_affiliations   = cap(payload.hospital_affiliations, 4000)
  // Network v1 claim fields: up to 3 skills from the fixed list, one line
  // for patients, and the first-claim timestamp.
  if ('top_skills' in payload) {
    const raw = Array.isArray(payload.top_skills) ? payload.top_skills : []
    update.top_skills = Array.from(new Set(raw.filter((x: unknown): x is string => typeof x === 'string' && SKILL_OPTIONS.includes(x)))).slice(0, 3) as string[]
  }
  if ('patient_line' in payload) update.patient_line = cap(payload.patient_line, 140)
  if (payload.claim === true) update.network_claimed_at = new Date().toISOString()
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  // Scope by the user's email — never trust a dentist_id from the payload.
  const { error } = await supabase
    .from('dentists')
    .update(update)
    .eq('email', user.email)
    .select('id')
    .single()
  if (error && isMissingColumnError(error)) {
    return NextResponse.json({ error: 'Profile claiming opens after a short database update. Please try again soon.' }, { status: 503 })
  }
  if (error) return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 })

  return NextResponse.json({ success: true })
}
