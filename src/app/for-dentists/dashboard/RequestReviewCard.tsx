'use client'

import { useState } from 'react'
import { whatsappLink } from '@/lib/phone'

interface Props {
  clinicName: string
  /** Public profile URL, e.g. https://host/dentist/<slug> (no trailing slash). */
  profileUrl: string
  /** Dentist's name as stored — may or may not already carry a "Dr." prefix. */
  dentistName: string
}

export default function RequestReviewCard({ clinicName, profileUrl, dentistName }: Props) {
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Fallback only: if the review-link API fails we still send the patient to
  // the profile's reviews section, as this card did before review links.
  const reviewUrl = `${profileUrl}#reviews`
  const cleanName = dentistName.replace(/^\s*dr\.?\s*/i, '').trim()
  const signoff = cleanName ? `Dr. ${cleanName}` : 'your dentist'

  function fallbackMessage(): string {
    const who = patientName.trim() || 'there'
    return (
      `Hi ${who}, thank you for visiting ${clinicName}. We'd love your feedback! ` +
      `Please leave a review here: ${reviewUrl}\n\n` +
      `Takes just 1 minute — ${signoff}`
    )
  }

  async function handleSend() {
    if (busy) return
    setBusy(true); setError('')
    // A one-time review link: the patient taps stars, no OTP.
    try {
      const res = await fetch('/api/dentist/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_name: patientName.trim(), patient_phone: patientPhone.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.waUrl) {
        window.location.href = data.waUrl
        setBusy(false)
        return
      }
      if (res.status === 400 && data.error) { setError(data.error); setBusy(false); return }
    } catch { /* fall through to the old profile link */ }
    const text = fallbackMessage()
    const url = whatsappLink(patientPhone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`
    window.location.href = url
    setBusy(false)
  }

  const canSend = patientName.trim().length > 0 && !busy
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', minHeight: 44,
    border: '1px solid var(--border)', borderRadius: 10,
    fontSize: 14, fontFamily: 'var(--font-body)', background: 'var(--bg)',
  }

  return (
    <section style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
      padding: '20px 24px', marginBottom: 24,
      boxShadow: '0 4px 14px rgba(15,25,35,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 28 }}>⭐</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#F59E0B' }}>Grow your reputation</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Get Your First Review</h3>
        </div>
      </div>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
        Ask a patient you&apos;ve treated to leave a quick review. Enter their name (and
        WhatsApp number, if you have it) and we&apos;ll open WhatsApp with a one-tap review link ready to send.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label htmlFor="rr-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Patient name</label>
          <input
            id="rr-name"
            type="text"
            value={patientName}
            onChange={e => setPatientName(e.target.value)}
            placeholder="e.g. Priya"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="rr-phone" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>WhatsApp number <span style={{ fontWeight: 400 }}>(optional)</span></label>
          <input
            id="rr-phone"
            type="tel"
            inputMode="numeric"
            value={patientPhone}
            onChange={e => setPatientPhone(e.target.value)}
            placeholder="10-digit mobile"
            style={inputStyle}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!canSend}
        title={canSend ? 'Open WhatsApp with the review request' : 'Enter the patient name first'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 20px', minHeight: 48,
          background: canSend ? '#25D366' : '#A7C9B6',
          color: '#fff', border: 'none', borderRadius: 10,
          fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-body)',
          cursor: canSend ? 'pointer' : 'not-allowed',
        }}>
        {busy ? 'Opening WhatsApp…' : '📲 Send Review Request on WhatsApp'}
      </button>
      {error && <p role="alert" style={{ marginTop: 8, fontSize: 13, color: '#B91C1C' }}>{error}</p>}
    </section>
  )
}
