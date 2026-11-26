// POST /api/network-posts/<id>/replies — reply to a Question or Update post.
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist } from '@/lib/national'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const viewer = await getViewerDentist()
  if (!viewer || !viewer.is_active) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const json = await request.json().catch(() => null) as { body?: string } | null
  const body = String(json?.body || '').replace(/\r\n/g, '\n').trim()
  if (body.length < 2) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 })
  if (body.length > 1000) return NextResponse.json({ error: 'Keep replies under 1,000 characters.' }, { status: 400 })

  const db = adminDb()
  const { data: post } = await db.from('network_posts').select('id, reply_count, status').eq('id', id).maybeSingle()
  if (!post || post.status !== 'live') return NextResponse.json({ error: 'Post not found.' }, { status: 404 })

  const { data, error } = await db.from('network_post_replies').insert({ post_id: id, dentist_id: viewer.id, body }).select('id, created_at').single()
  if (error || !data) return NextResponse.json({ error: 'Could not reply. Please try again.' }, { status: 500 })
  // Recount instead of +1 so two replies at once can't drift the number.
  const { count } = await db.from('network_post_replies').select('id', { count: 'exact', head: true }).eq('post_id', id)
  await db.from('network_posts').update({ reply_count: count ?? (post.reply_count || 0) + 1 }).eq('id', id)
  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at })
}
