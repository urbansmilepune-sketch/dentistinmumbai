// POST /api/network-posts — a "Question" or "Update" post from the Post wall
// on the dentistinindia.in home. Cases still go through /cases/new (photos
// and patient consent). Posts go live straight away; the team can hide one
// by setting network_posts.status = 'hidden'. Table added by
// supabase/migrations/20261127090000_national_home.sql.
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist, isMissingColumnError } from '@/lib/national'

const DAILY_LIMIT = 10

export async function POST(request: NextRequest) {
  const viewer = await getViewerDentist()
  if (!viewer || !viewer.is_active) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const json = await request.json().catch(() => null) as { kind?: string; body?: string } | null
  const kind = json?.kind === 'question' || json?.kind === 'update' ? json.kind : null
  const body = String(json?.body || '').replace(/\r\n/g, '\n').trim()
  if (!kind) return NextResponse.json({ error: 'Pick Question or Update.' }, { status: 400 })
  if (body.length < 10) return NextResponse.json({ error: 'Write a little more (at least 10 characters).' }, { status: 400 })
  if (body.length > 2000) return NextResponse.json({ error: 'Keep it under 2,000 characters.' }, { status: 400 })

  const db = adminDb()
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count, error: countErr } = await db.from('network_posts').select('id', { count: 'exact', head: true })
    .eq('dentist_id', viewer.id).gte('created_at', since)
  if (countErr) {
    if (isMissingColumnError(countErr)) return NextResponse.json({ error: 'Posting questions and updates opens soon.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not post. Please try again.' }, { status: 500 })
  }
  if ((count ?? 0) >= DAILY_LIMIT) return NextResponse.json({ error: 'You have posted a lot today. Please try again tomorrow.' }, { status: 429 })

  const { data, error } = await db.from('network_posts').insert({ dentist_id: viewer.id, kind, body }).select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Could not post. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
