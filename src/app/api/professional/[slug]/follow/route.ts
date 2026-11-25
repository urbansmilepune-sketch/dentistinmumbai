// POST /api/professional/[slug]/follow — toggle a follow from the
// signed-in dentist to the dentist with this slug (v1 network, Nov 2026).
// New cases from people you follow show in the case library's
// "Following" tab and in the weekly follow digest
// (src/lib/followDigest.ts).
//
// Auth is checked here; reads and writes use the service role.
// Follower counts are derived with count(*), never stored.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist } from '@/lib/national'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in as a dentist to follow' }, { status: 401 })

  const db = adminDb()
  // Slugs aren't unique across cities: the oldest registration owns it.
  const { data: rows } = await db
    .from('dentists').select('id, is_active').eq('slug', slug).order('created_at').limit(1)
  const target = rows?.[0]
  if (!target || target.is_active === false) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (target.id === viewer.id) return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 })

  const { data: existing } = await db
    .from('dentist_follows').select('id').eq('follower_id', viewer.id).eq('following_id', target.id).maybeSingle()

  let following: boolean
  if (existing) {
    const del = await db.from('dentist_follows').delete().eq('id', existing.id)
    if (del.error) return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    following = false
  } else {
    const ins = await db.from('dentist_follows').insert({ follower_id: viewer.id, following_id: target.id })
    if (ins.error && ins.error.code !== '23505') return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    following = true
  }

  const { count } = await db
    .from('dentist_follows').select('id', { count: 'exact', head: true }).eq('following_id', target.id)
  return NextResponse.json({ success: true, following, follower_count: count ?? 0 })
}
