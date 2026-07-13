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

// ── Expert Advice hub reads ────────────────────────────────────────────────
// Powers the /articles hub on every city domain and the national parent. Every
// approved (status='published') article on an active dentist appears on BOTH
// its city domain hub AND the national hub — no per-dentist opt-in. Reads go
// through the service role for the same reason as getPublicArticle above (no
// public SELECT policy on dentist_articles), strictly gated to published rows
// on active dentists.

export type ArticleCardDentist = {
  name: string | null
  slug: string
  clinic_name: string | null
  profile_photo: string | null
  city: string | null
  areas: { name: string | null } | null
}

export type ArticleCard = {
  title: string
  slug: string
  topic_type: string
  published_at: string | null
  dentist: ArticleCardDentist
}

// dentist_articles → dentists is many-to-one, so the embedded `dentists` is a
// single object (not an array). !inner drops articles whose dentist row is
// filtered out (inactive / wrong city).
const CARD_SELECT =
  'title, slug, topic_type, published_at, dentists!inner(name, slug, clinic_name, profile_photo, city, is_active, areas(name))'

function mapCard(row: any): ArticleCard {
  const d = row.dentists || {}
  return {
    title: row.title,
    slug: row.slug,
    topic_type: row.topic_type,
    published_at: row.published_at,
    dentist: {
      name: d.name ?? null,
      slug: d.slug ?? '',
      clinic_name: d.clinic_name ?? null,
      profile_photo: d.profile_photo ?? null,
      city: d.city ?? null,
      areas: d.areas ?? null,
    },
  }
}

// Published articles by dentists in one city, newest first. Optional topic
// filter narrows to a single topic_type.
export async function getCityArticles(citySlug: string, topicType?: string): Promise<ArticleCard[]> {
  const db = serviceClient()
  let q = db
    .from('dentist_articles')
    .select(CARD_SELECT)
    .eq('status', 'published')
    .eq('dentists.is_active', true)
    .eq('dentists.city', citySlug)
    .order('published_at', { ascending: false })
  if (topicType) q = q.eq('topic_type', topicType)
  const { data } = await q
  return (data ?? []).map(mapCard)
}

// Published articles across ALL cities for the national hub. Optional citySlug
// scopes to one city (the national city filter); optional topicType narrows by
// topic. Both filters compose.
export async function getNationalArticles(citySlug?: string, topicType?: string): Promise<ArticleCard[]> {
  const db = serviceClient()
  let q = db
    .from('dentist_articles')
    .select(CARD_SELECT)
    .eq('status', 'published')
    .eq('dentists.is_active', true)
    .order('published_at', { ascending: false })
  if (citySlug) q = q.eq('dentists.city', citySlug)
  if (topicType) q = q.eq('topic_type', topicType)
  const { data } = await q
  return (data ?? []).map(mapCard)
}

export type NationalArticleResult = {
  dentist: PublicArticleDentist & { mci_number: string | null }
  article: PublicArticle
  related: ArticleListItem[]
}

// One published article addressed by (city, articleSlug) — the national
// /articles/[city]/[slug] route. Article slugs carry a random suffix so they're
// effectively unique, but we still gate on dentist.city so a slug can only
// resolve under its own city segment. Returns the dentist (with mci_number for
// the credibility block) + up to 4 related articles, mirroring getPublicArticle.
export async function getArticleByNationalUrl(
  citySlug: string,
  articleSlug: string,
): Promise<NationalArticleResult | null> {
  const db = serviceClient()
  const { data: row } = await db
    .from('dentist_articles')
    .select(
      'id, title, slug, content, topic_type, status, published_at, updated_at, created_at, ' +
        'dentists!inner(id, name, slug, clinic_name, city, qualifications, profile_photo, mci_number, is_active, areas(name))',
    )
    .eq('slug', articleSlug)
    .eq('status', 'published')
    .eq('dentists.is_active', true)
    .eq('dentists.city', citySlug)
    .maybeSingle()
  if (!row) return null

  const r = row as any
  const d = r.dentists || {}
  const article: PublicArticle = {
    id: r.id,
    title: r.title,
    slug: r.slug,
    content: r.content,
    topic_type: r.topic_type,
    status: r.status,
    published_at: r.published_at,
    updated_at: r.updated_at,
    created_at: r.created_at,
  }

  const { data: related } = await db
    .from('dentist_articles')
    .select('title, slug, topic_type, published_at')
    .eq('dentist_id', d.id)
    .eq('status', 'published')
    .neq('id', r.id)
    .order('published_at', { ascending: false })
    .limit(4)

  return {
    dentist: {
      id: d.id,
      name: d.name ?? null,
      slug: d.slug ?? '',
      clinic_name: d.clinic_name ?? null,
      city: d.city ?? null,
      qualifications: d.qualifications ?? null,
      profile_photo: d.profile_photo ?? null,
      mci_number: d.mci_number ?? null,
      areas: d.areas ?? null,
    },
    article,
    related: (related ?? []) as unknown as ArticleListItem[],
  }
}
