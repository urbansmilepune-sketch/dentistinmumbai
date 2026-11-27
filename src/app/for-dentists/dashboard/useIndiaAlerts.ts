'use client'

// Unseen DentistIn India alerts for the signed-in dentist, for the
// "My India profile" button and card in the city dashboard. One request per
// page load, shared by every caller on the page.
import { useEffect, useState } from 'react'

type Summary = { unseen: number; line: string }
let pending: Promise<Summary> | null = null

function load(): Promise<Summary> {
  if (!pending) {
    pending = fetch('/api/network-alerts?limit=1', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => ({ unseen: Number(j?.unseen) || 0, line: String(j?.line || '') }))
      .catch(() => ({ unseen: 0, line: '' }))
    // Refresh on the next page load, not on every re-render.
    setTimeout(() => { pending = null }, 60_000)
  }
  return pending
}

export function useIndiaAlerts(enabled = true): Summary {
  const [s, setS] = useState<Summary>({ unseen: 0, line: '' })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    load().then(v => { if (alive) setS(v) })
    return () => { alive = false }
  }, [enabled])
  return s
}

/** One-tap sign-in to dentistinindia.in, landing on home, alerts or post. */
export function indiaHref(page: 'home' | 'alerts' | 'post'): string {
  return `/api/auth/india-handoff?next=${page}`
}
