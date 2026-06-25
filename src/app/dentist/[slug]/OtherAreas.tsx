// Footer block on the dentist profile — "Other areas in <City>". Replaces the
// cross-city CitiesFooterLinks here: a patient viewing a Wakad dentist wants
// other AREAS in their own city (Pune), each linking to /area/[slug], not a
// hop to a different city. Presentational server component; the page fetches
// the ranked area list (getCityAreas) and passes it in.

import Link from 'next/link'
import { NAVY, TEAL } from './profileTheme'
import { MapPinIcon } from './profileIcons'

interface AreaLink { id: string | number; name: string; slug: string; dentist_count: number }

interface Props {
  areas: AreaLink[]
  cityName: string
  /** Current area's slug, filtered out so we don't link the page to itself. */
  currentAreaSlug?: string
  /** How many areas to surface. */
  limit?: number
}

export default function OtherAreas({ areas, cityName, currentAreaSlug, limit = 8 }: Props) {
  const others = areas
    .filter(a => a.slug && a.slug !== currentAreaSlug)
    .slice(0, limit)

  if (others.length === 0) return null

  return (
    <section style={{ background: '#F8FAFC', borderTop: '1px solid var(--border)', padding: '40px 0' }}>
      <div className="container">
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: NAVY, marginBottom: 6 }}>
          Other areas in {cityName}
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 18 }}>
          Browse verified dentists across {cityName}.
        </p>
        <div className="profile-areas-grid">
          {others.map(a => (
            <Link key={a.slug} href={`/area/${a.slug}`} className="profile-area-chip">
              <MapPinIcon size={15} color={TEAL} style={{ flexShrink: 0 }} />
              <span className="profile-area-name">{a.name}</span>
              {a.dentist_count > 0 && <span className="profile-area-count">{a.dentist_count}</span>}
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        .profile-areas-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .profile-area-chip {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 14px;
          background: #fff; border: 1px solid var(--border); border-radius: 10px;
          text-decoration: none; color: ${NAVY};
          font-size: 14px; font-weight: 600;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .profile-area-chip:hover {
          border-color: ${TEAL};
          box-shadow: 0 2px 8px rgba(20,184,166,0.12);
          transform: translateY(-1px);
        }
        .profile-area-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .profile-area-count {
          flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--muted);
          background: var(--bg); border-radius: 999px; padding: 2px 8px;
        }
        @media (min-width: 769px) {
          .profile-areas-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>
    </section>
  )
}
