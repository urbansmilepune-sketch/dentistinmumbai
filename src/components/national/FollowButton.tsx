'use client'

// Follow / Following toggle for another dentist (v1 network). Never shown
// on a dentist's own profile, case or card. New cases from people you
// follow land in the case library's Following tab and in the weekly
// follow digest.
//
// On the expert / discover cards (Nov 2026) it is also shown to visitors
// who aren't signed in: a tap sends them to dentist sign-in, which brings
// them back with ?follow=<slug> so the follow happens on return
// (autoFollow).

import { useEffect, useRef, useState } from 'react'

interface Props {
  slug: string
  initialFollowing: boolean
  /** Smaller pill for inline use next to a name. */
  compact?: boolean
  /** false = visitor isn't a signed-in dentist; a tap goes to sign-in. */
  signedIn?: boolean
  /** Follow straight away on load (back from sign-in with ?follow=). */
  autoFollow?: boolean
  /** Put the error line under the button instead of beside it. */
  stacked?: boolean
}

function goToSignIn(slug: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('follow', slug)
  const next = url.pathname + url.search
  window.location.href = `/for-dentists/login?next=${encodeURIComponent(next)}`
}

export default function FollowButton({ slug, initialFollowing, compact, signedIn = true, autoFollow, stacked }: Props) {
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const autoDone = useRef(false)

  async function toggle() {
    if (busy) return
    if (!signedIn) { goToSignIn(slug); return }
    setErr('')
    const next = !following
    setFollowing(next)
    setBusy(true)
    try {
      const res = await fetch(`/api/professional/${encodeURIComponent(slug)}/follow`, { method: 'POST' })
      if (res.status === 401) { setFollowing(!next); setBusy(false); goToSignIn(slug); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not save')
      setFollowing(!!data.following)
    } catch (e: any) {
      setFollowing(!next)
      setErr(e?.message || 'Could not save')
    }
    setBusy(false)
  }

  // Back from sign-in: follow once, then drop ?follow= from the address
  // so a refresh or shared link doesn't repeat it.
  useEffect(() => {
    if (!autoFollow || autoDone.current) return
    autoDone.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete('follow')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    if (signedIn && !initialFollowing) queueMicrotask(() => { toggle() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span style={{ display: 'inline-flex', flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-end' : 'center', gap: stacked ? 4 : 6 }}>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={signedIn ? following : undefined}
        style={{
          minHeight: compact ? 32 : 44, padding: compact ? '0 12px' : '0 18px', borderRadius: compact ? 999 : 10,
          background: following ? '#fff' : '#0F1923', color: following ? '#0F1923' : '#fff',
          border: '1px solid #0F1923', fontFamily: 'var(--font-body)', fontSize: compact ? 12 : 15, fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        }}>
        {following ? 'Following ✓' : '+ Follow'}
      </button>
      {err && <span style={{ fontSize: 12, color: '#B91C1C', fontWeight: 600, maxWidth: stacked ? 160 : undefined, textAlign: stacked ? 'right' : undefined }}>{err}</span>}
    </span>
  )
}
