import type { Metadata } from 'next'
import NationalShell from '@/components/national/NationalShell'
import JoinForm from './JoinForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Claim Your Verified Dentist Profile | Dentist In India',
  description: 'Create your verified profile in 5 minutes. Publish clinical cases, get peer review from verified colleagues, and get listed on your city directory.',
}

// /join — frictionless registration for the national parent. Server
// component wraps the client form with the national shell and a hero block.
//
// Copy reframed off the old "India's LinkedIn for dentists" positioning —
// and then off the vendor framing that briefly replaced it. The product is
// clinical case review between verified dentists; vendor discovery is a
// footer-level utility. The form itself is unchanged.

export default function JoinPage() {
  return (
    <NationalShell badge="Claim profile">
      <section style={{ padding: '48px 20px 20px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 38, lineHeight: 1.15, color: '#0F1923', marginBottom: 12 }}>
            Claim your <span style={{ color: '#1D4ED8' }}>verified dentist profile</span>
          </h1>
          <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.55 }}>
            Takes 5 minutes. Your State Dental Council registration is what lets you publish cases
            and review your colleagues&apos; work — and it lists you on your city directory automatically.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 64px' }}>
        <JoinForm />
      </main>
    </NationalShell>
  )
}
