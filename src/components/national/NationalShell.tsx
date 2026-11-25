import Link from 'next/link'
import BrandLogo from './BrandLogo'

// Shared header + footer for the dentistinindia.in dentist network.
//
// v1 (Nov 2026): the national site is the dentists' own platform again,
// so the header carries the four network sections. It deliberately does
// not read auth (no per-render cookie read on every national page); the
// "For dentists" link goes to /claim, which handles signed-in and
// signed-out visitors itself.
//
// Booking never happens here: patient actions link out to the dentist's
// city site.

interface Props {
  /** Optional pill next to the logo naming the current section. */
  badge?: string
  children: React.ReactNode
}

const NAV = [
  { href: '/cases', label: 'Cases' },
  { href: '/events', label: 'Events' },
  { href: '/experts', label: 'Find an expert' },
]

export default function NationalShell({ badge, children }: Props) {
  return (
    <div style={{ background: '#F8FAFC', color: '#0F1923', fontFamily: 'var(--font-body)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '10px 16px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#0F1923', textDecoration: 'none', minHeight: 44 }}>
            <BrandLogo height={36} />
            {badge && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {badge}
              </span>
            )}
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {NAV.map(n => (
              <Link key={n.href} href={n.href} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 10px', fontSize: 14, fontWeight: 600, color: '#334155', textDecoration: 'none' }}>
                {n.label}
              </Link>
            ))}
            <Link href="/claim" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', marginLeft: 4, borderRadius: 8, background: '#1D4ED8', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              For dentists
            </Link>
          </div>
        </div>
      </nav>

      <div style={{ flex: 1 }}>{children}</div>

      <footer style={{ background: '#0F1923', color: '#94A3B8', padding: '24px 16px', fontSize: 13 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {NAV.map(n => (
              <Link key={n.href} href={n.href} style={{ color: '#CBD5E1', textDecoration: 'none', fontWeight: 600 }}>{n.label}</Link>
            ))}
            <Link href="/cities" style={{ color: '#CBD5E1', textDecoration: 'none', fontWeight: 600 }}>All cities</Link>
          </div>
          <div>© {new Date().getFullYear()} DentistIn. Book appointments on your city&apos;s DentistIn site.</div>
        </div>
      </footer>
    </div>
  )
}
