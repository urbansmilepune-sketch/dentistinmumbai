'use client'

import { useState } from 'react'

/**
 * "Ask for review" on a visit marked Done. Gets a one-time review link for
 * that appointment and opens WhatsApp with the message ready to send.
 */
export default function AskReviewButton({ appointmentId, compact = false }: { appointmentId: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function ask() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/dentist/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointmentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.waUrl) {
        setError(data.error || 'Could not create the link.')
      } else {
        // Same tab: a pop-up opened after an await is blocked on phones.
        window.location.href = data.waUrl
      }
    } catch {
      setError('No internet connection.')
    }
    setBusy(false)
  }

  return (
    <span style={{ display: 'inline-grid', justifyItems: 'end', gap: 2 }}>
      <button
        type="button"
        onClick={ask}
        disabled={busy}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          minHeight: compact ? 34 : 40, padding: compact ? '0 10px' : '0 12px',
          border: 'none', borderRadius: 10, background: '#25D366', color: '#052E16',
          fontWeight: 700, fontSize: compact ? 12 : 13, fontFamily: 'var(--font-body)',
          cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: busy ? 0.7 : 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" /></svg>
        {busy ? 'Opening…' : 'Ask for review'}
      </button>
      {error && <span role="alert" style={{ fontSize: 11, color: '#B91C1C' }}>{error}</span>}
    </span>
  )
}
