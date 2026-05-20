'use client'

// Follow / unfollow button for /professional/[slug]. Same optimistic
// pattern as LikeButton: flip the state + count locally on click,
// reconcile with the server response, roll back on failure.

import { useState } from 'react'

interface Props {
  slug: string
  /** False when the current viewer is the profile owner; the parent
   *  shouldn't render the button in that case but we no-op defensively. */
  signedIn: boolean
  isOwn: boolean
  initialFollowing: boolean
  initialFollowerCount: number
}

export default function FollowButton({ slug, signedIn, isOwn, initialFollowing, initialFollowerCount }: Props) {
  const [following, setFollowing] = useState(initialFollowing)
  const [count, setCount] = useState(initialFollowerCount)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (isOwn) return null

  async function toggle() {
    setErr('')
    if (!signedIn) {
      window.location.href = `/for-dentists/login?next=/professional/${slug}`
      return
    }
    if (busy) return
    const nextF = !following
    setFollowing(nextF)
    setCount(c => c + (nextF ? 1 : -1))
    setBusy(true)
    try {
      const res = await fetch(`/api/professional/${slug}/follow`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFollowing(!nextF)
        setCount(c => c + (nextF ? -1 : 1))
        setErr(data?.error || 'Could not save')
      } else {
        setFollowing(!!data.following)
        setCount(Number.isFinite(data.follower_count) ? data.follower_count : count)
      }
    } catch {
      setFollowing(!nextF)
      setCount(c => c + (nextF ? -1 : 1))
      setErr('Network error')
    }
    setBusy(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      title={err}
      style={{
        padding: '9px 18px', minHeight: 40,
        borderRadius: 999,
        background: following ? '#fff' : '#1D4ED8',
        color: following ? '#0F1923' : '#fff',
        border: `1.5px solid ${following ? '#0F1923' : '#1D4ED8'}`,
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700,
        cursor: busy ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {following ? '✓ Following' : '+ Follow'}
    </button>
  )
}
