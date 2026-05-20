import type { Metadata } from 'next'
import NationalShell from '@/components/national/NationalShell'
import JoinForm from './JoinForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Join India's Dental Professional Network | Dentist In India",
  description: 'Create your verified profile in 5 minutes. Listed on your city directory automatically. India\'s LinkedIn for dentists.',
}

// /join — LinkedIn-style frictionless registration. Server component
// wraps the client form with the national shell and a hero block.

export default function JoinPage() {
  return (
    <NationalShell badge="Join">
      <section style={{ padding: '48px 20px 20px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 38, lineHeight: 1.15, color: '#0F1923', marginBottom: 12 }}>
            Join India's Dental <span style={{ color: '#1D4ED8' }}>Professional Network</span>
          </h1>
          <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.55 }}>
            Create your verified profile in 5 minutes. Listed on your city directory automatically.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 64px' }}>
        <JoinForm />
      </main>
    </NationalShell>
  )
}
