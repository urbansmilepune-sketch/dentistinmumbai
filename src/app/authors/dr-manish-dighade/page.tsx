import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import { NAVY, NAVY_SOFT, TEAL, BRAND_GRADIENT } from '@/app/dentist/[slug]/profileTheme'

// Author / medical-reviewer profile for Dr. Manish Dighade. E-E-A-T page that
// the reviewed treatment pages (root-canal, implants, aligners) link back to.
//
// City-aware like the rest of the public site: the canonical + brand chrome
// resolve from the current domain (x-city-slug), so no domain emits an
// off-domain canonical. The clinic itself is in Pune, so the clinic-profile
// link and schema `sameAs`/`worksFor` point at the Pune domain absolutely —
// that's a genuine cross-domain reference to the real entity, not chrome.
export const dynamic = 'force-dynamic'

// Metadata is emitted here (page-level generateMetadata) rather than in a
// separate layout.tsx: the canonical must be city-aware, which needs the
// per-request hostname from headers() — a static layout can't read that.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const origin = cityOrigin(city)
  return {
    title: 'Dr. Manish Dighade — BDS, Fellowship in Dental Implantology | DentistIn Pune',
    description: 'Dr. Manish Dighade is a dental implantologist practicing in Wakad, Pune. BDS graduate with a Fellowship in Dental Implantology. MSDC Registration No. A-24630.',
    alternates: { canonical: `${origin}/authors/dr-manish-dighade` },
    robots: { index: true, follow: true },
  }
}

const CLINIC_SLUG = 'urban-smile-orthodontic-and-dental-implant-centre'

export default async function AuthorPage() {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const origin = cityOrigin(city)
  // The clinic is a Pune entity — link to it on the Pune domain regardless of
  // which city domain this author page is being served on.
  const puneOrigin = cityOrigin(getCityBySlug('pune'))
  const clinicUrl = `${puneOrigin}/dentist/${CLINIC_SLUG}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Dr. Manish Dighade',
    honorificPrefix: 'Dr.',
    jobTitle: 'Dental Implantologist',
    description: 'BDS, Fellowship in Dental Implantology. Practicing at Urban Smile Orthodontic and Dental Implant Centre, Wakad, Pune.',
    hasCredential: [
      { '@type': 'EducationalOccupationalCredential', credentialCategory: 'degree', name: 'Bachelor of Dental Surgery (BDS)' },
      { '@type': 'EducationalOccupationalCredential', credentialCategory: 'certification', name: 'Fellowship in Dental Implantology' },
    ],
    identifier: { '@type': 'PropertyValue', name: 'MSDC Registration', value: 'A-24630' },
    worksFor: {
      '@type': 'Dentist',
      name: 'Urban Smile Orthodontic and Dental Implant Centre',
      address: { '@type': 'PostalAddress', addressLocality: 'Wakad', addressRegion: 'Pune', addressCountry: 'IN' },
    },
    url: `${origin}/authors/dr-manish-dighade`,
    sameAs: clinicUrl,
  }

  const credentials: [string, React.ReactNode][] = [
    ['Degree', 'BDS (Bachelor of Dental Surgery)'],
    ['Post-graduate', 'Fellowship in Dental Implantology'],
    ['Registration', 'Maharashtra State Dental Council — A-24630'],
    ['Clinic', 'Urban Smile Orthodontic and Dental Implant Centre'],
    ['Location', 'Wakad, Pune, Maharashtra'],
    ['Specialisations', 'Dental Implants · Full Mouth Rehabilitation · Orthodontics'],
  ]

  const h2 = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: NAVY, margin: '0 0 16px' } as const
  const p = { fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 } as const
  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 32, marginBottom: 24 } as const

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <SiteHeader city={city} />

      {/* HERO */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '32px 20px 40px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{city.cityName}</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Dr. Manish Dighade</span>
          </nav>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* PHOTO PLACEHOLDER — swap for headshot once uploaded (120×120, circular). */}
            <div
              aria-label="Photo placeholder"
              style={{
                width: 120, height: 120, borderRadius: '50%', flexShrink: 0,
                background: BRAND_GRADIENT, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34,
                border: '3px solid rgba(255,255,255,0.2)',
              }}
            >MD</div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 5vw, 2.2rem)', color: '#fff', margin: '0 0 6px', lineHeight: 1.2 }}>
                Dr. Manish Dighade
              </h1>
              <p style={{ color: TEAL, fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>
                BDS, Fellowship in Dental Implantology
              </p>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>
                <div><strong style={{ color: '#fff', fontWeight: 600 }}>Practicing at:</strong> Urban Smile Orthodontic and Dental Implant Centre, Wakad, Pune</div>
                <div><strong style={{ color: '#fff', fontWeight: 600 }}>MSDC Registration:</strong> A-24630</div>
                <div><strong style={{ color: '#fff', fontWeight: 600 }}>Specialisation:</strong> Dental Implants, Full Mouth Rehabilitation, Orthodontics</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main style={{ background: 'var(--bg)', padding: '32px 20px 48px' }}>
        <div className="container" style={{ maxWidth: 820 }}>

          <div style={card}>
            <h2 style={h2}>About Dr. Manish Dighade</h2>
            <p style={p}>
              Dr. Manish Dighade is a dental implantologist based in Wakad, Pune, with over a decade of clinical
              experience in implant dentistry and full mouth rehabilitation. He holds a Bachelor of Dental Surgery
              (BDS) degree and a Fellowship in Dental Implantology — a post-graduate credential focused on surgical
              implant placement, bone grafting, and prosthetic rehabilitation.
            </p>
            <p style={p}>
              At Urban Smile Orthodontic and Dental Implant Centre in Wakad, Dr. Dighade performs a range of implant
              procedures including single tooth implants, full mouth Basal implants, and All-on-4/All-on-6
              reconstructions. His clinic serves patients from across the Pimpri-Chinchwad and Pune Municipal
              Corporation areas.
            </p>
            <p style={{ ...p, marginBottom: 0 }}>
              Dr. Dighade is also the co-founder of Dentaura Prime LLP and the clinical advisor for DentistIn — a
              dental directory platform that publishes verified fee data and treatment information for patients
              across Pune.
            </p>
          </div>

          <div style={card}>
            <h2 style={h2}>Role on DentistIn</h2>
            <p style={p}>
              Dr. Dighade serves as the <strong>Medical Reviewer</strong> for DentistIn&apos;s implant and orthodontic
              treatment content. All implant-related pages — including dental implants, full mouth implants, and clear
              aligners — are reviewed and approved by Dr. Dighade before publication.
            </p>
            <p style={{ ...p, fontWeight: 700, color: NAVY, marginBottom: 8 }}>What medical review means on DentistIn:</p>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.9 }}>
              <li>Clinical accuracy of procedure descriptions verified against current dental practice</li>
              <li>Fee ranges cross-checked against real patient data from verified Pune clinics</li>
              <li>FAQ answers reviewed for patient safety and accuracy</li>
              <li>Content updated when clinical guidelines or market fees change</li>
            </ul>
          </div>

          <div style={card}>
            <h2 style={h2}>Credentials</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {credentials.map(([k, v], i) => (
                  <tr key={k} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <th scope="row" style={{ textAlign: 'left', verticalAlign: 'top', padding: '12px 16px 12px 0', fontSize: 13, fontWeight: 700, color: NAVY, whiteSpace: 'nowrap', width: 160 }}>{k}</th>
                    <td style={{ padding: '12px 0', fontSize: 14, color: 'var(--text-secondary)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ ...h2, margin: 0, fontSize: 18 }}>DentistIn Profile</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>See the clinic listing on DentistIn Pune.</p>
            </div>
            <a href={clinicUrl} style={{ display: 'inline-block', padding: '11px 20px', background: TEAL, color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              View clinic profile →
            </a>
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', marginTop: 24 }}>
            This page was last updated: July 2026
          </p>
        </div>
      </main>

      {/* FOOTER — mirrors the shared public footer. */}
      <footer style={{ background: '#0A1628', padding: '40px 20px 24px', color: 'rgba(255,255,255,0.6)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#fff', fontSize: 15 }}>{city.domain}</Link>
            <div style={{ display: 'flex', gap: 20 }}>
              <Link href="/dentists" style={{ fontSize: 13 }}>Find Dentists</Link>
              <Link href="/for-dentists" style={{ fontSize: 13 }}>For Dentists</Link>
              <Link href="/about" style={{ fontSize: 13 }}>About</Link>
            </div>
            <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain}</p>
          </div>
        </div>
      </footer>
    </>
  )
}
