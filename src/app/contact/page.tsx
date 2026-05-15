import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityBySlug, cityBrandName, cityBrandTld, cityOrigin } from '@/config/cities'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  return {
    title: `Contact Us | ${city.domain}`,
    description: `Get in touch with ${city.domain}. For patients, dentists, or partnership enquiries.`,
    alternates: { canonical: `${cityOrigin(city)}/contact` },
  }
}

export default async function ContactPage() {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))

  return (
    <>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{cityBrandName(city)}<span style={{ color: 'var(--blue)' }}>{cityBrandTld(city)}</span></span>
          </Link>
          <Link href="/dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>Find Dentists</Link>
        </nav>
      </header>

      <main style={{ background: 'var(--bg)', minHeight: '100vh', padding: '72px 20px' }}>
        <div className="container" style={{ maxWidth: 680 }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', marginBottom: 12 }}>Contact Us</h1>
            <p style={{ color: 'var(--muted)', fontSize: 16 }}>We&apos;re here to help patients, dentists, and partners.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 40 }}>
            {[
              { icon: '👤', title: 'For Patients', desc: 'Need help finding a dentist or have a booking issue?', action: 'WhatsApp Us', href: 'https://wa.me/917719903232' },
              { icon: '🦷', title: 'For Dentists', desc: 'Want to list your clinic or have a profile question?', action: 'List Your Clinic', href: '/for-dentists' },
              { icon: '🤝', title: 'Partnerships', desc: 'Dental brands, associations, or media enquiries.', action: 'Email Us', href: 'mailto:admin@dentistinmumbai.in' },
            ].map(card => (
              <div key={card.title} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '28px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{card.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{card.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>{card.desc}</p>
                <a href={card.href} style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--blue)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-body)' }}>
                  {card.action}
                </a>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '32px' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, marginBottom: 20 }}>Direct Contact</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { icon: '📧', label: 'Email', value: 'admin@dentistinmumbai.in', href: 'mailto:admin@dentistinmumbai.in' },
                { icon: '💬', label: 'WhatsApp', value: '+91 7719903232', href: 'https://wa.me/917719903232' },
                { icon: '🏢', label: 'Company', value: 'Dentaura Prime LLP, Pune, Maharashtra', href: null },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px', background: 'var(--bg)', borderRadius: 10 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{item.label}</div>
                    {item.href ? (
                      <a href={item.href} style={{ fontSize: 15, fontWeight: 600, color: 'var(--blue)' }}>{item.value}</a>
                    ) : (
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{item.value}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer style={{ background: '#0A1628', padding: '32px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain} · A Dentaura Prime LLP initiative</p>
      </footer>
    </>
  )
}
