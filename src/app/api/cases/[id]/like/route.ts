// POST /api/cases/[id]/like — toggle a "like" on a clinical case. The
// server picks up the current dentist from the auth cookie; clients
// never pass a dentist_id. We use a try-insert-then-fall-back-to-delete
// pattern so the call is idempotent: if the row already exists the
// unique constraint trips and we treat that as an "unlike".
//
// cases.like_count is recomputed from a count(*) after the toggle so
// the displayed number can't drift even if a parallel toggle races
// with us — last write wins on the count too.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: caseId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Sign in to like cases' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists').select('id').eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  // Try insert. Postgres unique-violation code = 23505 — surfaced by
  // supabase-js as error.code = '23505'.
  const ins = await supabase
    .from('case_likes')
    .insert({ case_id: caseId, dentist_id: dentist.id })
    .select('id')
    .single()

  let liked: boolean
  if (ins.error) {
    if (ins.error.code === '23505') {
      // Already liked → toggle off.
      const del = await supabase
        .from('case_likes')
        .delete()
        .eq('case_id', caseId).eq('dentist_id', dentist.id)
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
      liked = false
    } else {
      return NextResponse.json({ error: ins.error.message }, { status: 500 })
    }
  } else {
    liked = true
  }

  // Recompute and persist the displayed count. count via head:true keeps
  // the request light (no rows fetched).
  const { count } = await supabase
    .from('case_likes')
    .select('*', { count: 'exact', head: true })
    .eq('case_id', caseId)
  const likeCount = count ?? 0
  await supabase.from('cases').update({ like_count: likeCount }).eq('id', caseId)

  return NextResponse.json({ success: true, liked, like_count: likeCount })
}
