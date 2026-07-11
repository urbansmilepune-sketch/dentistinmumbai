import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import { getPublicArticle } from '@/lib/publicArticles'
import { sanitizeArticleHtml, articleDescription, topicLabel } from '@/lib/articles'
import { normalizeDrName, NAVY, TEAL } from '../../profileTheme'

interface Props { params: Promise<{ slug: string; articleSlug: string }> }

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, articleSlug } = await params
  const result = await getPublicArticle(slug, articleSlug)
  if (!result) return {}
  const { dentist, article } = result

  const city = getCityBySlug(dentist.city)
  const drName = normalizeDrName(dentist.name)
  const areaName = dentist.areas?.name || city.cityName
  const clinic = dentist.clinic_name || 'Dental Clinic'

  const title = `${article.title} | ${drName}, ${clinic}, ${areaName}`
  const description = articleDescription(article.content, 155)
  const url = `${cityOrigin(city)}/dentist/${slug}/articles/${articleSlug}`

  // The page only renders for a published article (notFound otherwise), so
  // index/follow is always correct here.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      ...(dentist.profile_photo ? { images: [{ url: dentist.profile_photo }] } : {}),
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug, articleSlug } = await params
  const result = await getPublicArticle(slug, articleSlug)
  if (!result) notFound()
  const { dentist, article, related } = result

  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug') || dentist.city)
  const drName = normalizeDrName(dentist.name)
  const areaName = dentist.areas?.name || city.cityName
  const safeHtml = sanitizeArticleHtml(article.content)
  const profileUrl = `/dentist/${dentist.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    author: {
      '@type': 'Person',
      name: drName,
      worksFor: { '@type': 'Dentist', name: dentist.clinic_name || drName },
    },
    publisher: { '@type': 'Organization', name: 'DentistIn' },
    datePublished: article.published_at || article.created_at,
    dateModified: article.updated_at || article.published_at || article.created_at,
  }

  const initials = (dentist.name || 'D').split(' ').map(n => n[0]).join('').slice(0, 2)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader city={city} />

      <main style={{ background: 'var(--bg)', minHeight: '100vh', padding: '32px 0 60px' }}>
        <article style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>
          {/* Breadcrumb back to profile */}
          <Link href={profileUrl} style={{ fontSize: 13, color: TEAL, textDecoration: 'none', fontWeight: 600 }}>
            ← {drName}
          </Link>

          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: '18px 0 8px' }}>
            {topicLabel(article.topic_type)}
          </div>

          {/* H1 */}
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, lineHeight: 1.25, color: NAVY }}>
            {article.title}
          </h1>

          {/* Author block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 4px' }}>
            <Link href={profileUrl} style={{ textDecoration: 'none' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--blue)', overflow: 'hidden', flexShrink: 0 }}>
                {dentist.profile_photo ? <img src={dentist.profile_photo} alt={drName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
              </div>
            </Link>
            <div>
              <div style={{ fontSize: 14 }}>
                By <Link href={profileUrl} style={{ color: NAVY, fontWeight: 700, textDecoration: 'none' }}>{drName}</Link>
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

          {/* CTA */}
          <div style={{ marginTop: 36, padding: 24, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Have a question about this? {drName} can help.
            </p>
            <a
              href={`/book/${dentist.slug}`}
              rel="nofollow"
              style={{ display: 'inline-block', padding: '13px 26px', background: TEAL, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
            >
              Book a consultation with {drName} →
            </a>
          </div>

          {/* Related articles from the same dentist */}
          {related.length > 0 && (
            <section style={{ marginTop: 40 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, color: NAVY, marginBottom: 14 }}>
                More from {drName}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {related.map(r => (
                  <Link
                    key={r.slug}
                    href={`/dentist/${dentist.slug}/articles/${r.slug}`}
                    style={{ display: 'block', padding: '14px 16px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, textDecoration: 'none' }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{topicLabel(r.topic_type)}</div>
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

      <footer style={{ background: '#0A1628', padding: '24px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} DentistIn. All rights reserved.</p>
      </footer>
    </>
  )
}
