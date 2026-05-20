// POST /api/cases/[id]/report — file a complaint against a case. Writes
// to case_reports via the service role because the table has no public
// read policy (we don't want reporters seeing other open complaints).
// Authentication is verified server-side; anonymous reports are
// rejected so we always have a dentist_id to follow up with.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Sign in to report a case' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists').select('id').eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const reason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 1000) : ''
  if (!reason) return NextResponse.json({ error: 'Reason required' }, { status: 400 })

  // Confirm the case exists; we don't tell the caller why their report
  // failed beyond a generic 404 so they can't enumerate case IDs.
  const { data: caseRow } = await admin.from('cases').select('id').eq('id', id).single()
  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const { error } = await admin
    .from('case_reports')
    .insert({ case_id: id, reporter_dentist_id: dentist.id, reason })
  if (error) return NextResponse.json({ error: 'Could not file report' }, { status: 500 })

  return NextResponse.json({ success: true })
}
