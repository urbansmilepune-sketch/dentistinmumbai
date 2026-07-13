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
          <Link href="/articles" style={{ padding: '8px 12px', fontWeight: 600, fontSize: 14, color: 'var(--blue)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            Expert Advice
          </Link>
          <Link href="/for-dentists/login" className="sh-login">
            <span className="sh-login-pre">Dentist </span>Login
          </Link>
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
          display: flex; align-items: center; gap: 20px;
          height: 72px;
        }
        .sh-brand {
          display: flex; align-items: center;
          flex-shrink: 0; text-decoration: none;
        }
        .sh-logo { height: 52px; width: auto; display: block; }
        .sh-search { flex: 1; min-width: 0; max-width: 620px; }
        .sh-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: auto; }
        /* Returning-dentist door sign. Quiet blue text link — deliberately
           subordinate to the filled "List your clinic" acquisition button. */
        .sh-login { padding: 8px 12px; font-weight: 600; font-size: 14px; color: var(--blue); white-space: nowrap; }
        .sh-login:hover { text-decoration: underline; }

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
          .sh-actions { order: 2; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
          .sh-search { order: 3; flex-basis: 100%; max-width: none; }
          /* Keep Login visible on mobile (discoverability), but drop the
             "Dentist " prefix so it stays compact next to the button. */
          .sh-login-pre { display: none; }
          .sh-login { padding: 8px 6px; }
        }
        /* Narrowest phones: shrink the logo a touch so the List button fits. */
        @media (max-width: 400px) {
          .sh-logo { height: 38px; }
        }
      `}</style>
    </header>
  )
}
