// Public reads for the dentist article pages.
//
// The dentist_articles RLS policy only grants a dentist access to their OWN
// rows (dentist_id ↔ auth.jwt() email). There is no public SELECT policy, so
// the anon client cannot read a published article for a patient-facing page.
// These reads therefore use the service-role client — but every query is
// strictly gated to status='published' on an is_active dentist, so nothing a
// patient shouldn't see can leak. This mirrors how the dashboard layout uses
// the service role for carefully-scoped reads.
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export type PublicArticleDentist = {
  id: string
  name: string | null
  slug: string
  clinic_name: string | null
  city: string | null
  qualifications: string | null
  profile_photo: string | null
  areas: { name: string | null } | null
}

export type PublicArticle = {
  id: string
  title: string
  slug: string
  content: string
  topic_type: string
  status: string
  published_at: string | null
  updated_at: string | null
  created_at: string
}

export type ArticleListItem = {
  title: string
  slug: string
  topic_type: string
  published_at: string | null
}

export type PublicArticleResult = {
  dentist: PublicArticleDentist
  article: PublicArticle
  related: ArticleListItem[]
}

const DENTIST_SELECT =
  'id, name, slug, clinic_name, city, qualifications, profile_photo, areas(name)'

// One published article + its dentist + up to 4 other published articles by
// the same dentist. Returns null (→ notFound) when the dentist is missing/
// inactive or the article isn't published.
export async function getPublicArticle(
  dentistSlug: string,
  articleSlug: string,
): Promise<PublicArticleResult | null> {
  const db = serviceClient()

  const { data: dentist } = await db
    .from('dentists')
    .select(DENTIST_SELECT)
    .eq('slug', dentistSlug)
    .eq('is_active', true)
    .maybeSingle()
  if (!dentist) return null

  const { data: article } = await db
    .from('dentist_articles')
    .select('id, title, slug, content, topic_type, status, published_at, updated_at, created_at')
    .eq('dentist_id', (dentist as any).id)
    .eq('slug', articleSlug)
    .eq('status', 'published')
    .maybeSingle()
  if (!article) return null

  const { data: related } = await db
    .from('dentist_articles')
    .select('title, slug, topic_type, published_at')
    .eq('dentist_id', (dentist as any).id)
    .eq('status', 'published')
    .neq('id', (article as any).id)
    .order('published_at', { ascending: false })
    .limit(4)

  return {
    dentist: dentist as unknown as PublicArticleDentist,
    article: article as unknown as PublicArticle,
    related: (related ?? []) as unknown as ArticleListItem[],
  }
}

// All published articles for one dentist — powers the "Articles by [Name]"
// section on the public profile page.
export async function getDentistPublishedArticles(dentistId: string): Promise<ArticleListItem[]> {
  const db = serviceClient()
  const { data } = await db
    .from('dentist_articles')
    .select('title, slug, topic_type, published_at')
    .eq('dentist_id', dentistId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  return (data ?? []) as unknown as ArticleListItem[]
}
