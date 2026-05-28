'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Mobile-only nudge for dentists landing on a patient-focused homepage.
// Desktop hides this via CSS — the dentist strip section already lives
// above the fold there, so the bar would be redundant noise.
//
// Dismissal persists in localStorage so a dentist who closes it once
// isn't pestered every visit. The hydration gate keeps SSR-rendered HTML
// from briefly flashing the bar before the client reads the dismissed
// flag (and avoids the hydration-mismatch warning).
const STORAGE_KEY = 'dim-dentist-sticky-dismissed'

export default function DentistMobileStickyBar() {
  const [hydrated, setHydrated] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setDismissed(true)
    } catch {
      // localStorage can throw in private modes / sandboxed iframes —
      // fall through and treat as undismissed.
    }
    setHydrated(true)
  }, [])

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
  }

  if (!hydrated || dismissed) return null

  return (
    <div
      className="dentist-mobile-sticky"
      style={{
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        zIndex: 90,
        background: 'var(--blue)',
        color: '#fff',
        display: 'none',
        alignItems: 'stretch',
        boxShadow: '0 -6px 16px rgba(0,0,0,0.15)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Link
        href="/for-dentists/register"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 16px',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: 14,
          textDecoration: 'none',
          color: '#fff',
        }}
      >
        🦷 Are you a dentist? List your clinic free →
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          width: 48,
          background: 'transparent',
          border: 'none',
          borderLeft: '1px solid rgba(255,255,255,0.2)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 22,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        ×
      </button>
      <style>{`
        @media (max-width: 768px) {
          .dentist-mobile-sticky { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
