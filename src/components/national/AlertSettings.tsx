'use client'

// Switches on dentistinindia.in/alerts. Each change saves straight away.
import { useState } from 'react'

type Prefs = { push_replies: boolean; push_summary: boolean; whatsapp_summary: boolean; whatsapp_digest: boolean }

const GROUPS: { title: string; rows: { key: keyof Prefs; label: string; hint: string }[] }[] = [
  { title: 'Phone alerts', rows: [
    { key: 'push_replies', label: 'Replies and comments', hint: 'Right away, max 1 per case per hour' },
    { key: 'push_summary', label: 'Likes and new followers', hint: 'One summary at 7 PM' },
  ] },
  { title: 'WhatsApp', rows: [
    { key: 'whatsapp_summary', label: 'Activity summary', hint: 'At most twice a week, only if you missed something' },
    { key: 'whatsapp_digest', label: 'Monday cases digest', hint: 'New cases from dentists you follow' },
  ] },
]

export default function AlertSettings({ initial, highlight }: { initial: Prefs; highlight?: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(initial)
  const [msg, setMsg] = useState<string | null>(null)

  async function flip(key: keyof Prefs) {
    const on = !prefs[key]
    setPrefs(p => ({ ...p, [key]: on }))
    setMsg(null)
    const res = await fetch('/api/network-alerts/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, on }) }).catch(() => null)
    if (!res || !res.ok) {
      setPrefs(p => ({ ...p, [key]: !on }))
      const j = res ? await res.json().catch(() => null) : null
      setMsg(j?.error || 'Could not save. Please try again.')
    } else {
      setMsg('Saved')
    }
  }

  const card: React.CSSProperties = { background: '#fff', border: highlight ? '2px solid #1D4ED8' : '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, padding: '12px 14px', fontSize: 13.5, color: '#475569' }}>
        <strong style={{ color: '#0F1923' }}>Bell and this list</strong> are always on and never send anything.
      </div>
      {GROUPS.map(g => (
        <div key={g.title}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', margin: '0 2px 6px' }}>{g.title}</div>
          <div style={card}>
            {g.rows.map((r, i) => {
              const on = prefs[r.key]
              return (
                <button key={r.key} type="button" role="switch" aria-checked={on} onClick={() => flip(r.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 14px', minHeight: 56, border: 'none', borderTop: i ? '1px solid #E2E8F0' : 'none', background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#0F1923' }}>{r.label}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: '#64748B' }}>{r.hint}</span>
                  </span>
                  <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 99, background: on ? '#0D9488' : '#CBD5E1', position: 'relative', flex: 'none', transition: 'background .15s' }}>
                    <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>
        Phone alerts come from the DentistIn dentist app on your phone. Turn them on in the app under More, Notifications. You can also reply STOP to any DentistIn India WhatsApp.
        {msg && <strong style={{ marginLeft: 6, color: msg === 'Saved' ? '#0F766E' : '#B91C1C' }}>{msg}</strong>}
      </p>
    </div>
  )
}
