import type { Metadata } from 'next'
import Link from 'next/link'
import NationalShell from '@/components/national/NationalShell'

export const metadata: Metadata = {
  title: 'Case submitted | Dentist In India',
  robots: { index: false, follow: false },
}

// Lightweight confirmation page shown after a non-auto-approved case
// is posted. Tells the dentist their submission is in the queue and
// gives them somewhere obvious to go next.

export default function CasePendingPage() {
  return (
    <NationalShell badge="Post a Case">
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 20px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 36, textAlign: 'center', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>📥</div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: '#0F1923', marginBottom: 10 }}>
            Your case is in moderation
          </h1>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 24 }}>
            Your first three cases get a quick admin review to keep clinical standards high. We'll email you when it's live — usually within a business day. Subsequent submissions go up instantly.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/cases/new" style={{ padding: '11px 18px', minHeight: 44, background: '#1D4ED8', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              Post another →
            </Link>
            <Link href="/professional/me" style={{ padding: '11px 18px', minHeight: 44, background: '#fff', color: '#0F1923', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              View my profile
            </Link>
          </div>
        </div>
      </main>
    </NationalShell>
  )
}
