// POST /api/professional/[slug]/follow — toggle a follow relationship
// from the signed-in dentist to the dentist identified by slug. Same
// try-insert / fall-back-to-delete pattern used by likes + saves.
//
// We do NOT maintain a denormalised follower_count on dentists — counts
// are derived via count(*) on every render. The dentist_follows table
// is indexed on both follower_id + following_id so the query is cheap.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Sign in to follow' }, { status: 401 })

  // Resolve both endpoints. We need the follower id (from email) and
  // the target id (from slug). One round-trip via two .single() reads;
  // the second uses the admin client because the dentists row is keyed
  // by slug — anon RLS reads of arbitrary slugs aren't guaranteed.
  const [{ data: me }, { data: target }] = await Promise.all([
    supabase.from('dentists').select('id').eq('email', user.email).single(),
    admin.from('dentists').select('id, slug, name').eq('slug', slug).single(),
  ])
  if (!me)    return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })
  if (!target) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (me.id === target.id) return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 })

  const ins = await supabase
    .from('dentist_follows')
    .insert({ follower_id: me.id, following_id: target.id })
    .select('id')
    .single()

  if (ins.error) {
    if (ins.error.code === '23505') {
      const del = await supabase
        .from('dentist_follows').delete()
        .eq('follower_id', me.id).eq('following_id', target.id)
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
      // Recompute follower count for the response.
      const { count } = await admin
        .from('dentist_follows').select('*', { count: 'exact', head: true }).eq('following_id', target.id)
      return NextResponse.json({ success: true, following: false, follower_count: count ?? 0 })
    }
    return NextResponse.json({ error: ins.error.message }, { status: 500 })
  }
  const { count } = await admin
    .from('dentist_follows').select('*', { count: 'exact', head: true }).eq('following_id', target.id)
  return NextResponse.json({ success: true, following: true, follower_count: count ?? 0 })
}
