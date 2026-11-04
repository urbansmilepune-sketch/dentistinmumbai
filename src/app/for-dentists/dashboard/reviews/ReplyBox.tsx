'use client'

import { useState } from 'react'

/** Public reply under one live review. Empty text removes the reply. */
export default function ReplyBox({ reviewId, initialReply }: { reviewId: string; initialReply: string }) {
  const [saved, setSaved] = useState(initialReply)
  const [text, setText] = useState(initialReply)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/dentist/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: text.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error || 'Could not save.')
      else { setSaved(text.trim()); setEditing(false) }
    } catch {
      setError('No internet connection.')
    }
    setBusy(false)
  }

  const btn: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)', cursor: 'pointer' }

  if (!editing) {
    return saved ? (
      <div style={{ background: '#F1F5F9', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Your reply</span>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: '#334155' }}>{saved}</span>
        <button type="button" onClick={() => setEditing(true)} style={{ ...btn, justifySelf: 'start', minHeight: 32, padding: 0, border: 'none', background: 'none', color: '#0D9488' }}>Edit reply</button>
      </div>
    ) : (
      <button type="button" onClick={() => setEditing(true)} style={{ ...btn, justifySelf: 'start', border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text)' }}>Reply</button>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label htmlFor={`reply-${reviewId}`} style={{ fontSize: 12, fontWeight: 700 }}>Your reply (shown publicly under this review)</label>
      <textarea
        id={`reply-${reviewId}`}
        rows={3}
        maxLength={600}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. Thank you! See you at your next check-up."
        style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 15, fontFamily: 'var(--font-body)', resize: 'vertical' }}
      />
      {error && <span role="alert" style={{ fontSize: 12, color: '#B91C1C' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={save} disabled={busy} style={{ ...btn, border: 'none', background: '#14B8A6', color: '#04211D', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save reply'}</button>
        <button type="button" onClick={() => { setText(saved); setEditing(false); setError('') }} style={{ ...btn, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text)' }}>Cancel</button>
      </div>
    </div>
  )
}
