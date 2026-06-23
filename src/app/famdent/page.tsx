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
            layout shift concern, keeps this page dependency-free. Shown
            inline with no card/box; centered horizontally via block +
            margin auto, with generous spacing below before the headline. */}
        <img
          src="/logo-india.svg"
          width={160}
          alt="DentistIn"
          style={{
            display: 'block',
            height: 'auto',
            margin: '0 auto 40px',
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
