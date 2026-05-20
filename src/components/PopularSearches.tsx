import Link from 'next/link'
import { CITY_POPULAR_SEARCHES } from '@/config/cityPopularSearches'
import type { CitySlug } from '@/config/cities'

// Long-tail SEO block. The H3 anchor text deliberately repeats the
// city + treatment / area words we want to rank for. If a city has
// no entries in CITY_POPULAR_SEARCHES yet, the section renders nothing
// — better an empty render than a section titled "Popular Searches"
// with no items.

interface Props {
  citySlug: string | null | undefined
  cityName: string
}

export default function PopularSearches({ citySlug, cityName }: Props) {
  const items = citySlug ? CITY_POPULAR_SEARCHES[citySlug as CitySlug] : undefined
  if (!items || items.length === 0) return null

  return (
    <section style={{
      background: '#fff',
      borderTop: '1px solid #E2E8F0',
      padding: '40px 20px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 800,
          fontSize: 20,
          color: '#0F1923',
          marginBottom: 6,
        }}>
          Popular Searches in {cityName}
        </h2>
        <p style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>
          Common dental searches from patients across {cityName}.
        </p>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
        }}>
          {items.map(s => (
            // H3 isn't semantically right for a chip, but the user asked
            // for "H3 links" to boost keyword density. Wrap a Link in
            // an h3 so the anchor text is what crawlers index while the
            // visible UI stays chip-like.
            <h3 key={s.href + s.text} style={{ margin: 0 }}>
              <Link
                href={s.href}
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0F1923',
                  textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {s.text}
              </Link>
            </h3>
          ))}
        </div>
      </div>
    </section>
  )
}
