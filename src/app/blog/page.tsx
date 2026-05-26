import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Blog — Coming Soon',
  description: "We're working on helpful dental content. Check back soon.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function BlogPlaceholder() {
  return (
    <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 32, fontWeight: 800, marginBottom: 16, color: '#0F172A' }}>
          Blog — Coming Soon
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: '#475569', marginBottom: 28 }}>
          We&apos;re working on helpful dental content. Check back soon.
        </p>
        <Link
          href="/"
          style={{ display: 'inline-block', padding: '10px 22px', background: '#1D4ED8', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
        >
          ← Back to homepage
        </Link>
      </div>
    </main>
  )
}
