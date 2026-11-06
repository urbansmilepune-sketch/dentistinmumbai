import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { GBP_ADDED_EVENT } from '@/lib/googleBooking'

// Saves the "I've added it on Google" tick. Stored as an analytics_events row
// (event_type 'gbp_link_added') for the acting dentist, resolved from the
// session and never taken from the request body. Unticking removes it.
// analytics_events RLS blocks the dentist role, so writes use the service role.
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
