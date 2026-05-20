// PATCH /api/professional/me — update the three free-text fields on the
// dentist's professional profile (bio, publications, hospital
// affiliations). Auth-gated; updates the dentists row scoped to the
// caller's email so a malicious payload can't target another dentist.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const update: Record<string, string | null> = {}
  // Allow clearing a field by sending an empty string; cap() coerces
  // empty/whitespace to null which the column accepts.
  if ('professional_bio' in payload)        update.professional_bio        = cap(payload.professional_bio, 4000)
  if ('publications' in payload)            update.publications            = cap(payload.publications, 4000)
  if ('hospital_affiliations' in payload)   update.hospital_affiliations   = cap(payload.hospital_affiliations, 4000)
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  // Scope by the user's email — never trust a dentist_id from the payload.
  const { error } = await supabase
    .from('dentists')
    .update(update)
    .eq('email', user.email)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 })

  return NextResponse.json({ success: true })
}
