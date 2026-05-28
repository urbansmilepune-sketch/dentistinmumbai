import { CITY_CONFIGS, NATIONAL_ORIGIN, type CitySlug } from '@/config/cities'

// Cross-city link block rendered near the bottom of every city homepage
// and dentist profile page. Two reasons it exists:
//   1. SEO — dofollow links between the city-domain peers strengthens
//      each domain's authority for "dentist in <city>" search intent
//      and tells crawlers that the network is interconnected.
//   2. Navigation — patients who land on the wrong city via a Google
//      result can hop to their actual city in one click.
//
// Derives the list from CITY_CONFIGS so adding a new city to the
// network automatically surfaces it everywhere this component renders.
// Server component — there's nothing here that needs to run on the
// client.

interface Props {
  /** City slug whose homepage / dentist profile is rendering this.
   *  Filtered out of the list so we don't link a city to itself. */
  currentSlug: string | null | undefined
}

export default function CitiesFooterLinks({ currentSlug }: Props) {
  // Thane and Navi Mumbai redirect to Mumbai at the domain level (see
  // next.config.ts), so showing them as separate cities here would be a
  // dead-end click.
  const consolidatedIntoMumbai: CitySlug[] = ['thane', 'navimumbai']
  const others = (Object.values(CITY_CONFIGS) as Array<typeof CITY_CONFIGS[CitySlug]>)
    .filter(c => c.citySlug !== currentSlug)
    .filter(c => !consolidatedIntoMumbai.includes(c.citySlug))

  return (
    <section style={{
      background: '#F8FAFC',
      borderTop: '1px solid #E2E8F0',
      padding: '48px 20px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 800,
          fontSize: 22,
          color: '#0F1923',
          marginBottom: 8,
        }}>
          Find Dentists in Other Cities
        </h2>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
          DentistIn covers major cities across India. Find verified dentists near you.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {others.map(city => (
            <a
              key={city.citySlug}
              href={`https://${city.domain}`}
              style={{
                display: 'block',
                padding: '12px 16px',
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                textDecoration: 'none',
                color: '#0F1923',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              🦷 Dentist in {city.cityName}
            </a>
          ))}
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a
            href={NATIONAL_ORIGIN}
            style={{
              fontSize: 13,
              color: '#0057A8',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            View India&apos;s Complete Dental Network →
          </a>
        </div>
      </div>
    </section>
  )
}
