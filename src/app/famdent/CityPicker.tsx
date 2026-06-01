'use client'

import { useState } from 'react'

// Each city's registration URL is UTM-tagged identically so the Famdent
// booth shows up as one campaign in every city's analytics. "Other" falls
// back to the national parent (dentistinindia.in) registration.
const UTM = '?utm_source=famdent&utm_medium=qr&utm_campaign=famdent2026'
const CITIES: { label: string; url: string }[] = [
  { label: 'Mumbai', url: `https://www.dentistinmumbai.in/for-dentists/register${UTM}` },
  { label: 'Pune', url: `https://www.dentistinpune.in/for-dentists/register${UTM}` },
  { label: 'Nashik', url: `https://www.dentistinnashik.com/for-dentists/register${UTM}` },
  { label: 'Other', url: `https://www.dentistinindia.in/for-dentists/register${UTM}` },
]

export default function CityPicker() {
  const [busy, setBusy] = useState<string | null>(null)

  function pick(city: string, url: string) {
    setBusy(city)
    // Fire-and-forget lead tracking. `keepalive` lets the POST complete even
    // though we navigate away on the next line, so the redirect is never
    // blocked on (and never fails because of) the analytics call.
    try {
      fetch('/api/famdent/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      // ignore — analytics must never stop a dentist from registering
    }
    window.location.href = url
  }

  return (
    <>
      <style>{`
        .famdent-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 16px;
        }
        @media (min-width: 480px) {
          .famdent-grid { grid-template-columns: 1fr 1fr; }
        }
        .famdent-city-btn {
          background: #0057A8;
          color: #fff;
          font-weight: 700;
          font-size: 16px;
          width: 100%;
          border: none;
          border-radius: 12px;
          padding: 18px;
          min-height: 56px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .famdent-city-btn:hover { background: #0046A0; }
        .famdent-city-btn:disabled { opacity: 0.7; cursor: default; }
      `}</style>

      <p style={{ color: '#fff', fontSize: 18, marginTop: 40, marginBottom: 0 }}>
        Which city are you practicing in?
      </p>

      <div className="famdent-grid">
        {CITIES.map(c => (
          <button
            key={c.label}
            type="button"
            className="famdent-city-btn"
            disabled={busy !== null}
            onClick={() => pick(c.label, c.url)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </>
  )
}
