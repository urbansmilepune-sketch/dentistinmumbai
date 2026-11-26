'use client'

import { useState } from 'react'

export default function StopAlertsButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  async function stop() {
    setState('saving')
    try {
      const res = await fetch('/api/events/stop-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) })
      setState(res.ok ? 'done' : 'error')
    } catch { setState('error') }
  }
  if (state === 'done') {
    return <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: 16, color: '#065F46', fontWeight: 600 }}>Done. Event alerts are off for you.</div>
  }
  return (
    <div>
      <button type="button" onClick={stop} disabled={state === 'saving' || !token} style={{ width: '100%', minHeight: 46, borderRadius: 10, border: 'none', background: '#1D4ED8', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
        {state === 'saving' ? 'Saving…' : 'Stop event alerts'}
      </button>
      {state === 'error' && <p style={{ color: '#B91C1C', fontSize: 14, marginTop: 10 }}>This link did not work. Reply STOP to any event alert on WhatsApp instead.</p>}
    </div>
  )
}
