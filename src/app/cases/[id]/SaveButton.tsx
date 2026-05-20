'use client'

// Save / unsave (bookmark) button. Used both on /cases/[id] detail and
// on each card in /cases. Optimistic UI mirrors LikeButton; on no-auth
// click we redirect to login with ?next= back to wherever the button
// was clicked from.

import { useState } from 'react'

interface Props {
  caseId: string
  initialSaved: boolean
  signedIn: boolean
  /** When true, the button renders as a compact icon-only square — used
   *  on case cards in the browse grid where horizontal space is tight. */
  compact?: boolean
  /** Where the user should land after logging in if they aren't signed
   *  in when they click. Defaults to /cases/[id]. */
  nextHref?: string
}

export default function SaveButton({ caseId, initialSaved, signedIn, compact, nextHref }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function toggle(e: React.MouseEvent) {
    // The card-grid use case wraps cards in a <Link>; stop propagation
    // so a click on the bookmark doesn't also navigate to the case.
    e.preventDefault()
    e.stopPropagation()
    setErr('')
    if (!signedIn) {
      const next = nextHref || `/cases/${caseId}`
      window.location.href = `/for-dentists/login?next=${encodeURIComponent(next)}`
      return
    }
    if (busy) return
    const nextSaved = !saved
    setSaved(nextSaved)
    setBusy(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/save`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaved(!nextSaved)
        setErr(data?.error || 'Could not save')
      } else {
        setSaved(!!data.saved)
      }
    } catch {
      setSaved(!nextSaved)
      setErr('Network error')
    }
    setBusy(false)
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? 'Remove bookmark' : 'Save case'}
        title={err || (saved ? 'Saved' : 'Save for later')}
        style={{
          width: 32, height: 32,
          borderRadius: '50%',
          background: saved ? '#0F1923' : 'rgba(15, 25, 35, 0.55)',
          color: '#fff', border: 'none',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1, cursor: busy ? 'wait' : 'pointer',
        }}
      >{saved ? '★' : '☆'}</button>
    )
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      title={err}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', minHeight: 38,
        borderRadius: 999,
        background: saved ? '#0F1923' : '#fff',
        color: saved ? '#fff' : '#475569',
        border: `1px solid ${saved ? '#0F1923' : '#E2E8F0'}`,
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700,
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{saved ? '★' : '☆'}</span>
      <span>{saved ? 'Saved' : 'Save'}</span>
    </button>
  )
}
