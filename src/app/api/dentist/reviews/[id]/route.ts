// PATCH /api/dentist/reviews/[id] — the dentist's public reply to a live
// review. Body: { reply } (empty string removes it). Reception staff can't.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentDentist } from '@/lib/currentDentist'

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const dentist = await resolveCurrentDentist(supabase, 'id')
  if (!dentist) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (dentist.__staffRole === 'reception') return NextResponse.json({ error: 'Only the dentist can reply.' }, { status: 403 })

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({})) as any
  if (typeof body.reply !== 'string') return NextResponse.json({ error: 'Missing reply.' }, { status: 400 })
  const reply = body.reply.trim().slice(0, 600)

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: review } = await db.from('reviews').select('id, dentist_id, status').eq('id', id).maybeSingle()
  if (!review || review.dentist_id !== dentist.id) return NextResponse.json({ error: 'Review not found.' }, { status: 404 })
  if (review.status !== 'approved') return NextResponse.json({ error: 'You can reply once the review is live.' }, { status: 400 })

  const { error } = await db
    .from('reviews')
    .update({ dentist_reply: reply || null, dentist_reply_at: reply ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) {
    console.error('[dentist/reviews] reply update failed', error.message)
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
