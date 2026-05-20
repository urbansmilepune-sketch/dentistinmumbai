'use client'

// Waitlist signup modal. Opened by IndiaMap (coming-soon dot click) and
// /cities (per-city Notify button). Single component reused so the form
// + success state behave identically wherever interest is captured.

import { useEffect, useState } from 'react'

interface Props {
  city: { slug: string; name: string; state: string }
  source: string
  onClose: () => void
}

export default function NotifyMeModal({ city, source, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Esc closes; lock body scroll so the page behind the backdrop doesn't
  // shift under the modal on mobile.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, city_slug: city.slug, source }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setState('sent')
      } else {
        setState('error')
        setErrorMsg(data?.error || 'Could not save right now. Try again?')
      }
    } catch {
      setState('error')
      setErrorMsg('Network error — please try again.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notify-modal-title"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 25, 35, 0.55)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 420,
        background: '#fff', borderRadius: 16, padding: 24,
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.2)',
      }}>
        {state === 'sent' ? (
          <>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>🎉</div>
            <h3 id="notify-modal-title" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 8, color: '#0F1923', textAlign: 'center' }}>
              You're on the list
            </h3>
            <p style={{ fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
              We'll email you the moment <strong>{city.name}</strong> goes live on the network.
            </p>
            <button onClick={onClose} style={{ width: '100%', padding: '11px 16px', minHeight: 44, background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Close
            </button>
          </>
        ) : (
          <>
            <h3 id="notify-modal-title" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 6, color: '#0F1923' }}>
              Notify me when {city.name} launches
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 1.5 }}>
              {city.state} — we'll send one email when we have verified dentists listed in your city. No marketing, no spam.
            </p>
            <form onSubmit={submit}>
              <label htmlFor="notify-email" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Email</label>
              <input
                id="notify-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '11px 14px', minHeight: 44,
                  borderRadius: 8, border: `1.5px solid ${state === 'error' ? '#DC2626' : '#E2E8F0'}`,
                  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {state === 'error' && (
                <div style={{ fontSize: 12, color: '#DC2626', marginTop: 8, fontWeight: 600 }}>{errorMsg}</div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button type="button" onClick={onClose} style={{ flex: '0 0 auto', padding: '11px 16px', minHeight: 44, background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={state === 'sending'} style={{ flex: 1, padding: '11px 16px', minHeight: 44, background: state === 'sending' ? '#93C5FD' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: state === 'sending' ? 'wait' : 'pointer' }}>
                  {state === 'sending' ? 'Saving…' : 'Notify me'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
