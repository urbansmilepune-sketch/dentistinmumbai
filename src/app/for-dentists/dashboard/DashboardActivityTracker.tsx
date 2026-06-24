'use client'

// Fire-and-forget dashboard activity beacon. Mounted once in the dashboard
// layout; on every dashboard route change it pings /api/analytics/dashboard-
// activity, which resolves the acting dentist server-side and logs the visit
// (and a session-start login the first time per browser tab session). This is
// what populates the admin "Dentist Health" activity view — logins, sessions,
// and which dashboard sections get used. Renders nothing.

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const SESSION_FLAG = 'din_dash_session'

export default function DashboardActivityTracker() {
  const pathname = usePathname()
  // Guard against double-firing for the same path (e.g. a re-render that
  // doesn't actually change the route).
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return
    lastPath.current = pathname

    // First visit in this browser-tab session counts as a login. sessionStorage
    // clears when the tab closes, so re-opening the dashboard logs a fresh
    // session — which is exactly what "Total sessions" should count.
    let sessionStart = false
    try {
      if (!sessionStorage.getItem(SESSION_FLAG)) {
        sessionStart = true
        sessionStorage.setItem(SESSION_FLAG, '1')
      }
    } catch {
      // sessionStorage can throw in locked-down/private contexts — just skip
      // the login flag rather than break tracking entirely.
    }

    fetch('/api/analytics/dashboard-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, sessionStart }),
      keepalive: true,
    }).catch(() => { /* analytics must never disrupt the dashboard */ })
  }, [pathname])

  return null
}
