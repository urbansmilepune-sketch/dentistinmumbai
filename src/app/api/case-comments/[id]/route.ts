// DELETE /api/case-comments/[id] — remove a comment. Only the comment
// author can delete; RLS already enforces this but the API double-checks
// so failures surface as 403 rather than a silent no-op. Re-syncs the
// parent case's cases.comment_count after the delete.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: commentId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists').select('id').eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  // Look up the row first via service role so we can compare authorship
  // even if the user-bound RLS would otherwise filter it out (shouldn't
  // for an author, but defence in depth).
  const { data: row } = await admin
    .from('case_comments')
    .select('id, dentist_id, case_id')
    .eq('id', commentId)
    .single()
  if (!row) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  if (row.dentist_id !== dentist.id) return NextResponse.json({ error: 'Not your comment' }, { status: 403 })

  const { error } = await supabase
    .from('case_comments').delete().eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resync the parent count.
  const { count } = await admin
    .from('case_comments').select('*', { count: 'exact', head: true }).eq('case_id', row.case_id)
  await admin.from('cases').update({ comment_count: count ?? 0 }).eq('id', row.case_id)

  return NextResponse.json({ success: true, comment_count: count ?? 0 })
}
