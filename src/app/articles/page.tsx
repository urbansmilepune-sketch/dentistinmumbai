import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import {
  getCityBySlug,
  cityOrigin,
  cityBrandName,
  isNationalHost,
  CITY_CONFIGS,
  NATIONAL_ORIGIN,
  type CityConfig,
  type CitySlug,
} from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import NationalShell from '@/components/national/NationalShell'
import { getCityArticles, getNationalArticles, type ArticleCard } from '@/lib/publicArticles'
import { TOPIC_TYPES, topicLabel, topicBadge, isTopicType } from '@/lib/articles'
import { NAVY, TEAL_DARK, normalizeDrName, initialsFrom } from '@/app/dentist/[slug]/profileTheme'

// The hub renders per-host: dentistin<city>.in/articles gets the city variant,
// dentistinindia.in/articles gets the national aggregate. Both read the
// service-role-scoped published articles. headers()/searchParams force dynamic.
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ topic?: string; city?: string }>
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const national =
    h.get('x-is-national') === '1' || isNationalHost(h.get('x-forwarded-host') || h.get('host'))

  if (national) {
    return {
      title: 'Expert Dental Advice from Verified Dentists Across India | DentistIn India',
      description:
        'Patient education articles written by verified dentists across India. Root canal, implants, braces and more — in plain language.',
      alternates: { canonical: `${NATIONAL_ORIGIN}/articles` },
      robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    }
  }

  const city = getCityBySlug(h.get('x-city-slug'))
  const brand = cityBrandName(city)
  return {
    title: `Expert Dental Advice from Verified Dentists in ${city.cityName} | ${brand}`,
    description: `Patient education articles written by verified dentists in ${city.cityName}. Root canal, implants, braces and more — in plain language.`,
    alternates: { canonical: `${cityOrigin(city)}/articles` },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export default async function ArticlesHubPage({ searchParams }: Props) {
  const sp = await searchParams
  const h = await headers()
  const topic = isTopicType(sp.topic) ? sp.topic : undefined

  if (h.get('x-is-national') === '1') {
    return <NationalArticlesHub topic={topic} citySlug={sp.city} />
  }

  const city = getCityBySlug(h.get('x-city-slug'))
  const articles = await getCityArticles(city.citySlug, topic)
  return <CityArticlesHub city={city} articles={articles} activeTopic={topic} />
}

// ── Shared bits ────────────────────────────────────────────────────────────

function TopicTabs({
  active,
  cityParam,
}: {
  active?: string
  /** Preserved on the national hub so the topic tabs keep the ?city= filter. */
  cityParam?: string
}) {
  const mk = (t?: string) => {
    const params = new URLSearchParams()
    if (cityParam) params.set('city', cityParam)
    if (t) params.set('topic', t)
    const qs = params.toString()
    return qs ? `/articles?${qs}` : '/articles'
  }
  const tabs: { type?: string; label: string }[] = [
    { type: undefined, label: 'All' },
    ...TOPIC_TYPES.map(t => ({ type: t.type as string, label: t.label })),
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
      {tabs.map(t => {
        const isActive = (t.type ?? undefined) === (active ?? undefined)
        return (
          <Link
            key={t.label}
            href={mk(t.type)}
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
  )
}

function ArticleCardView({
  card,
  href,
  subtitle,
}: {
  card: ArticleCard
  href: string
  subtitle: string
}) {
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

function HubHeading({ h1, sub }: { h1: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: NAVY, lineHeight: 1.2 }}>
        {h1}
      </h1>
      <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8, maxWidth: 640 }}>{sub}</p>
    </div>
  )
}

// ── City variant ─────────────────────────────────────────────────────────

function CityArticlesHub({
  city,
  articles,
  activeTopic,
}: {
  city: CityConfig
  articles: ArticleCard[]
  activeTopic?: string
}) {
  return (
    <>
      <SiteHeader city={city} />
      <main style={{ background: 'var(--bg)', minHeight: '100vh', padding: '32px 0 60px' }}>
        <div className="container" style={{ maxWidth: 920 }}>
          <HubHeading
            h1={`Expert Dental Advice from ${city.cityName} Dentists`}
            sub="Articles written by verified dentists — in plain language patients can understand"
          />

          <TopicTabs active={activeTopic} />

          {articles.length > 0 ? (
            <div className="articles-grid">
              {articles.map(card => (
                <ArticleCardView
                  key={`${card.dentist.slug}/${card.slug}`}
                  card={card}
                  href={`/dentist/${card.dentist.slug}/articles/${card.slug}`}
                  subtitle={[card.dentist.clinic_name, card.dentist.areas?.name].filter(Boolean).join(' · ')}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              text={
                activeTopic
                  ? `No ${topicLabel(activeTopic).toLowerCase()} articles from ${city.cityName} dentists yet.`
                  : `No articles yet from ${city.cityName} dentists.`
              }
              ctaHref="/for-dentists"
              ctaLabel={`Be the first dentist in ${city.cityName} to share your expertise →`}
            />
          )}
        </div>
      </main>

      <footer style={{ background: '#0A1628', padding: '24px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain}. All rights reserved.</p>
      </footer>

      <GridStyles />
    </>
  )
}

// ── National variant ───────────────────────────────────────────────────────

async function NationalArticlesHub({ topic, citySlug }: { topic?: string; citySlug?: string }) {
  // Fetch every published article for the active topic across all cities, then
  // derive the city-filter tab list from what actually has articles and apply
  // the city filter in JS — one round trip instead of two.
  const all = await getNationalArticles(undefined, topic)

  const activeCity =
    citySlug && (CITY_CONFIGS as Record<string, CityConfig>)[citySlug] ? (citySlug as CitySlug) : undefined

  const citiesWithArticles = Array.from(new Set(all.map(a => a.dentist.city).filter(Boolean) as string[]))
    .map(slug => (CITY_CONFIGS as Record<string, CityConfig>)[slug])
    .filter(Boolean)
    .sort((a, b) => a.cityName.localeCompare(b.cityName))

  const shown = activeCity ? all.filter(a => a.dentist.city === activeCity) : all

  return (
    <NationalShell badge="Expert Advice">
      <main style={{ background: '#fff', padding: '40px 20px 64px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <HubHeading
            h1="Expert Dental Advice from Verified Dentists Across India"
            sub="Articles written by verified dentists — in plain language patients can understand"
          />

          {/* City filter — only cities that actually have published articles. */}
          {citiesWithArticles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <NationalCityChip label="All cities" topic={topic} target={undefined} active={!activeCity} />
              {citiesWithArticles.map(c => (
                <NationalCityChip
                  key={c.citySlug}
                  label={c.cityName}
                  topic={topic}
                  target={c.citySlug}
                  active={activeCity === c.citySlug}
                />
              ))}
            </div>
          )}

          <TopicTabs active={topic} cityParam={activeCity} />

          {shown.length > 0 ? (
            <div className="articles-grid">
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
            <EmptyState
              text="No published articles yet across the network."
              ctaHref="/for-dentists"
              ctaLabel="Are you a dentist? Share your expertise →"
            />
          )}
        </div>
      </main>
      <GridStyles />
    </NationalShell>
  )
}

function NationalCityChip({
  label,
  topic,
  target,
  active,
}: {
  label: string
  topic?: string
  target?: string
  active: boolean
}) {
  const params = new URLSearchParams()
  if (target) params.set('city', target)
  if (topic) params.set('topic', topic)
  const qs = params.toString()
  return (
    <Link
      href={qs ? `/articles?${qs}` : '/articles'}
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

function EmptyState({ text, ctaHref, ctaLabel }: { text: string; ctaHref: string; ctaLabel: string }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px dashed var(--border)',
        borderRadius: 16,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
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

// Two columns on desktop, one on mobile. Scoped element selector — no new
// utility classes (inline styles can't express the media query).
function GridStyles() {
  return (
    <style>{`
      .articles-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      @media (max-width: 768px) { .articles-grid { grid-template-columns: 1fr; } }
    `}</style>
  )
}
