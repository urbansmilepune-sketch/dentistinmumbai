// Dentist-facing article API.
//   GET  — list the signed-in dentist's own articles (newest first).
//   POST — submit a new article for review (status='pending').
//
// Auth is by email only — the dentists table has NO user_id column. We resolve
// the caller's dentist row via resolveCurrentDentist (owner-by-email, or
// invited staff → owner's dentist). All writes go through the user-bound
// client so the dentist_articles RLS policy
//   dentist_id in (select id from dentists where email = auth.jwt()->>'email')
// is the real gate; the dentist_id we insert is only ever the caller's own.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { buildArticleSlug, isTopicType } from '@/lib/articles'
import { getCityBySlug } from '@/config/cities'
import { sendAdminNewArticleAlert } from '@/lib/email'

const ARTICLE_COLS =
  'id, title, slug, content, topic_type, status, rejection_reason, published_at, created_at, updated_at'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dentist = await resolveCurrentDentist<{ id: string; slug: string }>(supabase, 'id, slug')
  if (!dentist) return NextResponse.json({ error: 'No dentist profile found for your account.' }, { status: 404 })

  const { data, error } = await supabase
    .from('dentist_articles')
    .select(ARTICLE_COLS)
    .eq('dentist_id', dentist.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // dentistSlug lets the list page build the public URL for published articles.
  return NextResponse.json({ articles: data ?? [], dentistSlug: dentist.slug })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dentist = await resolveCurrentDentist<{ id: string; name: string; clinic_name: string; city: string; slug: string }>(
    supabase, 'id, name, clinic_name, city, slug',
  )
  if (!dentist) return NextResponse.json({ error: 'No dentist profile found for your account.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  const topicType = body?.topic_type

  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
  if (!content || content === '<p></p>') return NextResponse.json({ error: 'The article content is empty.' }, { status: 400 })
  if (!isTopicType(topicType)) return NextResponse.json({ error: 'Invalid topic type.' }, { status: 400 })

  // Slug uniqueness comes from the 4-char random suffix (spec). A collision is
  // astronomically unlikely, but the .select() below surfaces a unique-index
  // rejection as a real error instead of a silent failure if one ever lands.
  const slug = buildArticleSlug(title)

  const { data, error } = await supabase
    .from('dentist_articles')
    .insert({
      dentist_id: dentist.id,
      title,
      slug,
      content,
      topic_type: topicType,
      status: 'pending',
    })
    .select(ARTICLE_COLS)
    .single()

  if (error) {
    console.error('[dentist/articles] insert failed', { message: error.message, code: error.code })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Could not save the article (permission denied).' }, { status: 500 })
  }

  // Admin email alert — best-effort; never blocks the submission.
  await sendAdminNewArticleAlert({
    dentistName: dentist.name,
    clinicName: dentist.clinic_name,
    city: getCityBySlug(dentist.city).cityName,
    articleTitle: data.title,
    articleSlug: data.slug,
    dentistSlug: dentist.slug,
  }).catch(console.error)

  return NextResponse.json({ success: true, article: data })
}
