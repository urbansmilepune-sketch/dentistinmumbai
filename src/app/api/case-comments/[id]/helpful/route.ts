// POST /api/case-comments/[id]/helpful — toggle the signed-in dentist's
// "helpful" mark on a reply. A dentist can't mark their own reply.

import { NextRequest, NextResponse, after } from 'next/server'
import { adminDb, getViewerDentist, isMissingColumnError } from '@/lib/national'
import { addAlert, removeAlert } from '@/lib/networkAlerts'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: commentId } = await ctx.params
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  const db = adminDb()
  const { data: comment } = await db.from('case_comments').select('id, dentist_id, case_id').eq('id', commentId).single()
  if (!comment) return NextResponse.json({ error: 'Reply not found' }, { status: 404 })
  if (comment.dentist_id === viewer.id) return NextResponse.json({ error: "You can't mark your own reply" }, { status: 400 })

  const { data: existing, error: readErr } = await db
    .from('case_comment_helpful').select('comment_id')
    .eq('comment_id', commentId).eq('dentist_id', viewer.id).maybeSingle()
  if (readErr) {
    const msg = isMissingColumnError(readErr) ? 'Helpful marks are switched on after the database update.' : readErr.message
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  let marked: boolean
  if (existing) {
    const { error } = await db.from('case_comment_helpful').delete().eq('comment_id', commentId).eq('dentist_id', viewer.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    marked = false
    after(() => removeAlert({ recipientId: comment.dentist_id, actorId: viewer.id, kind: 'helpful', commentId }))
  } else {
    const { error } = await db.from('case_comment_helpful').insert({ comment_id: commentId, dentist_id: viewer.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    marked = true
    after(() => addAlert({ recipientId: comment.dentist_id, actorId: viewer.id, kind: 'helpful', caseId: comment.case_id, commentId }))
  }
  const { count } = await db.from('case_comment_helpful').select('comment_id', { count: 'exact', head: true }).eq('comment_id', commentId)
  return NextResponse.json({ success: true, marked, count: count ?? 0 })
}
