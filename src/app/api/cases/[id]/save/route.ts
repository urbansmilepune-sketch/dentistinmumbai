// POST /api/cases/[id]/save — toggle a bookmark on a clinical case.
// Same try-insert / fall-back-to-delete pattern as likes; the unique
// constraint on (case_id, dentist_id) keeps the table de-duped. Unlike
// likes, the saves table is per-dentist private (case_saves RLS gates
// SELECT to the owner), so we don't expose a public count.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: caseId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Sign in to save cases' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists').select('id').eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  const ins = await supabase
    .from('case_saves')
    .insert({ case_id: caseId, dentist_id: dentist.id })
    .select('id')
    .single()

  if (ins.error) {
    if (ins.error.code === '23505') {
      // Already saved → toggle off.
      const del = await supabase
        .from('case_saves').delete()
        .eq('case_id', caseId).eq('dentist_id', dentist.id)
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
      return NextResponse.json({ success: true, saved: false })
    }
    return NextResponse.json({ error: ins.error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, saved: true })
}
