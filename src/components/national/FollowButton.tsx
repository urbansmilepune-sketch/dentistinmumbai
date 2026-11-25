'use client'

// Follow / Following toggle for another dentist (v1 network). Shown only
// to signed-in dentists, never on their own profile or case. New cases
// from people you follow land in the case library's Following tab and in
// the weekly follow digest.

import { useState } from 'react'

interface Props {
  slug: string
  initialFollowing: boolean
  /** Smaller pill for inline use next to a name. */
  compact?: boolean
}

export default function FollowButton({ slug, initialFollowing, compact }: Props) {
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function toggle() {
    if (busy) return
    setErr('')
    const next = !following
    setFollowing(next)
    setBusy(true)
    try {
      const res = await fetch(`/api/professional/${encodeURIComponent(slug)}/follow`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not save')
      setFollowing(!!data.following)
    } catch (e: any) {
      setFollowing(!next)
      setErr(e?.message || 'Could not save')
    }
    setBusy(false)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={following}
        style={{
          minHeight: compact ? 32 : 44, padding: compact ? '0 12px' : '0 18px', borderRadius: compact ? 999 : 10,
          background: following ? '#fff' : '#0F1923', color: following ? '#0F1923' : '#fff',
          border: '1px solid #0F1923', fontFamily: 'var(--font-body)', fontSize: compact ? 12 : 15, fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        }}>
        {following ? 'Following ✓' : '+ Follow'}
      </button>
      {err && <span style={{ fontSize: 12, color: '#B91C1C', fontWeight: 600 }}>{err}</span>}
    </span>
  )
}
