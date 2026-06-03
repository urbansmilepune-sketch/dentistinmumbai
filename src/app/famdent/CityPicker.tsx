'use client'

import { useState } from 'react'

// Each city's registration URL is UTM-tagged identically so the Famdent
// booth shows up as one campaign in every city's analytics.
const UTM = '?utm_source=famdent&utm_medium=qr&utm_campaign=famdent2026'
const CITIES: { label: string; url: string }[] = [
  { label: 'Mumbai', url: `https://www.dentistinmumbai.in/for-dentists/register${UTM}` },
  { label: 'Pune', url: `https://www.dentistinpune.in/for-dentists/register${UTM}` },
  { label: 'Nashik', url: `https://www.dentistinnashik.com/for-dentists/register${UTM}` },
]

// "Other" isn't a fixed button: the platform defaults unknown hosts to
// Mumbai, so we can't just send these dentists to the national domain and
// hope. Instead we ask them to type their city, log it to famdent_leads,
// and route them to the national parent register page with the typed city
// appended (?…&city=<typed>) so we capture where they're actually from.
const OTHER_BASE = `https://www.dentistinindia.in/for-dentists/register${UTM}`

export default function CityPicker() {
  const [busy, setBusy] = useState<string | null>(null)
  const [showOther, setShowOther] = useState(false)
  const [otherCity, setOtherCity] = useState('')

  // Fire-and-forget lead tracking. `keepalive` lets the POST complete even
  // though we navigate away on the next line, so the redirect is never
  // blocked on (and never fails because of) the analytics call. For "Other"
  // clicks we pass the typed city as `cityInput`.
  function track(city: string, cityInput?: string) {
    try {
      fetch('/api/famdent/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cityInput ? { city, cityInput } : { city }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      // ignore — analytics must never stop a dentist from registering
    }
  }

  function pick(city: string, url: string) {
    setBusy(city)
    track(city)
    window.location.href = url
  }

  function submitOther() {
    const typed = otherCity.trim()
    if (!typed) return
    setBusy('Other')
    track('Other', typed)
    window.location.href = `${OTHER_BASE}&city=${encodeURIComponent(typed)}`
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
        .famdent-other {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 12px;
        }
        .famdent-other-input {
          width: 100%;
          box-sizing: border-box;
          border: none;
          border-radius: 12px;
          padding: 18px;
          min-height: 56px;
          font-size: 16px;
          color: #0A1628;
          background: #fff;
        }
        .famdent-other-input::placeholder { color: #64748B; }
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
        <button
          type="button"
          className="famdent-city-btn"
          disabled={busy !== null}
          aria-expanded={showOther}
          onClick={() => setShowOther(true)}
        >
          Other
        </button>
      </div>

      {showOther && (
        <div className="famdent-other">
          <input
            type="text"
            className="famdent-other-input"
            placeholder="Which city are you in?"
            aria-label="Which city are you in?"
            value={otherCity}
            maxLength={80}
            autoFocus
            disabled={busy !== null}
            onChange={e => setOtherCity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitOther() }}
          />
          <button
            type="button"
            className="famdent-city-btn"
            disabled={busy !== null || otherCity.trim() === ''}
            onClick={submitOther}
          >
            Continue →
          </button>
        </div>
      )}
    </>
  )
}
