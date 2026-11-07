import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { GBP_ADDED_EVENT, GBP_PLACE_PREFIX, PLACE_ID_RE } from '@/lib/googleBooking'

// Saves the "I've added it on Google" tick. Stored as an analytics_events row
// (event_type 'gbp_link_added') for the acting dentist, resolved from the
// session and never taken from the request body. Unticking removes it.
// analytics_events RLS blocks the dentist role, so writes use the service role.
//
// A body with `placeId` instead saves (or, with null, clears) the dentist's
// own Google listing as one 'gbp_place:<id>' row.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const dentist = await resolveCurrentDentist(supabase, 'id')
  if (!dentist) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const added = body?.added === true

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (body && 'placeId' in body) {
    const placeId = body.placeId
    if (placeId !== null && (typeof placeId !== 'string' || !PLACE_ID_RE.test(placeId))) {
      return NextResponse.json({ error: 'That Google listing could not be read. Please pick it again.' }, { status: 400 })
    }
    const { error: clearError } = await admin
      .from('analytics_events')
      .delete()
      .eq('dentist_id', dentist.id)
      .like('event_type', `${GBP_PLACE_PREFIX}%`)
    if (clearError) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
    if (placeId) {
      const { error } = await admin.from('analytics_events').insert({
        dentist_id: dentist.id,
        event_type: `${GBP_PLACE_PREFIX}${placeId}`,
        created_at: new Date().toISOString(),
      })
      if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, placeId: placeId ?? null })
  }

  // Clear any earlier tick first so there is at most one row per dentist.
  const { error: delError } = await admin
    .from('analytics_events')
    .delete()
    .eq('dentist_id', dentist.id)
    .eq('event_type', GBP_ADDED_EVENT)
  if (delError) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })

  if (added) {
    const { error } = await admin.from('analytics_events').insert({
      dentist_id: dentist.id,
      event_type: GBP_ADDED_EVENT,
      created_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, added })
}
