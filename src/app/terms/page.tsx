import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Use | dentistinmumbai.in',
  description: 'Terms of Use for dentistinmumbai.in — rules governing your use of our dental directory platform.',
  alternates: { canonical: 'https://www.dentistinmumbai.in/terms' },
}

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    content: 'By accessing or using dentistinmumbai.in, you agree to be bound by these Terms of Use. If you do not agree, please do not use the platform. These terms apply to all visitors, patients, and dental professionals using the platform.',
  },
  {
    title: '2. Platform Description',
    content: 'dentistinmumbai.in is a dental directory and booking platform that connects patients with dental clinics in Mumbai. We are not a healthcare provider. We do not provide medical advice. All clinical decisions are the responsibility of the treating dentist.',
  },
  {
    title: '3. Patient Responsibilities',
    content: 'As a patient using this platform, you agree to: provide accurate personal information when booking appointments; attend booked appointments or cancel with reasonable notice; not misuse the review system by submitting false or defamatory reviews; not contact dentists for non-dental purposes.',
  },
  {
    title: '4. Dentist Responsibilities',
    content: 'Dental professionals listed on our platform agree to: maintain valid MCI/DCI registration at all times; provide accurate clinic information including fees, hours, and services; respond to patient enquiries in a timely and professional manner; not engage in misleading advertising or false claims on their profile.',
  },
  {
    title: '5. Appointments and Bookings',
    content: 'Appointments made through dentistinmumbai.in are requests that must be confirmed by the clinic. We are not responsible for missed, cancelled, or rescheduled appointments. Any disputes about appointments are between the patient and the clinic directly.',
  },
  {
    title: '6. Reviews and Content',
    content: 'Reviews submitted to our platform must be genuine patient experiences. We reserve the right to moderate, edit, or remove reviews that violate our community guidelines, contain false information, or are submitted in bad faith. Dentists may not submit reviews for their own clinics.',
  },
  {
    title: '7. Intellectual Property',
    content: 'All content on dentistinmumbai.in including text, design, logos, and code is owned by Dentaura Prime LLP. You may not reproduce, distribute, or create derivative works without explicit written permission.',
  },
  {
    title: '8. Limitation of Liability',
    content: 'dentistinmumbai.in is provided "as is". We make no warranties about the accuracy, completeness, or availability of information. We are not liable for any damages arising from your use of the platform, including treatment outcomes, appointment failures, or data loss.',
  },
  {
    title: '9. Governing Law',
    content: 'These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Pune, Maharashtra.',
  },
  {
    title: '10. Changes to Terms',
    content: 'We reserve the right to update these Terms at any time. Continued use of the platform after changes constitutes acceptance. We will notify registered users of material changes by email.',
  },
]

export default function TermsPage() {
  return (
    <>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>DentistInMumbai<span style={{ color: 'var(--blue)' }}>.in</span></span>
          </Link>
        </nav>
      </header>

      <main style={{ background: 'var(--bg)', minHeight: '100vh', padding: '72px 20px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div style={{ marginBottom: 40 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', marginBottom: 8 }}>Terms of Use</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Last updated: May 2026 · Dentaura Prime LLP</p>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '48px' }}>
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
          <Link href="/privacy" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Privacy Policy</Link>
          <Link href="/contact" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Contact</Link>
        </div>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} dentistinmumbai.in · A Dentaura Prime LLP initiative</p>
      </footer>
    </>
  )
}
