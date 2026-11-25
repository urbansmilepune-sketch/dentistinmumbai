// POST /api/events/[id]/interest — save the signed-in dentist's
// "going" / "remind me" choice for an approved event.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist, isMissingColumnError } from '@/lib/national'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const going = body.going === true
  const remind = body.remind === true

  const db = adminDb()
  const { data: ev, error: evErr } = await db.from('events').select('id, status').eq('id', eventId).maybeSingle()
  if (evErr) return NextResponse.json({ error: isMissingColumnError(evErr) ? 'Events are switched on after the database update.' : evErr.message }, { status: 503 })
  if (!ev || ev.status !== 'approved') return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (!going && !remind) {
    const { error } = await db.from('event_interest').delete().eq('event_id', eventId).eq('dentist_id', viewer.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db.from('event_interest').upsert(
      { event_id: eventId, dentist_id: viewer.id, going, remind },
      { onConflict: 'event_id,dentist_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, going, remind })
}
