// POST /api/cases/[id]/like — toggle a like on an approved case (v1
// network, Nov 2026). Signed-in dentists only; you can't like your own
// case, so the total on a profile is always "liked by other dentists".
//
// Auth is checked here; reads and writes use the service role so the
// cases.like_count update isn't blocked by the cases RLS policies.
// cases.like_count is recomputed from count(*) after every toggle, so
// it can't drift.

import { NextRequest, NextResponse, after } from 'next/server'
import { adminDb, getViewerDentist } from '@/lib/national'
import { addAlert, removeAlert } from '@/lib/networkAlerts'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: caseId } = await ctx.params
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in as a dentist to like cases' }, { status: 401 })

  const db = adminDb()
  const { data: c } = await db.from('cases').select('id, dentist_id, status').eq('id', caseId).maybeSingle()
  // Cases in review can be liked by dentists too (27 Nov 2026).
  if (!c || (c.status !== 'approved' && c.status !== 'pending')) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.dentist_id === viewer.id) return NextResponse.json({ error: "You can't like your own case" }, { status: 400 })

  const { data: existing } = await db
    .from('case_likes').select('id').eq('case_id', caseId).eq('dentist_id', viewer.id).maybeSingle()

  let liked: boolean
  if (existing) {
    const del = await db.from('case_likes').delete().eq('id', existing.id)
    if (del.error) return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    liked = false
    after(() => removeAlert({ recipientId: c.dentist_id, actorId: viewer.id, kind: 'case_like', caseId }))
  } else {
    const ins = await db.from('case_likes').insert({ case_id: caseId, dentist_id: viewer.id })
    if (ins.error && ins.error.code !== '23505') return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    liked = true
    after(() => addAlert({ recipientId: c.dentist_id, actorId: viewer.id, kind: 'case_like', caseId }))
  }

  const { count } = await db.from('case_likes').select('id', { count: 'exact', head: true }).eq('case_id', caseId)
  const likeCount = count ?? 0
  await db.from('cases').update({ like_count: likeCount }).eq('id', caseId)

  return NextResponse.json({ success: true, liked, like_count: likeCount })
}
