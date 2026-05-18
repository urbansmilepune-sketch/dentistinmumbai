'use client'

// Public unsubscribe page. Reads ?email= from the query string, shows a
// one-click confirm button (NOT an auto-fire on page load — Outlook safelink
// previews and Slack unfurls would otherwise opt people out without consent).

import { useEffect, useState } from 'react'

export default function UnsubscribePage() {
  const [email, setEmail] = useState<string>('')
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmail((params.get('email') || '').trim())
  }, [])

  async function unsubscribe() {
    setState('submitting')
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      background: '#F8FAFC', color: '#1F2937',
    }}>
      <div style={{
        background: '#fff', padding: 32, borderRadius: 14, maxWidth: 460, width: '100%',
        boxShadow: '0 4px 12px rgba(15, 25, 35, 0.04), 0 1px 3px rgba(15, 25, 35, 0.06)',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 8 }}>Unsubscribe</h1>
        <p style={{ fontSize: 14, color: '#475569', marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
          You're about to opt out of all marketing emails from DentistIn. You can
          still receive transactional messages (booking confirmations, password
          resets) if you have an account.
        </p>

        {state === 'done' ? (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 14px', color: '#166534', fontSize: 14, fontWeight: 600 }}>
            ✅ You've been unsubscribed. Sorry to see you go.
          </div>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Email</span>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #E2E8F0', fontSize: 14, marginTop: 6, boxSizing: 'border-box',
                }}
              />
            </label>
            {state === 'error' && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#B91C1C', marginBottom: 12 }}>
                Couldn't process that — please try again.
              </div>
            )}
            <button
              onClick={unsubscribe}
              disabled={state === 'submitting' || !email}
              style={{
                width: '100%', padding: '11px 18px', background: '#DC2626', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: state === 'submitting' || !email ? 'not-allowed' : 'pointer',
                opacity: state === 'submitting' || !email ? 0.7 : 1,
                marginTop: 12,
              }}
            >
              {state === 'submitting' ? 'Unsubscribing…' : 'Confirm unsubscribe'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
