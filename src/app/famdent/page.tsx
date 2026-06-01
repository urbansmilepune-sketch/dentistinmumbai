import type { Metadata } from 'next'
import CityPicker from './CityPicker'

// QR-code landing for the Famdent Show Mumbai (June 12–14 2026). Dentists
// scan the booth QR, pick the city they practice in, and we route them to
// that city's registration page (UTM-tagged) while logging the click for
// booth-conversion analytics. No navbar/footer — the root layout injects
// neither, and this is a standalone capture page, not part of any city shell.
export const metadata: Metadata = {
  title: 'DentistIn — Famdent 2026',
  robots: 'noindex',
}

export default function FamdentPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A1628',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        {/* Plain <img> (not next/image) — single above-the-fold asset, no
            layout shift concern, keeps this page dependency-free. */}
        {/* The logo art has a baked-in white background, and its wordmark is
            dark navy — illegible if knocked out onto this navy page. So we
            frame it on an intentional white rounded card instead of fighting
            the white box. Swap for a transparent/white-knockout asset later. */}
        <img
          src="/india-logo.png"
          width={160}
          alt="DentistIn"
          style={{
            height: 'auto',
            marginBottom: 24,
            background: '#fff',
            borderRadius: 8,
            padding: '12px 16px',
          }}
        />
        <h1 style={{ color: '#fff', fontWeight: 700, fontSize: 32, margin: 0 }}>
          Welcome to DentistIn
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 12 }}>
          India&apos;s Dental Platform — Claim your free clinic profile
        </p>

        <CityPicker />
      </div>
    </main>
  )
}
