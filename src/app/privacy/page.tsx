import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityBySlug, cityBrandName, cityBrandTld, cityOrigin } from '@/config/cities'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  return {
    title: `Privacy Policy | ${city.domain}`,
    description: `Privacy Policy for ${city.domain} — how we collect, use and protect your data.`,
    alternates: { canonical: `${cityOrigin(city)}/privacy` },
  }
}

function sectionsFor(domain: string) {
  return [
    {
      title: '1. Information We Collect',
      content: `When you use ${domain}, we may collect: your name, phone number, and email address when you book an appointment or submit an enquiry; your search queries and browsing behaviour on our platform; device and browser information for analytics purposes. We do not collect payment information — all payments (if any) are processed by Razorpay directly.`,
    },
    {
      title: '2. How We Use Your Information',
      content: `We use your information to: connect you with dental clinics you enquire about; send appointment confirmation and reminder messages via SMS or email; improve our platform based on usage patterns; send you relevant updates if you have opted in. We do not sell your personal data to any third party.`,
    },
    {
      title: '3. Information Shared with Dentists',
      content: `When you book an appointment or send an enquiry, your name, phone number, and email are shared with the relevant dental clinic. This is necessary to fulfil your booking. The clinic is responsible for their own data handling practices.`,
    },
    {
      title: '4. Cookies',
      content: `We use cookies to maintain your session, remember your preferences, and collect anonymous analytics data via Google Analytics 4. You can disable cookies in your browser settings, though this may affect platform functionality.`,
    },
    {
      title: '5. Data Security',
      content: `Your data is stored securely on Supabase (PostgreSQL) hosted on AWS infrastructure in the Mumbai region. We use industry-standard encryption in transit (HTTPS) and at rest. Access to personal data is restricted to authorised personnel only.`,
    },
    {
      title: '6. Your Rights',
      content: `You have the right to: access the personal data we hold about you; request correction of incorrect data; request deletion of your data; opt out of marketing communications. To exercise any of these rights, contact us at admin@${domain}.`,
    },
    {
      title: '7. Third-Party Services',
      content: `We use the following third-party services: Google Analytics (usage analytics), Supabase (database), Razorpay (payments), MSG91 (SMS), Resend (email). Each has their own privacy policy which governs their use of data.`,
    },
    {
      title: '8. Changes to This Policy',
      content: `We may update this Privacy Policy from time to time. We will notify registered users of significant changes by email. Continued use of the platform after changes constitutes acceptance of the updated policy.`,
    },
    {
      title: '9. Contact',
      content: `For any privacy-related questions, contact us at admin@${domain} or WhatsApp +91 7719903232.`,
    },
  ]
}

export default async function PrivacyPage() {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const SECTIONS = sectionsFor(city.domain)

  return (
    <>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{cityBrandName(city)}<span style={{ color: 'var(--blue)' }}>{cityBrandTld(city)}</span></span>
          </Link>
        </nav>
      </header>

      <main style={{ background: 'var(--bg)', minHeight: '100vh', padding: '72px 20px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div style={{ marginBottom: 40 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', marginBottom: 8 }}>Privacy Policy</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Last updated: May 2026 · Dentaura Prime LLP</p>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '48px' }}>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 32 }}>
              {city.domain} is operated by Dentaura Prime LLP (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;). This Privacy Policy explains how we collect, use, and protect your personal information when you use our platform.
            </p>

            {SECTIONS.map((section, i) => (
              <div key={i} style={{ marginBottom: 28 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 10 }}>{section.title}</h2>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{section.content}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer style={{ background: '#0A1628', padding: '32px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 8 }}>
          <Link href="/terms" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Terms of Use</Link>
          <Link href="/contact" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Contact</Link>
        </div>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain} · A Dentaura Prime LLP initiative</p>
      </footer>
    </>
  )
}
