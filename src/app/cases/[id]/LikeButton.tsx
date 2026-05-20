'use client'

// Like + count button for /cases/[id]. Optimistic UI: we flip liked
// state and adjust the count immediately, then reconcile with the
// server's authoritative response. On failure we roll back to whatever
// the server tells us.

import { useState } from 'react'

interface Props {
  caseId: string
  initialLiked: boolean
  initialCount: number
  signedIn: boolean
}

export default function LikeButton({ caseId, initialLiked, initialCount, signedIn }: Props) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function toggle() {
    setErr('')
    if (!signedIn) {
      window.location.href = `/for-dentists/login?next=/cases/${caseId}`
      return
    }
    if (busy) return
    // Optimistic flip.
    const nextLiked = !liked
    setLiked(nextLiked)
    setCount(c => c + (nextLiked ? 1 : -1))
    setBusy(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/like`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Roll back.
        setLiked(!nextLiked)
        setCount(c => c + (nextLiked ? -1 : 1))
        setErr(data?.error || 'Could not save')
      } else {
        // Server is the source of truth.
        setLiked(!!data.liked)
        setCount(Number.isFinite(data.like_count) ? data.like_count : count)
      }
    } catch {
      setLiked(!nextLiked)
      setCount(c => c + (nextLiked ? -1 : 1))
      setErr('Network error')
    }
    setBusy(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike case' : 'Like case'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', minHeight: 38,
        borderRadius: 999,
        background: liked ? '#FEE2E2' : '#fff',
        color: liked ? '#DC2626' : '#475569',
        border: `1px solid ${liked ? '#FECACA' : '#E2E8F0'}`,
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700,
        cursor: busy ? 'wait' : 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
      title={err || (liked ? 'Liked' : 'Like this case')}
    >
      <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>{liked ? '♥' : '♡'}</span>
      <span>{count}</span>
    </button>
  )
}
