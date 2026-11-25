import Link from 'next/link'
import NationalShell from './NationalShell'
import { ui } from '@/lib/national'

// Shown on dentists-only network pages (case library, case pages) to a
// visitor who isn't signed in as a dentist on dentistinindia.in.

export default function DentistsOnly({ next, title }: { next: string; title?: string }) {
  return (
    <NationalShell>
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 16px 64px' }}>
        <div style={{ ...ui.card, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={ui.pill('#EFF6FF', '#1D4ED8')}>For dentists only</span>
          <h1 style={{ ...ui.h1, fontSize: 24 }}>{title || 'The case library is for dentists'}</h1>
          <p style={ui.sub}>
            Clinical photos, X-rays and discussion are shared only between registered dentists. Sign in with the same email you use on your city DentistIn site.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`/for-dentists/login?next=${encodeURIComponent(next)}`} style={ui.btn}>Sign in</Link>
            <Link href="/for-dentists/register" style={ui.btnGhost}>Join free</Link>
          </div>
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
            Looking for a dentist? <Link href="/experts" style={{ color: '#1D4ED8', fontWeight: 700 }}>Find an expert</Link> instead.
          </p>
        </div>
      </main>
    </NationalShell>
  )
}
