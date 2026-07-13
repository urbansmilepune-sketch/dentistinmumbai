import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FeedNavLink from './FeedNavLink'
import BrandLogo from './BrandLogo'

// Shared header + footer for the secondary national pages (every
// national surface except / and /cities, which have their own inline
// navs). Nav: Dentists / Cities / Dental Insights / For Dentists, plus
// "My Feed" and "My Profile" when the viewer is signed in, or "Join the
// Network" when not. (Dental Insights is the merged /insights hub that
// consolidates the old Cases + Expert Advice surfaces.)
//
// Auth state is fetched server-side in this component itself (rather
// than via a prop) so every consumer doesn't have to thread it through.
// supabase.auth.getUser() is a cookie read + JWT validate, cheap to
// repeat per render.

interface Props {
  /** Toggles a coloured pill in the right side of the header so the
   *  user knows they're inside a sub-flow (e.g. "Dental Tourism"). */
  badge?: string
  children: React.ReactNode
}

export default async function NationalShell({ badge, children }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user?.email

  return (
    <div style={{ background: '#fff', color: '#0F1923', fontFamily: 'var(--font-body)', minHeight: '100vh' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14, fontWeight: 600 }}>
            <Link href="/dentists"     style={{ color: '#475569', textDecoration: 'none' }}>Dentists</Link>
            <Link href="/cities"       style={{ color: '#475569', textDecoration: 'none' }}>Cities</Link>
            <Link href="/insights"     style={{ color: '#475569', textDecoration: 'none' }}>Dental Insights</Link>
            <Link href="/for-dentists" style={{ color: '#475569', textDecoration: 'none' }}>For Dentists</Link>
            {signedIn ? (
              <>
                <FeedNavLink />
                <Link href="/professional/me" style={{ padding: '8px 16px', background: '#0F1923', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>
                  My Profile
                </Link>
                <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                  <button type="submit" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: 14, fontWeight: 600, color: '#475569' }}>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" style={{ color: '#475569', textDecoration: 'none' }}>Login</Link>
                <Link href="/join" style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>
                  Join Free →
                </Link>
              </>
            )}
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
              India's professional network for dentists. Built by dental professionals.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <FooterCol title="Network">
              <FooterLink href="/cases">Browse cases</FooterLink>
              <FooterLink href="/dentists">Discover dentists</FooterLink>
              <FooterLink href="/cities">Cities</FooterLink>
            </FooterCol>
            <FooterCol title="Get started">
              <FooterLink href="/join">Join the network</FooterLink>
              <FooterLink href="/for-dentists/login">Sign in</FooterLink>
              <FooterLink href="/for-dentists">For dentists</FooterLink>
            </FooterCol>
            <FooterCol title="Company">
              <FooterLink href="/about">About</FooterLink>
              <FooterLink href="/dental-tourism">Dental tourism</FooterLink>
            </FooterCol>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid #1E293B', fontSize: 12, color: '#64748B' }}>
          © {new Date().getFullYear()} DentistIn. All rights reserved.
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
