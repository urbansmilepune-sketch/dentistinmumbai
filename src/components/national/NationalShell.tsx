import Link from 'next/link'
import BrandLogo from './BrandLogo'

// Shared header + footer for the secondary national pages (every national
// surface except / and /cities, which have their own inline chrome).
//
// Stripped back to match the holding-page homepage: brand mark plus a single
// "All cities" link, and a one-line footer. No sign-in, no claim-profile, no
// case-discussion link, no vendor link — dentistinindia.in isn't being
// promoted as a platform right now, so its chrome shouldn't advertise one.
//
// The pages this wraps (/join, /insights, /professional/[slug],
// /dental-tourism, /cases/[id], /vendors, /about, /articles) are all
// untouched and still fully functional — they're simply reachable by direct
// link rather than by navigation from here.
//
// NOTE: this no longer reads auth. The previous version called
// supabase.auth.getUser() on every render to decide between "My profile /
// Sign out" and "Sign in / Claim your profile". With the nav gone there's
// nothing auth-dependent left, so that per-render cookie read + JWT validate
// is gone from every national page. The side effect is that signed-in
// dentists lose the Sign out control on these pages; the practice dashboard
// has its own shell and its own sign-out, so it isn't orphaned.

interface Props {
  /** Toggles a coloured pill in the right side of the header so the
   *  user knows they're inside a sub-flow (e.g. "Dental Tourism"). */
  badge?: string
  children: React.ReactNode
}

export default function NationalShell({ badge, children }: Props) {
  return (
    <div style={{ background: '#fff', color: '#0F1923', fontFamily: 'var(--font-body)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#0F1923', textDecoration: 'none' }}>
            <BrandLogo height={32} />
            {badge && (
              <span style={{ marginLeft: 6, fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, padding: '3px 8px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {badge}
              </span>
            )}
          </Link>
          <Link href="/cities" style={{ fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
            All cities
          </Link>
        </div>
      </nav>

      <div style={{ flex: 1 }}>{children}</div>

      <footer style={{ background: '#0F1923', color: '#64748B', padding: '20px', textAlign: 'center', fontSize: 12 }}>
        <Link href="/cities" style={{ color: '#94A3B8', textDecoration: 'none', fontWeight: 600 }}>All cities</Link>
        <span style={{ margin: '0 10px', color: '#334155' }}>|</span>
        © {new Date().getFullYear()} DentistIn. All rights reserved.
      </footer>
    </div>
  )
}
