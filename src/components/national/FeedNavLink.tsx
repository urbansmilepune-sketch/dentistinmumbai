'use client'

// "My Feed" nav link with a notification dot for unread cases. Reads
// the last-seen timestamp /feed wrote to localStorage and pings a
// small HEAD-style fetch against /api/india/feed to detect whether
// there's anything newer.
//
// On error or no last-seen we just render the link without a dot —
// no spinner, no error UI in the nav.

import { useEffect, useState } from 'react'
import Link from 'next/link'

const KEY = 'dentistinindia.feed.lastSeen'

export default function FeedNavLink() {
  const [hasNew, setHasNew] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const lastSeen = window.localStorage.getItem(KEY)
        if (!lastSeen) return
        const res = await fetch('/api/india/feed', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const cases = Array.isArray(data?.cases) ? data.cases : []
        if (cases.length === 0) return
        const newestAt = cases[0]?.created_at
        if (!newestAt) return
        if (!cancelled && new Date(newestAt).getTime() > new Date(lastSeen).getTime()) {
          setHasNew(true)
        }
      } catch { /* nav stays dot-free on any error */ }
    }
    check()
    return () => { cancelled = true }
  }, [])

  return (
    <Link href="/feed" style={{ position: 'relative', color: '#1D4ED8', textDecoration: 'none', fontWeight: 700 }}>
      My Feed
      {hasNew && (
        <span aria-label="New cases since your last visit" style={{ position: 'absolute', top: -2, right: -8, width: 8, height: 8, borderRadius: '50%', background: '#DC2626' }} />
      )}
    </Link>
  )
}
