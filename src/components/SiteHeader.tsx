// Shared site header for the public, patient-facing pages (home, area,
// treatment, area+treatment, profile). One row on every screen size:
//   desktop: logo · [search] · Find a dentist · Expert Advice · Log in ▾ | List your clinic
//   phone:   logo · Log in · menu   (search, when shown, sits on a second row)
// "Log in" opens a patient-or-dentist chooser (HeaderMenus, a client island).
//
// Logo is the city's real brand artwork (city.logoPath) — the city name is
// baked in, so it must not be swapped for a generic wordmark. Every
// public/logo-*.webp is 252×168 with the mark inside the same box
// (x 32–222, y 62–108) and empty space around it, so .sh-logo-box crops to
// that box. Without the crop the mark showed at about 13px tall.

import Link from 'next/link'
import { type CityConfig } from '@/config/cities'
import HeaderSearch from './HeaderSearch'
import HeaderMenus from './HeaderMenus'

interface Props {
  city: CityConfig
  /** Pre-fills the search box — passed by /search so the header mirrors ?q=. */
  initialQuery?: string
  /** Homepage only: its hero carries the search box, so the header skips it. */
  hideSearch?: boolean
}

export default function SiteHeader({ city, initialQuery, hideSearch = false }: Props) {
  return (
    <header className={`sh-header${hideSearch ? ' sh-nosearch' : ''}`}>
      <div className="sh-inner container">
        <Link href="/" className="sh-brand" aria-label={`${city.domain} home`}>
          <span className="sh-logo-box">
            <img className="sh-logo" src={city.logoPath} alt={city.domain} />
          </span>
        </Link>

        {!hideSearch && (
          <div className="sh-search">
            <HeaderSearch initialQuery={initialQuery} />
          </div>
        )}

        <nav className="sh-nav" aria-label="Main">
          <Link href="/dentists" className="sh-link">Find a dentist</Link>
          <Link href="/articles" className="sh-link">Expert Advice</Link>
        </nav>

        <div className="sh-actions">
          <HeaderMenus cityName={city.cityName} />
        </div>
      </div>

      <style>{`
        .sh-header {
          --sh-navy: #0F172A; --sh-grey: #64748B; --sh-line: #E2E8F0; --sh-tint: #F1F5F9;
          --sh-teal-bg: #CCFBF1; --sh-teal-ink: #0F766E;
          background: #fff;
          border-bottom: 1px solid var(--sh-line);
          position: sticky; top: 0; z-index: 100;
        }
        .sh-inner { display: flex; align-items: center; gap: 24px; height: 68px; }

        /* Logo crop: --lh is the visible mark height; the rest scales from it. */
        .sh-brand { display: flex; align-items: center; flex-shrink: 0; text-decoration: none; }
        .sh-logo-box {
          --lh: 34px;
          display: block; overflow: hidden;
          height: var(--lh); width: calc(var(--lh) * 190 / 46);
        }
        .sh-logo {
          display: block; max-width: none; width: auto;
          height: calc(var(--lh) * 168 / 46);
          margin-left: calc(var(--lh) * -32 / 46);
          margin-top: calc(var(--lh) * -62 / 46);
        }

        .sh-search { flex: 1; min-width: 0; max-width: 560px; }
        .sh-nav { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .sh-nosearch .sh-nav { margin-right: auto; }
        .sh-link {
          padding: 8px 12px; border-radius: 8px;
          font-size: 14.5px; font-weight: 500; color: var(--sh-grey);
          text-decoration: none; white-space: nowrap;
        }
        .sh-link:hover { color: var(--sh-navy); background: var(--sh-tint); }
        .sh-actions { display: flex; align-items: center; flex-shrink: 0; margin-left: auto; }
        .sh-nosearch .sh-actions { margin-left: 0; }

        .hm-wrap { position: relative; display: flex; align-items: center; gap: 10px; }
        .hm-login {
          display: inline-flex; align-items: center; gap: 8px;
          height: 40px; padding: 0 12px 0 12px; border-radius: 10px;
          border: 1px solid var(--sh-line); background: #fff; cursor: pointer;
          font-family: inherit; font-weight: 600; font-size: 14.5px; color: var(--sh-navy);
          white-space: nowrap;
        }
        .hm-login:hover, .hm-login[aria-expanded="true"] { background: var(--sh-tint); border-color: #CBD5E1; }
        .hm-caret { transition: transform .15s; }
        .hm-login[aria-expanded="true"] .hm-caret { transform: rotate(180deg); }
        .hm-sep { width: 1px; height: 22px; background: var(--sh-line); }
        .hm-cta {
          display: inline-flex; align-items: center; justify-content: center;
          height: 40px; padding: 0 16px; border-radius: 10px;
          background: var(--sh-navy); color: #fff !important;
          font-weight: 600; font-size: 14.5px; text-decoration: none; white-space: nowrap;
        }
        .hm-cta:hover { background: #1E293B; }
        .hm-burger {
          display: none; width: 40px; height: 40px; border-radius: 10px;
          border: 1px solid var(--sh-line); background: #fff; color: var(--sh-navy);
          align-items: center; justify-content: center; cursor: pointer; padding: 0;
        }
        .hm-login:focus-visible, .hm-burger:focus-visible, .hm-cta:focus-visible, .sh-link:focus-visible, .hm-opt:focus-visible {
          outline: 2px solid #14B8A6; outline-offset: 2px;
        }

        /* Desktop chooser: dropdown under the Log in button. */
        .hm-scrim { position: fixed; inset: 0; z-index: 1; background: transparent; }
        .hm-pop {
          position: absolute; top: calc(100% + 10px); left: 0; z-index: 2;
          width: 300px; background: #fff; border: 1px solid var(--sh-line); border-radius: 14px;
          box-shadow: 0 18px 40px rgba(15,23,42,.14); padding: 6px;
        }
        .hm-grab, .hm-title, .hm-pop-menu { display: none; }
        .hm-opt {
          display: flex; gap: 12px; align-items: flex-start;
          padding: 11px 12px; border-radius: 10px; text-decoration: none; color: var(--sh-navy);
        }
        .hm-opt:hover { background: var(--sh-tint); }
        .hm-opt b { display: block; font-size: 14.5px; font-weight: 600; color: var(--sh-navy); }
        .hm-opt small { display: block; font-size: 12.5px; color: var(--sh-grey); line-height: 1.4; }
        .hm-ico { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex: none; }
        .hm-ico-p { background: var(--sh-teal-bg); color: var(--sh-teal-ink); }
        .hm-ico-d { background: var(--sh-line); color: var(--sh-navy); }

        /* Tablet: drop the text links so search keeps its room. */
        @media (max-width: 1100px) {
          .sh-header:not(.sh-nosearch) .sh-nav { display: none; }
        }

        /* Phones and small tablets: logo · Log in · menu on one row; the
           chooser and the menu slide up from the bottom of the screen. */
        @media (max-width: 900px) {
          .sh-inner { flex-wrap: wrap; height: auto; min-height: 60px; gap: 10px; padding-top: 10px; padding-bottom: 10px; }
          .sh-logo-box { --lh: 27px; }
          .sh-nav, .hm-sep, .hm-cta-desk { display: none; }
          .sh-actions { margin-left: auto; }
          .sh-nosearch .sh-actions { margin-left: auto; }
          .sh-search { order: 3; flex-basis: 100%; max-width: none; }
          .hm-wrap { gap: 6px; position: static; }
          .hm-login { height: 38px; padding: 0 12px 0 10px; gap: 6px; font-size: 14px; }
          .hm-caret { display: none; }
          .hm-burger { display: inline-flex; width: 38px; height: 38px; }

          .hm-scrim { background: rgba(15,23,42,.45); z-index: 200; }
          .hm-pop, .hm-pop-menu {
            display: block; position: fixed; top: auto; left: 0; right: 0; bottom: 0; z-index: 201;
            width: auto; border: 0; border-radius: 20px 20px 0 0;
            padding: 10px 16px calc(18px + env(safe-area-inset-bottom, 0px));
            box-shadow: 0 -10px 30px rgba(15,23,42,.18);
          }
          .hm-grab { display: block; width: 40px; height: 4px; border-radius: 4px; background: #CBD5E1; margin: 0 auto 12px; }
          .hm-title { display: block; margin: 0 4px 10px; font-family: var(--font-heading); font-weight: 700; font-size: 16px; color: var(--sh-navy); }
          .hm-pop .hm-opt { border: 1px solid var(--sh-line); margin-bottom: 8px; padding: 13px 12px; }
          .hm-links { display: flex; flex-direction: column; }
          .hm-links a {
            display: flex; justify-content: space-between; align-items: center;
            padding: 14px 6px; border-bottom: 1px solid var(--sh-line);
            color: var(--sh-navy); font-weight: 600; font-size: 15px; text-decoration: none;
          }
          .hm-dent { margin-top: 14px; background: var(--sh-tint); border-radius: 14px; padding: 14px; }
          .hm-dent b { display: block; color: var(--sh-navy); font-size: 15px; }
          .hm-dent small { display: block; color: var(--sh-grey); font-size: 13px; margin: 2px 0 10px; }
          .hm-dent .hm-cta { width: 100%; height: 44px; }
        }
        @media (max-width: 360px) {
          .sh-logo-box { --lh: 23px; }
        }
      `}</style>
    </header>
  )
}
