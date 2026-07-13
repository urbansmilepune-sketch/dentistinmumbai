import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getCityBySlug,
  cityOrigin,
  cityBrandName,
  CITY_CONFIGS,
  type CityConfig,
} from '@/config/cities'
import NationalShell from '@/components/national/NationalShell'
import { getArticleByNationalUrl } from '@/lib/publicArticles'
import { sanitizeArticleHtml, articleDescription, topicLabel } from '@/lib/articles'
import { normalizeDrName, initialsFrom, NAVY, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'

// National mirror of the city-domain article page. It renders the SAME article
// content, but its canonical always points at the city domain — Google
// consolidates this URL to the city original, so the city domain keeps the
// ranking authority while the national parent still earns a crawlable,
// cross-linked surface (a dofollow backlink into the dentist's city profile).
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ city: string; slug: string }>
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function validCity(slug: string): CityConfig | null {
  return (CITY_CONFIGS as Record<string, CityConfig>)[slug] ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug, slug } = await params
  const city = validCity(citySlug)
  if (!city) return {}
  const result = await getArticleByNationalUrl(citySlug, slug)
  if (!result) return {}
  const { dentist, article } = result

  const drName = normalizeDrName(dentist.name)
  const areaName = dentist.areas?.name || city.cityName
  const clinic = dentist.clinic_name || 'Dental Clinic'
  // Canonical is the CITY domain URL — the article's true home.
  const canonical = `${cityOrigin(city)}/dentist/${dentist.slug}/articles/${article.slug}`

  return {
    title: `${article.title} | ${drName}, ${clinic}, ${areaName}`,
    description: articleDescription(article.content, 155),
    alternates: { canonical },
    openGraph: {
      title: article.title,
      description: articleDescription(article.content, 155),
      url: canonical,
      type: 'article',
      ...(dentist.profile_photo ? { images: [{ url: dentist.profile_photo }] } : {}),
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export default async function NationalArticlePage({ params }: Props) {
  const { city: citySlug, slug } = await params
  const city = validCity(citySlug)
  if (!city) notFound()
  const result = await getArticleByNationalUrl(citySlug, slug)
  if (!result) notFound()
  const { dentist, article, related } = result

  const drName = normalizeDrName(dentist.name)
  const areaName = dentist.areas?.name || city.cityName
  const brand = cityBrandName(city) // e.g. DentistInPune
  const safeHtml = sanitizeArticleHtml(article.content)

  const origin = cityOrigin(city)
  const canonical = `${origin}/dentist/${dentist.slug}/articles/${article.slug}`
  const cityProfileUrl = `${origin}/dentist/${dentist.slug}`
  const cityBookUrl = `${origin}/book/${dentist.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    mainEntityOfPage: canonical,
    author: {
      '@type': 'Person',
      name: drName,
      worksFor: { '@type': 'Dentist', name: dentist.clinic_name || drName },
    },
    publisher: { '@type': 'Organization', name: 'DentistIn' },
    datePublished: article.published_at || article.created_at,
    dateModified: article.updated_at || article.published_at || article.created_at,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NationalShell badge="Expert Advice">
        <main style={{ background: '#fff', padding: '28px 0 60px' }}>
          <article style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>
            {/* Originally-published banner → city domain canonical */}
            <a
              href={canonical}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: '#F8FAFC',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 13,
                color: '#475569',
                textDecoration: 'none',
                marginBottom: 20,
              }}
            >
              <span>
                Originally published on{' '}
                <strong style={{ color: NAVY }}>{brand}</strong> →
              </span>
            </a>

            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
              {topicLabel(article.topic_type)}
            </div>

            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, lineHeight: 1.25, color: NAVY }}>
              {article.title}
            </h1>

            {/* Author block — profile link crosses to the city domain */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 4px' }}>
              <a href={cityProfileUrl} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: 'var(--blue-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--blue)',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {dentist.profile_photo ? (
                    <img src={dentist.profile_photo} alt={drName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    initialsFrom(dentist.name)
                  )}
                </div>
              </a>
              <div>
                <div style={{ fontSize: 14 }}>
                  By{' '}
                  <a href={cityProfileUrl} style={{ color: NAVY, fontWeight: 700, textDecoration: 'none' }}>
                    {drName}
                  </a>
                  {dentist.qualifications ? <span style={{ color: 'var(--muted)' }}>, {dentist.qualifications}</span> : null}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>
                  {[dentist.clinic_name, areaName].filter(Boolean).join(' · ')}
                  {article.published_at ? ` · ${fmtDate(article.published_at)}` : ''}
                </div>
              </div>
            </div>

            {/* Content */}
            <div
              className="article-body"
              style={{ fontSize: 17, lineHeight: 1.8, color: 'var(--text)', marginTop: 24 }}
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />

            {/* Cross-domain credibility block — the SEO asset. Consistent NAP +
                a dofollow link back to the dentist's city-domain profile. */}
            <div style={{ marginTop: 36, padding: 24, background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 16 }}>
              <p style={{ fontSize: 15.5, color: NAVY, fontWeight: 700, marginBottom: 6 }}>
                {drName} practices at {dentist.clinic_name || 'their clinic'} in {areaName}, {city.cityName}
              </p>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Verified on {brand}
                {dentist.mci_number && String(dentist.mci_number).trim()
                  ? ` · MSDC/DCI Registration: ${dentist.mci_number}`
                  : ''}
              </p>
              <a href={cityProfileUrl} style={{ color: TEAL_DARK, fontWeight: 700, fontSize: 14.5, textDecoration: 'none' }}>
                View full profile on {brand} →
              </a>
            </div>

            {/* CTA — booking happens on the city domain */}
            <div style={{ marginTop: 20, padding: 24, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Have a question about this? {drName} can help.
              </p>
              <a
                href={cityBookUrl}
                rel="nofollow"
                style={{ display: 'inline-block', padding: '13px 26px', background: TEAL, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
              >
                Book a consultation with {drName} →
              </a>
            </div>

            {/* Related articles from the same dentist — stay on the national domain */}
            {related.length > 0 && (
              <section style={{ marginTop: 40 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, color: NAVY, marginBottom: 14 }}>
                  More from {drName}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {related.map(r => (
                    <Link
                      key={r.slug}
                      href={`/articles/${citySlug}/${r.slug}`}
                      style={{ display: 'block', padding: '14px 16px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, textDecoration: 'none' }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>
                        {topicLabel(r.topic_type)}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{r.title}</div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </article>
        </main>

        <style>{`
          .article-body p { margin: 0 0 18px; }
          .article-body ul, .article-body ol { margin: 0 0 18px; padding-left: 24px; }
          .article-body li { margin: 4px 0; }
          .article-body img { max-width: 100%; height: auto; border-radius: 12px; margin: 12px 0; }
          .article-body strong { font-weight: 700; }
        `}</style>
      </NationalShell>
    </>
  )
}
