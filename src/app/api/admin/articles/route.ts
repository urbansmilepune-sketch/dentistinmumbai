// Admin article review queue API.
//   GET  — every article with its dentist (name/clinic/area), pending first.
//   POST — approve (status=published, published_at=now) or reject
//          (status=rejected, rejection_reason).
//
// Admin-only: requireAdmin() resolves the caller from the JWT, confirms
// admin_users membership, and returns the service-role client used for the
// RLS-exempt reads/writes below. A non-admin gets 401.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'

const ARTICLE_SELECT =
  'id, dentist_id, title, slug, content, topic_type, status, rejection_reason, published_at, created_at, updated_at, ' +
  'dentists(id, name, clinic_name, slug, city, areas(name))'

export async function GET() {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pending first (for the review queue), then newest within each status.
  const { data, error } = await admin_db
    .from('dentist_articles')
    .select(ARTICLE_SELECT)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rank: Record<string, number> = { pending: 0, published: 1, rejected: 2 }
  const articles = (data ?? []).slice().sort((a: any, b: any) => {
    const ra = rank[a.status] ?? 3
    const rb = rank[b.status] ?? 3
    return ra - rb
  })

  return NextResponse.json({ articles })
}

export async function POST(request: NextRequest) {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const action = body?.action
  const id = body?.id
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'Missing or invalid fields.' }, { status: 400 })
  }

  // Confirm the article exists before flipping its status (so a bad id is a
  // clean 404, not a silent no-op update). Public article/profile reads are
  // uncached service-role queries, so a published article appears immediately
  // — no cache invalidation needed here.
  const { data: article, error: fetchErr } = await admin_db
    .from('dentist_articles')
    .select('id')
    .eq('id', id)
    .single()
  if (fetchErr || !article) return NextResponse.json({ error: 'Article not found.' }, { status: 404 })

  let update: Record<string, any>
  if (action === 'approve') {
    update = { status: 'published', published_at: new Date().toISOString(), rejection_reason: null }
  } else {
    const reason = typeof body?.rejection_reason === 'string' ? body.rejection_reason.trim() : ''
    if (!reason) return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 })
    update = { status: 'rejected', rejection_reason: reason }
  }

  const { data: updated, error } = await admin_db
    .from('dentist_articles')
    .update(update)
    .eq('id', id)
    .select('id, status, published_at, rejection_reason')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, article: updated })
}
