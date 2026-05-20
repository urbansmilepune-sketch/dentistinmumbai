'use client'

// Tiny client island: records the timestamp of the freshest case in
// this view to localStorage. The NationalShell nav reads the same key
// to decide whether to show the "new content" notification dot on the
// "My Feed" link from anywhere else on the site.

import { useEffect } from 'react'

const KEY = 'dentistinindia.feed.lastSeen'

export default function FeedLastSeen({ newestCaseAt }: { newestCaseAt: string | null }) {
  useEffect(() => {
    if (!newestCaseAt) return
    try {
      window.localStorage.setItem(KEY, newestCaseAt)
    } catch {
      /* private mode / quota — ignore */
    }
  }, [newestCaseAt])
  return null
}
