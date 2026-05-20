// POST /api/admin/cases — admin moderation actions for clinical cases.
// Two action shapes supported:
//   { case_id, action: 'approve' }
//   { case_id, action: 'reject', reason }
// And for case reports:
//   { report_id, action: 'resolve' | 'dismiss' }
//
// Always writes via the service role because cases / case_reports RLS
// is intentionally restrictive (no admin role in JWT). Caller identity
// is validated against admin_users by email — same gate the admin
// dashboard already uses.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function assertAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return false
  const { data: row } = await admin
    .from('admin_users').select('id').ilike('email', user.email).maybeSingle()
  return !!row
}

export async function POST(request: NextRequest) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // ── Case approve / reject ────────────────────────────────────────────
  if (payload.case_id && (payload.action === 'approve' || payload.action === 'reject')) {
    const caseId = String(payload.case_id)
    const update: Record<string, unknown> = payload.action === 'approve'
      ? { status: 'approved', rejected_reason: null }
      : { status: 'rejected', rejected_reason: typeof payload.reason === 'string' ? payload.reason.slice(0, 1000) : null }
    const { error } = await admin.from('cases').update(update).eq('id', caseId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // ── Report resolve / dismiss ─────────────────────────────────────────
  if (payload.report_id && (payload.action === 'resolve' || payload.action === 'dismiss')) {
    const reportId = String(payload.report_id)
    const { error } = await admin
      .from('case_reports')
      .update({ status: payload.action === 'resolve' ? 'resolved' : 'dismissed' })
      .eq('id', reportId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
