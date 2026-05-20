import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityBySlug, cityBrandName, cityBrandTld, cityOrigin, NATIONAL_ORIGIN } from '@/config/cities'
import NationalAbout from '@/components/national/NationalAbout'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  if (h.get('x-is-national') === '1') {
    const title = 'About Us | Dentist In India'
    const description = 'Dentist In India is a national dental network built by dental professionals — one verified platform for every Indian city, on a mission to make quality dental care accessible to every Indian.'
    const url = `${NATIONAL_ORIGIN}/about`
    return {
      title, description,
      alternates: { canonical: url },
      openGraph: { title, description, url, siteName: 'dentistinindia.in', type: 'website', locale: 'en_IN' },
      twitter: { card: 'summary', title, description },
    }
  }
  const city = getCityBySlug(h.get('x-city-slug'))
  const title = `About Us | ${city.domain}`
  const description = `${city.domain} is ${city.cityName}'s most trusted dental directory. Built by dental professionals to help patients find verified dentists and help dentists grow their practice.`
  const url = `${cityOrigin(city)}/about`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: city.domain, type: 'website', locale: 'en_IN' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function AboutPage() {
  const h = await headers()
  // National parent gets the dedicated NationalAbout (mission, generic
  // "built by dental professionals" framing, platform-wide live stats).
  // The existing per-city copy below keeps shipping on dentistin[city].in
  // surfaces unchanged.
  if (h.get('x-is-national') === '1') {
    return <NationalAbout />
  }
  const city = getCityBySlug(h.get('x-city-slug'))

  return (
    <>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{cityBrandName(city)}<span style={{ color: 'var(--blue)' }}>{cityBrandTld(city)}</span></span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>Find Dentists</Link>
            <Link href="/for-dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>For Dentists</Link>
          </div>
        </nav>
      </header>

      <main style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <section style={{ background: 'linear-gradient(135deg, #003F7A, #0057A8)', padding: '60px 20px' }}>
          <div className="container" style={{ textAlign: 'center' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2rem, 4vw, 3rem)', color: '#fff', marginBottom: 16 }}>About {city.domain}</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, maxWidth: 560, margin: '0 auto' }}>
              {city.cityName}&apos;s most trusted platform for finding verified dentists — built by dental professionals.
            </p>
          </div>
        </section>

        <section style={{ padding: '72px 20px' }}>
          <div className="container" style={{ maxWidth: 760 }}>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', padding: '48px' }}>

              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 16 }}>Our Mission</h2>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 32 }}>
                {city.domain} was built to solve a simple but frustrating problem: {city.cityName} has thousands of excellent dentists, but patients can&apos;t find them — and dentists can&apos;t reach patients who are searching online. We built the bridge.
              </p>

              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 16 }}>What We Do</h2>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 24 }}>
                We verify every dentist before listing them. Every profile includes MCI registration, real patient reviews, transparent fees, and direct booking — so patients can make informed decisions without calling 10 clinics.
              </p>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 32 }}>
                For dentists, we provide a complete digital presence — a full clinic profile indexed on Google, appointment booking, WhatsApp connect, patient reviews, and a dashboard to manage their practice.
              </p>

              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 16 }}>Who We Are</h2>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 32 }}>
                {city.domain} is built by dental professionals — practitioners who run their own clinics and have lived the gap between patients searching online and dentists trying to reach them. Every product decision is shaped by people who understand dental from both sides of the chair.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20, marginBottom: 40 }}>
                {[
                  { value: '80+', label: `${city.cityName} Areas` },
                  { value: '15+', label: 'Treatments' },
                  { value: '100%', label: 'Free for Patients' },
                  { value: '24hrs', label: 'Profile Go-Live' },
                ].map(stat => (
                  <div key={stat.label} style={{ textAlign: 'center', padding: '20px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: 'var(--blue)' }}>{stat.value}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 16 }}>Contact Us</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15, color: 'var(--text-secondary)' }}>
                  <div>📧 <a href={`mailto:admin@${city.domain}`} style={{ color: 'var(--blue)' }}>admin@{city.domain}</a></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ background: '#0A1628', padding: '32px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} DentistIn. All rights reserved.</p>
      </footer>
    </>
  )
}
