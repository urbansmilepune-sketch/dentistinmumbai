// Shared site header for the public, patient-facing pages (home, area,
// treatment, area+treatment, profile). Replaces the per-page inline <nav> that
// every one of those pages used to duplicate — so the search bar appears
// everywhere from one place. Server component: it's just links + the
// HeaderSearch client island.
//
// Logo is the city's real SVG/webp brand mark (city.logoPath) — the city name
// is baked into the artwork, so it's the actual brand and must not be swapped
// for a generic wordmark. Pages already resolve `city` from the x-city-slug
// header, so they pass it straight in.

import Link from 'next/link'
import { type CityConfig } from '@/config/cities'
import HeaderSearch from './HeaderSearch'

interface Props {
  city: CityConfig
  /** Pre-fills the search box — passed by /search so the header mirrors ?q=. */
  initialQuery?: string
}

export default function SiteHeader({ city, initialQuery }: Props) {
  return (
    <header className="sh-header">
      <div className="sh-inner container">
        <Link href="/" className="sh-brand" aria-label={`${city.domain} home`}>
          <img className="sh-logo" src={city.logoPath} alt={city.domain} />
        </Link>

        <div className="sh-search">
          <HeaderSearch initialQuery={initialQuery} />
        </div>

        <div className="sh-actions">
          <Link href="/dentists" className="sh-find">Find dentists</Link>
          <Link href="/for-dentists/register" className="sh-list btn btn-primary btn-sm">List your clinic</Link>
        </div>
      </div>

      <style>{`
        .sh-header {
          background: #fff;
          border-bottom: 1px solid var(--border);
          position: sticky; top: 0; z-index: 100;
        }
        .sh-inner {
          display: flex; align-items: center; gap: 16px;
          height: 68px;
        }
        .sh-brand {
          display: flex; align-items: center;
          flex-shrink: 0; text-decoration: none;
        }
        .sh-logo { height: 44px; width: auto; display: block; }
        .sh-search { flex: 1; min-width: 0; max-width: 560px; }
        .sh-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .sh-find { padding: 8px 16px; font-weight: 500; font-size: 14px; color: var(--text-secondary); white-space: nowrap; }

        /* Tablet/mobile: logo + actions on row 1, full-width search on row 2.
           The search bar stays visible — it's the whole point of the header. */
        @media (max-width: 768px) {
          .sh-inner {
            flex-wrap: wrap;
            height: auto;
            padding-top: 10px; padding-bottom: 10px;
            gap: 10px;
          }
          .sh-brand { order: 1; }
          .sh-actions { order: 2; margin-left: auto; }
          .sh-search { order: 3; flex-basis: 100%; max-width: none; }
          .sh-find { display: none; }
        }
        /* Narrowest phones: shrink the logo a touch so the List button fits. */
        @media (max-width: 400px) {
          .sh-logo { height: 38px; }
        }
      `}</style>
    </header>
  )
}
