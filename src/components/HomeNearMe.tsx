'use client'

// "Find dentists near you" control for the city homepage hero. Asks for GPS
// once, then routes to the /dentists directory with lat/lng so its distance
// sort takes over. Styled for the navy hero (ghost pill), distinct from the
// /dentists sidebar's NearMeButton which is tied to that page's filter state.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomeNearMe() {
  const router = useRouter()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Location not supported in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        // Keep `locating` true — we're navigating away.
        router.push(`/dentists?lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}&page=1`)
      },
      err => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) setError('Location access denied. You can enable it in your browser settings.')
        else if (err.code === err.POSITION_UNAVAILABLE) setError('Could not determine your location. Try again outdoors or check your GPS.')
        else if (err.code === err.TIMEOUT) setError('Locating timed out. Try again.')
        else setError('Could not get your location. Try again.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <div style={{ marginTop: 20, textAlign: 'center' }}>
      <button type="button" onClick={go} disabled={locating} className="hnm-btn">
        <span aria-hidden="true">📍</span> {locating ? 'Locating you…' : 'Or find dentists near you'}
      </button>
      {error && <p className="hnm-err">{error}</p>}

      <style jsx>{`
        .hnm-btn {
          display: inline-flex; align-items: center; gap: 8px;
          min-height: 44px; padding: 10px 20px;
          background: rgba(255,255,255,0.10); color: #fff;
          border: 1px solid rgba(255,255,255,0.25); border-radius: 999px;
          font-family: var(--font-body); font-weight: 600; font-size: 14px;
          cursor: pointer; transition: background .15s;
        }
        .hnm-btn:hover { background: rgba(255,255,255,0.18); }
        .hnm-btn:disabled { cursor: wait; opacity: .8; }
        .hnm-err { margin-top: 10px; font-size: 13px; color: #FECACA; }
      `}</style>
    </div>
  )
}
