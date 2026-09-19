import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  isNationalHost,
  cityOrigin,
  CITY_CONFIGS,
  NATIONAL_ORIGIN,
  type CityConfig,
  type CitySlug,
} from '@/config/cities'
import NationalShell from '@/components/national/NationalShell'
import { getNationalArticles, type ArticleCard } from '@/lib/publicArticles'
import { TOPIC_TYPES, topicLabel, topicBadge, isTopicType } from '@/lib/articles'
import { NAVY, TEAL_DARK, normalizeDrName, initialsFrom } from '@/app/dentist/[slug]/profileTheme'

// /insights — the "Dental Insights" hub for the national parent
// (dentistinindia.in): patient-education articles aggregated across every
// city. City domains have their own hub, so they bounce to /articles.
//
// This used to carry a second "Clinical Cases" tab lifted from /cases. That
// went with the social-layer freeze — the hub is articles-only now, and
// ?tab=cases redirects here rather than 404ing, since the tab URL was linked
// from the footer and from next.config's /cases redirect.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dental Insights — Expert Articles from Verified Dentists | DentistIn India',
  description: 'Patient education articles written by verified dentists across India.',
  alternates: { canonical: `${NATIONAL_ORIGIN}/insights` },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
}

interface Props {
  searchParams: Promise<{ tab?: string; topic?: string; city?: string }>
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
  // ?tab=cases was the clinical-cases tab. It's gone, but the URL is still
  // out there (anything a dentist bookmarked, plus older external links), so
  // collapse it onto the bare hub instead of rendering an empty tab. A bare
  // ?tab=articles is simply ignored — it's the only thing left to render.
  if (sp.tab === 'cases') redirect('/insights')
  const content = await renderArticles(sp)

  return (
    <NationalShell badge="Dental Insights">
      <main style={{ background: '#fff', padding: '40px 20px 64px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: NAVY, lineHeight: 1.2 }}>
              Dental Insights from Verified Dentists Across India
            </h1>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8, maxWidth: 660 }}>
              Patient education articles — written by verified Indian dentists
            </p>
          </div>

          {content}
        </div>
      </main>
    </NationalShell>
  )
}

// ── Tab 1: Expert Articles ─────────────────────────────────────────────────

function articlesHref(topic?: string, city?: string): string {
  // No `tab` param any more — the hub is articles-only, and emitting
  // ?tab=articles here would collide with the ?tab= redirect above.
  const u = new URLSearchParams()
  if (city) u.set('city', city)
  if (topic) u.set('topic', topic)
  const qs = u.toString()
  return qs ? `/insights?${qs}` : '/insights'
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
