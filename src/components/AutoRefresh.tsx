'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  // How often to re-pull server data, in milliseconds. Set high enough that
  // an idle tab doesn't hammer Supabase but low enough that a dentist sitting
  // on the page sees newly booked appointments without manually reloading.
  intervalMs?: number
}

// Client wrapper that periodically calls router.refresh() so the parent
// server component re-runs its data fetches and re-renders with fresh
// counters. Includes a manual ↻ Refresh button for the impatient. The
// "Updated Xs ago" stamp reads as a live signal that the page is alive
// rather than showing a frozen-since-load snapshot.
export default function AutoRefresh({ intervalMs = 60_000 }: Props) {
  const router = useRouter()
  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now())
  const [busy, setBusy] = useState(false)
  // Forces the "Updated Xs ago" label to re-render every 5s so the user sees
  // a moving clock even when no full refresh has fired.
  const [, setTick] = useState(0)

  useEffect(() => {
    const refresh = setInterval(() => {
      router.refresh()
      setLastRefresh(Date.now())
    }, intervalMs)
    const tick = setInterval(() => setTick(t => t + 1), 5_000)
    return () => { clearInterval(refresh); clearInterval(tick) }
  }, [intervalMs, router])

  const ageMs = Date.now() - lastRefresh
  const ageLabel = ageMs < 60_000
    ? `${Math.max(1, Math.floor(ageMs / 1000))}s ago`
    : `${Math.floor(ageMs / 60_000)}m ago`

  function manualRefresh() {
    setBusy(true)
    router.refresh()
    setLastRefresh(Date.now())
    // The fake delay is purely visual — router.refresh() resolves before the
    // server roundtrip completes, and we want the button to stay disabled
    // long enough that a frantic dentist doesn't double-click it five times.
    setTimeout(() => setBusy(false), 800)
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: '#00A878', boxShadow: '0 0 0 4px rgba(0,168,120,0.18)', display: 'inline-block' }} />
        Live · updated {ageLabel}
      </span>
      <button onClick={manualRefresh} disabled={busy}
        style={{
          padding: '6px 12px', minHeight: 32,
          background: busy ? 'var(--bg)' : '#fff',
          color: 'var(--blue)', border: '1px solid var(--border)',
          borderRadius: 8, fontSize: 12, fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'var(--font-body)',
        }}>
        {busy ? '↻ Refreshing…' : '↻ Refresh'}
      </button>
    </div>
  )
}
