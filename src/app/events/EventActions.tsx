'use client'

// "I'm going" and "Remind me" toggles on an event card. Signed-out
// visitors get a sign-in link instead.

import { useState } from 'react'

interface Props {
  eventId: string
  signedIn: boolean
  initial: { going: boolean; remind: boolean }
  link: string | null
}

export default function EventActions({ eventId, signedIn, initial, link }: Props) {
  const [going, setGoing] = useState(initial.going)
  const [remind, setRemind] = useState(initial.remind)
  const [msg, setMsg] = useState('')

  async function save(next: { going: boolean; remind: boolean }) {
    setMsg('')
    const prev = { going, remind }
    setGoing(next.going); setRemind(next.remind)
    const res = await fetch(`/api/events/${eventId}/interest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.success) {
      setGoing(prev.going); setRemind(prev.remind)
      setMsg(data?.error || 'Could not save')
    } else if (next.remind && !prev.remind) {
      setMsg('Saved. WhatsApp reminders are coming soon.')
    }
  }

  const btn = (on: boolean, primary: boolean): React.CSSProperties => ({
    flex: 1, minHeight: 42, padding: '0 12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: on ? '1px solid #047857' : primary ? '1px solid #1D4ED8' : '1px solid #CBD5E1',
    background: on ? '#047857' : primary ? '#1D4ED8' : '#fff',
    color: on || primary ? '#fff' : '#0F1923',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {signedIn ? (
          <>
            <button type="button" onClick={() => save({ going: !going, remind })} style={btn(going, true)}>{going ? 'Going ✓' : "I'm going"}</button>
            <button type="button" onClick={() => save({ going, remind: !remind })} style={btn(remind, false)}>{remind ? 'Reminder set ✓' : 'Remind me'}</button>
          </>
        ) : (
          <a href={`/for-dentists/login?next=/events`} style={btn(false, false)}>Sign in to save</a>
        )}
        {link && <a href={link} target="_blank" rel="noopener nofollow" style={btn(false, false)}>Details</a>}
      </div>
      {msg && <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{msg}</div>}
    </div>
  )
}
