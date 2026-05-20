import Link from 'next/link'

// Shared header + footer for the secondary national pages (/about,
// /dental-tourism, /for-dentists). NationalHome and /cities keep their
// own custom navs because their hero is part of the same visual block —
// they were shipped first and aren't worth re-touching for this PR.

interface Props {
  /** Used in the footer copyright line and OG/site context only. The
   *  visible page heading is rendered by the page itself, not this shell. */
  pageLabel?: string
  /** Toggles a coloured pill in the right side of the header so the
   *  user knows they're inside a sub-flow (e.g. "Dental Tourism"). */
  badge?: string
  children: React.ReactNode
}

export default function NationalShell({ badge, children }: Props) {
  return (
    <div style={{ background: '#fff', color: '#0F1923', fontFamily: 'var(--font-body)', minHeight: '100vh' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: '#0F1923', textDecoration: 'none' }}>
            Dentist<span style={{ color: '#1D4ED8' }}>InIndia</span>.in
            {badge && (
              <span style={{ marginLeft: 6, fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, padding: '3px 8px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {badge}
              </span>
            )}
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14, fontWeight: 600 }}>
            <Link href="/cities"          style={{ color: '#475569', textDecoration: 'none' }}>Cities</Link>
            <Link href="/dental-tourism"  style={{ color: '#475569', textDecoration: 'none' }}>Dental Tourism</Link>
            <Link href="/about"           style={{ color: '#475569', textDecoration: 'none' }}>About</Link>
            <Link
              href="/for-dentists"
              style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none' }}
            >For Dentists</Link>
          </div>
        </div>
      </nav>

      {children}

      <footer style={{ background: '#0F1923', color: '#94A3B8', padding: '40px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ maxWidth: 320 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 8 }}>
              Dentist In India
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>
              Verified dentists across every Indian city. Built by Dentaura Prime LLP, Pune.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <FooterCol title="Patients">
              <FooterLink href="/cities">Find a dentist</FooterLink>
              <FooterLink href="/dental-tourism">Dental tourism</FooterLink>
            </FooterCol>
            <FooterCol title="Dentists">
              <FooterLink href="/for-dentists">List your clinic</FooterLink>
            </FooterCol>
            <FooterCol title="Company">
              <FooterLink href="/about">About</FooterLink>
            </FooterCol>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid #1E293B', fontSize: 12, color: '#64748B' }}>
          © {new Date().getFullYear()} Dentaura Prime LLP · Pune, India
        </div>
      </footer>
    </div>
  )
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ fontSize: 13, color: '#94A3B8', textDecoration: 'none' }}>{children}</Link>
}
