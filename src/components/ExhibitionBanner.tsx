'use client'

import { useEffect, useState } from 'react'

// localStorage flag — once the dentist/patient dismisses the banner we keep
// it gone across reloads and navigations. Bump the suffix to re-show after a
// future campaign rather than reusing this key.
const DISMISS_KEY = 'famdent-banner-dismissed'

export default function ExhibitionBanner() {
  // Render nothing until mounted so the server markup (no banner) matches the
  // client's first paint — avoids a hydration mismatch — and so a visitor who
  // already dismissed never sees a flash of the banner before it's hidden.
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      // Private-mode / storage-disabled: just show the banner this session.
    }
    setMounted(true)
  }, [])

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  if (!mounted || dismissed) return null

  return (
    <div
      role="region"
      aria-label="Announcement"
      className="exhibition-banner"
      style={{
        width: '100%',
        background: '#FF6135',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 44px',
        position: 'relative',
        textAlign: 'center',
      }}
    >
      <span className="exhibition-banner-text" style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4 }}>
        🦷 Meet us at Famdent Exhibition! Stall No. B-62 — Visit DentistIn and list your clinic for free!
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.18)',
          border: 'none',
          borderRadius: '50%',
          color: '#fff',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>

      <style>{`
        @media (max-width: 768px) {
          .exhibition-banner { padding: 9px 40px !important; }
          .exhibition-banner-text { font-size: 12.5px !important; }
        }
      `}</style>
    </div>
  )
}
