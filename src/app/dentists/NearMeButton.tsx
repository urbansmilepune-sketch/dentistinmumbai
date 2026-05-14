'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  active: boolean
}

export default function NearMeButton({ active }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function requestLocation() {
    setError(null)
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Location not supported in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        const p = new URLSearchParams(searchParams.toString())
        p.set('lat', latitude.toFixed(5))
        p.set('lng', longitude.toFixed(5))
        p.set('page', '1')
        setLocating(false)
        startTransition(() => router.push(`/dentists?${p.toString()}`))
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

  function clearLocation() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('lat')
    p.delete('lng')
    p.set('page', '1')
    startTransition(() => router.push(`/dentists?${p.toString()}`))
  }

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={active ? clearLocation : requestLocation}
        disabled={locating}
        style={{
          width: '100%', padding: '11px 14px', minHeight: 44,
          background: active ? 'var(--blue)' : 'var(--blue-light)',
          color: active ? '#fff' : 'var(--blue-dark)',
          border: `1.5px solid ${active ? 'var(--blue)' : '#BFDBFE'}`,
          borderRadius: 10,
          fontSize: 14, fontWeight: 700, cursor: locating ? 'wait' : 'pointer',
          fontFamily: 'var(--font-body)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {locating ? '⏳ Locating you…' : active ? '✕ Clear location' : '📍 Near Me'}
      </button>
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#991B1B', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px' }}>
          {error}
        </p>
      )}
    </div>
  )
}
