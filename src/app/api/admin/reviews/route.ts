import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  // Identity comes from the JWT; admin_users lookup runs on the service-role
  // client so it bypasses RLS (admins without a self-read policy would
  // otherwise get a spurious Unauthorized).
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin_db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: admin } = await admin_db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Look up the dentist before flipping status so we can recompute their
  // rating aggregates regardless of whether this transition adds an approved
  // review (pending→approved) or removes one (approved→rejected).
  const { data: review, error: fetchErr } = await admin_db
    .from('reviews')
    .select('dentist_id')
    .eq('id', id)
    .single()
  if (fetchErr || !review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  const { error } = await admin_db.from('reviews').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recompute avg_rating + review_count from the source of truth (approved
  // reviews for this dentist) and write them back to the dentists row.
  // Previously these denormalised columns were never populated — the public
  // profile showed "no reviews" even after admins approved them.
  const { data: approvedRows } = await admin_db
    .from('reviews')
    .select('rating')
    .eq('dentist_id', review.dentist_id)
    .eq('status', 'approved')

  const count = approvedRows?.length ?? 0
  const avg = count > 0
    ? Number(((approvedRows!.reduce((s, r) => s + (r.rating || 0), 0)) / count).toFixed(2))
    : null

  const { error: aggErr } = await admin_db
    .from('dentists')
    .update({ avg_rating: avg, review_count: count })
    .eq('id', review.dentist_id)
  if (aggErr) {
    // Status flip already landed; report the aggregate failure but don't
    // pretend the whole call failed.
    console.error('[admin/reviews] aggregate update failed', { dentist_id: review.dentist_id, message: aggErr.message })
    return NextResponse.json({ success: true, aggregate_warning: aggErr.message })
  }

  return NextResponse.json({ success: true, avg_rating: avg, review_count: count })
}
