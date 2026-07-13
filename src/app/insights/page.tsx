import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  isNationalHost,
  cityOrigin,
  CITY_CONFIGS,
  NATIONAL_ORIGIN,
  type CityConfig,
  type CitySlug,
} from '@/config/cities'
import NationalShell from '@/components/national/NationalShell'
import SaveButton from '@/app/cases/[id]/SaveButton'
import ShareButton from '@/components/national/ShareButton'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'
import { getNationalArticles, type ArticleCard } from '@/lib/publicArticles'
import { TOPIC_TYPES, topicLabel, topicBadge, isTopicType } from '@/lib/articles'
import { NAVY, TEAL_DARK, normalizeDrName, initialsFrom } from '@/app/dentist/[slug]/profileTheme'

// /insights — the merged "Dental Insights" hub for the national parent
// (dentistinindia.in). Two server-rendered tabs (?tab=articles default,
// ?tab=cases): patient-education articles aggregated across cities, and the
// clinical-cases browse surface lifted from /cases (minus the follow filter).
// City domains have no Cases feature, so they bounce to /articles.
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 36
const TRENDING_WINDOW_DAYS = 14
const TRENDING_LIMIT = 6

export const metadata: Metadata = {
  title: 'Dental Insights — Expert Articles & Clinical Cases | DentistIn India',
  description: 'Patient education articles and clinical cases from verified dentists across India.',
  alternates: { canonical: `${NATIONAL_ORIGIN}/insights` },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
}

interface Props {
  searchParams: Promise<{ tab?: string; topic?: string; city?: string; s?: string; c?: string; q?: string }>
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function InsightsPage({ searchParams }: Props) {
  const h = await headers()
  const national =
    h.get('x-is-national') === '1' || isNationalHost(h.get('x-forwarded-host') || h.get('host'))
  // City domains have no Cases feature — send them to their own articles hub.
  if (!national) redirect('/articles')

  const sp = await searchParams
  const tab: 'articles' | 'cases' = sp.tab === 'cases' ? 'cases' : 'articles'
  const content = tab === 'cases' ? await renderCases(sp) : await renderArticles(sp)

  return (
    <NationalShell badge="Dental Insights">
      <main style={{ background: '#fff', padding: '40px 20px 64px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: NAVY, lineHeight: 1.2 }}>
              Dental Insights from Verified Dentists Across India
            </h1>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8, maxWidth: 660 }}>
              Patient education articles and clinical cases — written and shared by verified Indian dentists
            </p>
          </div>

          {/* Tabs — server-side via ?tab=; switching resets the tab's sub-filters. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
            {([
              { key: 'articles', label: '📝 Expert Articles' },
              { key: 'cases', label: '🦷 Clinical Cases' },
            ] as const).map(t => {
              const active = t.key === tab
              return (
                <Link
                  key={t.key}
                  href={`/insights?tab=${t.key}`}
                  style={{
                    padding: '10px 16px',
                    fontSize: 14.5,
                    fontWeight: 700,
                    textDecoration: 'none',
                    color: active ? NAVY : '#64748B',
                    borderBottom: active ? `2px solid ${NAVY}` : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </Link>
              )
            })}
          </div>

          {content}
        </div>
      </main>
    </NationalShell>
  )
}

// ── Tab 1: Expert Articles ─────────────────────────────────────────────────

function articlesHref(topic?: string, city?: string): string {
  const u = new URLSearchParams()
  u.set('tab', 'articles')
  if (city) u.set('city', city)
  if (topic) u.set('topic', topic)
  return `/insights?${u.toString()}`
}

async function renderArticles(sp: { topic?: string; city?: string }) {
  const topic = isTopicType(sp.topic) ? sp.topic : undefined
  // One round trip: pull every published article for the active topic, derive
  // the city-filter chips from what actually has articles, filter by city in JS.
  const all = await getNationalArticles(undefined, topic)

  const activeCity =
    sp.city && (CITY_CONFIGS as Record<string, CityConfig>)[sp.city] ? (sp.city as CitySlug) : undefined

  const citiesWithArticles = Array.from(new Set(all.map(a => a.dentist.city).filter(Boolean) as string[]))
    .map(slug => (CITY_CONFIGS as Record<string, CityConfig>)[slug])
    .filter(Boolean)
    .sort((a, b) => a.cityName.localeCompare(b.cityName))

  const shown = activeCity ? all.filter(a => a.dentist.city === activeCity) : all

  const topicTabs: { type?: string; label: string }[] = [
    { type: undefined, label: 'All' },
    ...TOPIC_TYPES.map(t => ({ type: t.type as string, label: t.label })),
  ]

  return (
    <>
      {/* City filter — only cities that actually have published articles. */}
      {citiesWithArticles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <CityChip label="All cities" href={articlesHref(topic, undefined)} active={!activeCity} />
          {citiesWithArticles.map(c => (
            <CityChip
              key={c.citySlug}
              label={c.cityName}
              href={articlesHref(topic, c.citySlug)}
              active={activeCity === c.citySlug}
            />
          ))}
        </div>
      )}

      {/* Topic filter tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {topicTabs.map(t => {
          const isActive = (t.type ?? undefined) === (topic ?? undefined)
          return (
            <Link
              key={t.label}
              href={articlesHref(t.type, activeCity)}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: 'none',
                background: isActive ? NAVY : '#fff',
                color: isActive ? '#fff' : NAVY,
                border: `1px solid ${isActive ? NAVY : 'var(--border)'}`,
              }}
            >
              {t.label}
            </Link>
          )
        })}
      </div>

      {shown.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {shown.map(card => {
            const cfg = card.dentist.city
              ? (CITY_CONFIGS as Record<string, CityConfig>)[card.dentist.city]
              : undefined
            // Cards link to the CITY domain URL — the canonical home of the
            // article — not to a dentistinindia.in path.
            const href = cfg
              ? `${cityOrigin(cfg)}/dentist/${card.dentist.slug}/articles/${card.slug}`
              : `/articles/${card.dentist.city}/${card.slug}`
            return (
              <ArticleCardView
                key={`${card.dentist.city}/${card.slug}`}
                card={card}
                href={href}
                subtitle={cfg?.cityName || ''}
              />
            )
          })}
        </div>
      ) : (
        <EmptyState text="No articles published yet." ctaHref="/for-dentists" ctaLabel="Are you a dentist? Share your expertise →" />
      )}
    </>
  )
}

function CityChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        background: active ? '#1D4ED8' : '#F1F5F9',
        color: active ? '#fff' : '#475569',
      }}
    >
      {label}
    </Link>
  )
}

function ArticleCardView({ card, href, subtitle }: { card: ArticleCard; href: string; subtitle: string }) {
  const drName = normalizeDrName(card.dentist.name)
  const badge = topicBadge(card.topic_type)
  const meta = [subtitle, fmtDate(card.published_at)].filter(Boolean).join(' · ')
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 20,
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          alignSelf: 'flex-start',
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          background: badge.bg,
          color: badge.text,
        }}
      >
        {topicLabel(card.topic_type)}
      </span>

      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: NAVY, lineHeight: 1.3 }}>
        {card.title}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--blue-light)',
            color: 'var(--blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {card.dentist.profile_photo ? (
            <img src={card.dentist.profile_photo} alt={drName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            initialsFrom(card.dentist.name)
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {drName}
          </div>
          {meta && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{meta}</div>}
        </div>
      </div>

      <span style={{ fontSize: 13, fontWeight: 700, color: TEAL_DARK }}>Read article →</span>
    </Link>
  )
}

function EmptyState({ text, ctaHref, ctaLabel }: { text: string; ctaHref: string; ctaLabel: string }) {
  return (
    <div style={{ background: '#fff', border: '1px dashed var(--border)', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16 }}>{text}</p>
      <Link
        href={ctaHref}
        style={{
          display: 'inline-block',
          padding: '12px 22px',
          background: TEAL_DARK,
          color: '#fff',
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 14.5,
          textDecoration: 'none',
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  )
}

// ── Tab 2: Clinical Cases ───────────────────────────────────────────────────
// Copied from /cases (the follow filter is intentionally dropped for the
// merged view). Reads via the service role; cases gated to status='approved'.

interface CaseCard {
  id: string
  dentist_id: string | null
  title: string
  specialty: string
  complexity: number
  created_at: string
  like_count: number
  comment_count: number
  view_count: number
  dentists: { name: string; slug: string; clinic_name: string | null; city: string | null; profile_photo: string | null } | null
  thumb: string | null
}

const CASE_SELECT =
  'id, dentist_id, title, specialty, complexity, created_at, like_count, comment_count, view_count, dentists(name, slug, clinic_name, city, profile_photo)'

function pickThumb(photos: Array<{ case_id: string; url: string; kind: string }>, caseId: string): string | null {
  const here = photos.filter(p => p.case_id === caseId)
  if (here.length === 0) return null
  return (here.find(p => p.kind === 'before' || p.kind === 'after') || here[0]).url
}

function trendingScore(c: { like_count: number; view_count: number; comment_count: number; created_at: string }): number {
  const days = (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
  return (c.like_count * 3) + (c.view_count * 0.1) + (c.comment_count * 2) - days
}

async function renderCases(sp: { s?: string; c?: string; q?: string }) {
  const specialtyFilter = typeof sp.s === 'string' && SPECIALTIES.some(s => s.slug === sp.s) ? sp.s : null
  const complexityFilter = (() => {
    const n = parseInt(sp.c || '', 10)
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
  })()
  const keyword = typeof sp.q === 'string' ? sp.q.trim().slice(0, 120) : ''

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Viewer identity — powers the saved (★) overlay only. Follows are not used
  // here (the merged view drops the "from dentists I follow" filter).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let viewerDentistId: string | null = null
  let savedSet = new Set<string>()
  if (user?.email) {
    const { data: me } = await supabase.from('dentists').select('id').eq('email', user.email).single()
    viewerDentistId = me?.id ?? null
    if (viewerDentistId) {
      const { data: saves } = await admin.from('case_saves').select('case_id').eq('dentist_id', viewerDentistId)
      savedSet = new Set((saves || []).map((s: any) => s.case_id as string))
    }
  }

  // Trending strip — top 6 by score over the last 14 days of approved cases.
  const trendingCutoff = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: trendingPool } = await admin
    .from('cases')
    .select(CASE_SELECT)
    .eq('status', 'approved')
    .gte('created_at', trendingCutoff)
    .order('created_at', { ascending: false })
    .limit(200)
  const trendingScored = (trendingPool || []).map((r: any) => ({
    ...r,
    _score: trendingScore({ like_count: r.like_count || 0, view_count: r.view_count || 0, comment_count: r.comment_count || 0, created_at: r.created_at }),
  }))
  trendingScored.sort((a: any, b: any) => b._score - a._score)
  const trendingTop = trendingScored.slice(0, TRENDING_LIMIT)

  // Main grid query.
  let q = admin.from('cases')
    .select(CASE_SELECT)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (specialtyFilter) q = q.eq('specialty', specialtyFilter)
  if (complexityFilter) q = q.eq('complexity', complexityFilter)
  if (keyword) {
    const safe = keyword.replace(/[%,()]/g, ' ').trim()
    if (safe) q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,specialty.ilike.%${safe}%`)
  }
  const { data: rows } = await q

  // Thumbnails for trending + grid in one round-trip.
  const allIds = Array.from(new Set([
    ...trendingTop.map((r: any) => r.id as string),
    ...(rows || []).map((r: any) => r.id as string),
  ]))
  let photoRows: Array<{ case_id: string; url: string; kind: string }> = []
  if (allIds.length) {
    const { data: ph } = await admin
      .from('case_photos')
      .select('case_id, url, kind, display_order')
      .in('case_id', allIds)
      .order('display_order')
    photoRows = (ph || []) as any
  }
  const buildCard = (r: any): CaseCard => ({
    id: r.id, dentist_id: r.dentist_id ?? null,
    title: r.title, specialty: r.specialty, complexity: r.complexity,
    created_at: r.created_at, like_count: r.like_count || 0,
    comment_count: r.comment_count || 0, view_count: r.view_count || 0,
    dentists: r.dentists,
    thumb: pickThumb(photoRows, r.id),
  })
  const trendingCards = trendingTop.map(buildCard)
  const cards: CaseCard[] = (rows || []).map(buildCard)

  // All hrefs stay on /insights?tab=cases so the tab is preserved.
  function buildHref(opts: { s?: string | null; c?: number | null; q?: string | null }) {
    const u = new URLSearchParams()
    u.set('tab', 'cases')
    const finalS = opts.s !== undefined ? opts.s : specialtyFilter
    const finalC = opts.c !== undefined ? opts.c : complexityFilter
    const finalQ = opts.q !== undefined ? opts.q : (keyword || null)
    if (finalS) u.set('s', finalS)
    if (finalC) u.set('c', String(finalC))
    if (finalQ) u.set('q', finalQ)
    return `/insights?${u.toString()}`
  }

  const showTrending = !keyword && !specialtyFilter && !complexityFilter && trendingCards.length > 0
  const signedIn = !!user?.email

  return (
    <>
      {viewerDentistId && (
        <div style={{ marginBottom: 16 }}>
          <Link href="/cases/saved" style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700, textDecoration: 'none', marginRight: 16 }}>★ My saved →</Link>
          <Link href="/cases/new" style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>+ Post a case →</Link>
        </div>
      )}

      {/* Search — server-rendered GET form back to /insights, preserving tab
          + active filters via hidden inputs (no client state needed). */}
      <form method="get" action="/insights" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="hidden" name="tab" value="cases" />
        {specialtyFilter && <input type="hidden" name="s" value={specialtyFilter} />}
        {complexityFilter && <input type="hidden" name="c" value={String(complexityFilter)} />}
        <input
          type="search"
          name="q"
          defaultValue={keyword}
          placeholder="Search cases by title, description, specialty…"
          style={{ flex: 1, minWidth: 240, padding: '10px 14px', minHeight: 40, borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff', color: '#0F1923' }}
        />
        <button type="submit" style={{ padding: '10px 16px', minHeight: 40, background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          Search
        </button>
        {keyword && (
          <Link href={buildHref({ q: null })} style={{ padding: '10px 14px', minHeight: 40, background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Clear
          </Link>
        )}
      </form>

      {/* Specialty + complexity filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 6 }}>Specialty</span>
        <Pill href={buildHref({ s: null })} active={!specialtyFilter}>All</Pill>
        {SPECIALTIES.map(s => (
          <Pill key={s.slug} href={buildHref({ s: s.slug })} active={specialtyFilter === s.slug} bg={s.bg} color={s.color}>
            {s.label}
          </Pill>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 6 }}>Complexity</span>
        <Pill href={buildHref({ c: null })} active={!complexityFilter}>Any</Pill>
        {[1, 2, 3, 4, 5].map(n => (
          <Pill key={n} href={buildHref({ c: n })} active={complexityFilter === n}>
            {'★'.repeat(n)}
          </Pill>
        ))}
      </div>

      {/* Trending — only on the unfiltered default view. */}
      {showTrending && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923' }}>🔥 Trending this week</h2>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>Last {TRENDING_WINDOW_DAYS} days</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {trendingCards.map(c => <CaseCardView key={c.id} c={c} saved={savedSet.has(c.id)} signedIn={signedIn} />)}
          </div>
        </section>
      )}

      {cards.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 48, textAlign: 'center', color: '#64748B' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🦷</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0F1923', marginBottom: 6 }}>No cases match these filters yet.</p>
          <p style={{ fontSize: 13 }}>
            <Link href="/insights?tab=cases" style={{ color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>Clear filters →</Link>
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {cards.map(c => <CaseCardView key={c.id} c={c} saved={savedSet.has(c.id)} signedIn={signedIn} />)}
        </div>
      )}
    </>
  )
}

function CaseCardView({ c, saved, signedIn }: { c: CaseCard; saved: boolean; signedIn: boolean }) {
  const spec = getSpecialty(c.specialty)
  const initials = c.dentists?.name?.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'D'
  return (
    <div style={{ position: 'relative', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)', display: 'flex', flexDirection: 'column' }}>
      <Link href={`/cases/${c.id}`} style={{ textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#F1F5F9', overflow: 'hidden' }}>
          {c.thumb
            ? <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 32 }}>🦷</div>}
        </div>
        <div style={{ padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {spec && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', background: spec.bg, color: spec.color, borderRadius: 999 }}>{spec.label}</span>}
            <span style={{ fontSize: 11, color: '#F59E0B' }}>
              {'★'.repeat(c.complexity)}<span style={{ color: '#CBD5E1' }}>{'★'.repeat(5 - c.complexity)}</span>
            </span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: '#0F1923' }}>{c.title}</h3>
        </div>
      </Link>
      {c.dentists && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 14px', marginTop: 'auto' }}>
          <Link
            href={`/professional/${c.dentists.slug}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#0F1923', minWidth: 0, flex: 1 }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {c.dentists.profile_photo
                ? <img src={c.dentists.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
            <div style={{ minWidth: 0, lineHeight: 1.25 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dr. {c.dentists.name}</div>
              {c.dentists.city && <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.dentists.city}</div>}
            </div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>
            {c.like_count > 0 && <span title="Likes">♥ {c.like_count}</span>}
            {c.comment_count > 0 && <span title="Comments">💬 {c.comment_count}</span>}
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <SaveButton caseId={c.id} initialSaved={saved} signedIn={signedIn} compact nextHref={`/cases/${c.id}`} />
        <ShareButton
          caseId={c.id}
          caseTitle={c.title}
          dentistName={c.dentists?.name || 'a verified dentist'}
          dentistId={c.dentist_id}
          compact
        />
      </div>
    </div>
  )
}

function Pill({ href, active, children, bg, color }: { href: string; active: boolean; children: React.ReactNode; bg?: string; color?: string }) {
  return (
    <Link href={href} style={{
      padding: '6px 12px', minHeight: 30,
      borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: active ? (color || '#1D4ED8') : (bg || '#fff'),
      color: active ? '#fff' : (color || '#475569'),
      border: `1px solid ${active ? (color || '#1D4ED8') : '#E2E8F0'}`,
      textDecoration: 'none',
      display: 'inline-flex', alignItems: 'center',
    }}>{children}</Link>
  )
}
