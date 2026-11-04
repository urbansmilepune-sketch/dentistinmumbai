'use client'

// "Never miss a booking" card. Rendered by the dentist dashboard layout, so it
// appears on whichever page the app opens to.
// - Shown only inside the installed app (home-screen / desktop app), while
//   the phone hasn't been asked yet. "Later" hides it for 7 days.
// - Phones that already turned alerts on are quietly re-synced with the
//   server once per app session, so a rotated subscription keeps working.
// Settings live at More → Notifications (src/app/for-dentists/dashboard/notifications).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ALERTS_PAGE, currentSubscription, fetchStatus, isStandalone, pushSupported, saveSubscription, turnOnAlerts } from '@/lib/pushClient'

const NAVY = '#0F172A'
const TEAL = '#14B8A6'
const LATER_KEY = 'din_push_later_at'
const SYNC_KEY = 'din_push_synced'
const LATER_DAYS = 7

function laterActive(): boolean {
  try {
    const at = Number(localStorage.getItem(LATER_KEY) || '0')
    return at > 0 && Date.now() - at < LATER_DAYS * 86400000
  } catch {
    return false
  }
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

export default function PushAlertsCard() {
  const pathname = usePathname()
  const [mode, setMode] = useState<'hidden' | 'ask' | 'working' | 'done' | 'blocked' | 'error'>('hidden')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pushSupported()) return
    let cancelled = false

    const run = async () => {
      if (Notification.permission === 'granted') {
        // Already on: make sure the server still has this phone.
        try {
          if (sessionStorage.getItem(SYNC_KEY)) return
          const sub = await currentSubscription()
          if (sub) {
            const res = await saveSubscription(sub)
            if (res.ok) sessionStorage.setItem(SYNC_KEY, '1')
          }
        } catch { /* try again next open */ }
        return
      }
      if (Notification.permission !== 'default') return
      if (!isStandalone() || laterActive()) return
      const status = await fetchStatus()
      if (cancelled || !status?.configured) return
      setMode('ask')
    }
    const timer = window.setTimeout(run, 1500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [])

  if (mode === 'hidden' || pathname === ALERTS_PAGE) return null

  const later = () => {
    try { localStorage.setItem(LATER_KEY, String(Date.now())) } catch { /* ignore */ }
    setMode('hidden')
  }

  const turnOn = async () => {
    setMode('working')
    const r = await turnOnAlerts()
    if (r.result === 'on') {
      try { sessionStorage.setItem(SYNC_KEY, '1') } catch { /* ignore */ }
      setMode('done')
      window.setTimeout(() => setMode('hidden'), 5000)
    } else if (r.result === 'denied') {
      setMode('blocked')
    } else if (r.result === 'dismissed') {
      later()
    } else {
      setError(r.error)
      setMode('error')
    }
  }

  const btn: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '11px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div role="region" aria-label="Booking alerts"
      style={{ background: NAVY, color: '#fff', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, boxShadow: '0 10px 24px rgba(15,23,42,.18)', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(20,184,166,.18)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><BellIcon /></span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {mode === 'done' ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>Alerts are on</div>
              <div style={{ fontSize: 13, color: '#CBD5E1' }}>You will get a ping on this phone for every new booking.</div>
            </>
          ) : mode === 'blocked' ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>Alerts are blocked on this phone</div>
              <div style={{ fontSize: 13, color: '#CBD5E1' }}>To turn them on, open your phone&apos;s Settings, find DentistIn, then allow Notifications.</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>Never miss a booking</div>
              <div style={{ fontSize: 13, color: '#CBD5E1' }}>Get a phone alert the moment a patient books online, even when the app is closed.</div>
            </>
          )}
        </div>
      </div>
      {(mode === 'ask' || mode === 'working' || mode === 'error') && (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#E2E8F0', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <li>New booking requests</li>
            <li>Patient changed or cancelled</li>
            <li>New review</li>
          </ul>
          {mode === 'error' && <div role="alert" style={{ fontSize: 13, color: '#FCA5A5' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={turnOn} disabled={mode === 'working'}
              style={{ ...btn, flex: 1, background: TEAL, color: '#042F2E', opacity: mode === 'working' ? 0.7 : 1 }}>
              {mode === 'working' ? 'Turning on…' : mode === 'error' ? 'Try again' : 'Turn on alerts'}
            </button>
            <button type="button" onClick={later} style={{ ...btn, background: 'transparent', color: '#CBD5E1' }}>Later</button>
          </div>
        </>
      )}
      {mode === 'blocked' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={ALERTS_PAGE} style={{ ...btn, flex: 1, background: 'rgba(255,255,255,.1)', color: '#fff', textAlign: 'center', textDecoration: 'none' }}>Alert settings</Link>
          <button type="button" onClick={later} style={{ ...btn, background: 'transparent', color: '#CBD5E1' }}>Close</button>
        </div>
      )}
    </div>
  )
}
