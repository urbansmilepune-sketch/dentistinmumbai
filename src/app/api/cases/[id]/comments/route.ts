// /api/cases/[id]/comments
//
// GET  → public list of approved-case comments with author info.
//        Returns up to 200 entries ordered oldest-first.
// POST → verified-dentist-only insert. The DB RLS already enforces
//        is_verified = true AND parent case approved + discussion_enabled,
//        but we re-check here so we can return a friendly error message
//        instead of a bare 401/policy violation.
//
// On both POST and DELETE we recompute cases.comment_count via count(*)
// so the trending algorithm + comment-count badge stay accurate.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function recountAndPersist(caseId: string): Promise<number> {
  const { count } = await admin
    .from('case_comments')
    .select('*', { count: 'exact', head: true })
    .eq('case_id', caseId)
  const n = count ?? 0
  await admin.from('cases').update({ comment_count: n }).eq('id', caseId)
  return n
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: caseId } = await ctx.params
  // Service role read so we can join the author's dentist row regardless
  // of the requester's auth state. Comments are public on approved cases
  // (matches the RLS policy); we still gate by case status here so a
  // pending case's thread isn't leaked.
  const { data: caseRow } = await admin
    .from('cases').select('status').eq('id', caseId).single()
  if (!caseRow || caseRow.status !== 'approved') {
    return NextResponse.json({ comments: [] })
  }

  const { data: rows } = await admin
    .from('case_comments')
    .select('id, content, created_at, dentist_id, dentist:dentist_id(name, slug, city, specialties, is_verified)')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })
    .limit(200)

  return NextResponse.json({ comments: rows || [] })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: caseId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Sign in to comment' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists').select('id, is_verified').eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })
  if (!dentist.is_verified) return NextResponse.json({ error: 'Only State Dental Council-verified dentists can comment' }, { status: 403 })

  // Confirm the parent case accepts comments. The RLS WITH CHECK clause
  // enforces the same thing, but we want a clean 403 rather than a
  // policy-violation 401 if the dentist opens an old tab.
  const { data: caseRow } = await admin
    .from('cases').select('status, discussion_enabled').eq('id', caseId).single()
  if (!caseRow || caseRow.status !== 'approved' || !caseRow.discussion_enabled) {
    return NextResponse.json({ error: 'Discussion not available on this case' }, { status: 403 })
  }

  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const content = typeof payload.content === 'string' ? payload.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: 'Comment too long' }, { status: 400 })

  const { data: row, error } = await supabase
    .from('case_comments')
    .insert({ case_id: caseId, dentist_id: dentist.id, content })
    .select('id, content, created_at, dentist_id')
    .single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'Could not post' }, { status: 500 })

  const newCount = await recountAndPersist(caseId)
  return NextResponse.json({ success: true, comment: row, comment_count: newCount })
}
