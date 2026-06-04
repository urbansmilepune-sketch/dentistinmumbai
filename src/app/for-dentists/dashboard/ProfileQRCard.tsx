'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Always-visible "Share Your Profile" card on the dashboard overview. The QR
// encodes the dentist's PUBLIC profile URL (https://<city-domain>/dentist/<slug>)
// — not the booking page — so a scan lands a patient on the full listing where
// they can read reviews, see photos, and book. The booking-specific QR card
// lives on the Edit Profile page; this one is for general profile sharing.
//
// Mirrors the QR generation used on profile/page.tsx: qrcode.toDataURL with
// high error correction so the printed/forwarded code still scans after
// WhatsApp re-compresses it.
export default function ProfileQRCard({
  profileUrl,
  clinicName,
}: {
  profileUrl: string
  clinicName: string
}) {
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    if (!profileUrl) return
    let cancelled = false
    QRCode.toDataURL(profileUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0F1923', light: '#FFFFFF' },
    })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [profileUrl])

  function downloadQr() {
    if (!qrDataUrl) return
    // [clinic-name]-qr-code.png — lowercase, non-alphanumerics collapsed to a
    // single hyphen so the filename is safe on every OS.
    const safeName =
      (clinicName || 'clinic')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'clinic'
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `${safeName}-qr-code.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 24, boxShadow: '0 4px 14px rgba(15,25,35,0.05)' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flexShrink: 0 }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Profile QR code" width={180} height={180} style={{ display: 'block', width: 180, height: 180 }} />
          ) : (
            <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Generating…
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>
            Share Your Profile
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 14 }}>
            Patients scan this to book appointments
          </p>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', fontSize: 13, color: 'var(--blue)', fontWeight: 600, marginBottom: 16, wordBreak: 'break-all' }}
          >
            {profileUrl}
          </a>
          <div>
            <button
              type="button"
              onClick={downloadQr}
              disabled={!qrDataUrl}
              style={{ padding: '13px 26px', minHeight: 48, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: qrDataUrl ? 'pointer' : 'not-allowed', opacity: qrDataUrl ? 1 : 0.6, fontFamily: 'var(--font-body)' }}
            >
              ⬇ Download QR Code
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
