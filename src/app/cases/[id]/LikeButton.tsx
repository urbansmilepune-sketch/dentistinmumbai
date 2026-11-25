'use client'

// Like + count on /cases/[id] (v1 network). Optimistic: flips locally,
// then takes the server's count. The author sees the count only.

import { useState } from 'react'

interface Props {
  caseId: string
  initialLiked: boolean
  initialCount: number
  isOwn: boolean
}

export default function LikeButton({ caseId, initialLiked, initialCount, isOwn }: Props) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (isOwn) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 38, fontSize: 13, fontWeight: 700, color: '#475569' }}>
        👍 {count} dentist{count === 1 ? '' : 's'} liked this
      </span>
    )
  }

  async function toggle() {
    if (busy) return
    setErr('')
    const next = !liked
    setLiked(next)
    setCount(c => Math.max(0, c + (next ? 1 : -1)))
    setBusy(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/like`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not save')
      setLiked(!!data.liked)
      if (Number.isFinite(data.like_count)) setCount(data.like_count)
    } catch (e: any) {
      setLiked(!next)
      setCount(c => Math.max(0, c + (next ? -1 : 1)))
      setErr(e?.message || 'Could not save')
    }
    setBusy(false)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={liked}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 14px', borderRadius: 999,
          background: liked ? '#1D4ED8' : '#fff', color: liked ? '#fff' : '#1D4ED8',
          border: '1px solid #1D4ED8', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
        }}>
        <span aria-hidden>👍</span>{liked ? 'Liked' : 'Like'} · {count}
      </button>
      {err && <span style={{ fontSize: 12, color: '#B91C1C', fontWeight: 600 }}>{err}</span>}
    </span>
  )
}
