'use client'

// Post wall on the dentist home. "Case" opens the real case form (photos,
// AI face/name hiding, patient consent). "Question" and "Update" are short
// text posts that go straight into the feed.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Avatar from './Avatar'

type Kind = 'case' | 'question' | 'update'

const PLACEHOLDER: Record<Exclude<Kind, 'case'>, string> = {
  question: 'Ask dentists across India, e.g. "Best way to manage a fractured file in a curved MB canal?"',
  update: 'Share an update, a tip, or something you learned this week',
}

export default function PostComposer({ me, enabled }: { me: { name: string; photo: string | null }; enabled: boolean }) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('case')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit() {
    if (kind === 'case' || busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/network-posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, body: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: data?.error || 'Could not post. Please try again.' }); return }
      setText('')
      setMsg({ ok: true, text: 'Posted to dentists across India.' })
      router.refresh()
    } catch {
      setMsg({ ok: false, text: 'Network error. Please try again.' })
    } finally { setBusy(false) }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', minHeight: 36, padding: '0 14px', borderRadius: 999,
    border: on ? '1px solid #1D4ED8' : '1px solid #CBD5E1', background: on ? '#1D4ED8' : '#fff',
    color: on ? '#fff' : '#0F1923', fontWeight: on ? 700 : 500, fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-body)',
  })

  return (
    <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#64748B' }}>Post wall</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="What are you posting?">
        {(['case', 'question', 'update'] as Kind[]).map(k => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} style={chip(kind === k)} onClick={() => { setKind(k); setMsg(null) }}>
            {k === 'case' ? 'Case' : k === 'question' ? 'Question' : 'Update'}
          </button>
        ))}
      </div>

      {kind === 'case' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar name={me.name} photo={me.photo} size={42} />
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
              Share a case with X-rays and photos and ask for a second opinion. Faces and names on X-rays are hidden for you before it goes live.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" /></svg>
              On the go? Send the photos to DentistIn on WhatsApp and we file the case for you.
            </span>
            <Link href="/cases/new" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 16px', borderRadius: 10, background: '#1D4ED8', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Post a case
            </Link>
          </div>
        </div>
      ) : !enabled ? (
        <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>Questions and updates open soon. You can post a case today.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Avatar name={me.name} photo={me.photo} size={42} />
            <label htmlFor="dh-post" style={{ position: 'absolute', left: -9999 }}>{kind === 'question' ? 'Your question' : 'Your update'}</label>
            <textarea
              id="dh-post"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={2000}
              placeholder={PLACEHOLDER[kind]}
              style={{ flex: 1, minWidth: 0, minHeight: 90, border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', resize: 'vertical', background: '#F8FAFC', fontSize: 15, fontFamily: 'var(--font-body)', color: '#0F1923' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: '#64748B' }}>No patient names or phone numbers, please. Use a case for X-rays.</span>
            <button type="button" onClick={submit} disabled={busy || text.trim().length < 10}
              style={{ minHeight: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: '#1D4ED8', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: busy || text.trim().length < 10 ? 0.55 : 1, fontFamily: 'var(--font-body)' }}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
      {msg && <div role="status" style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? '#166534' : '#991B1B' }}>{msg.text}</div>}
    </section>
  )
}
