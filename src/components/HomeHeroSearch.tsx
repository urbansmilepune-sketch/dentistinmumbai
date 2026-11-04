'use client'

// Homepage hero search: one white bar with a free-text box (Enter goes to
// /search?q=…, same as the header search) and a teal "Near me" button that
// asks for GPS once and opens the /dentists list sorted by distance (same
// behaviour the old "Or find dentists near you" pill had).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NAVY, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'

export default function HomeHeroSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const query = q.trim()
    if (!query) return
    router.push(`/search?q=${encodeURIComponent(query)}`)
  }

  function nearMe() {
    setError(null)
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Location is not supported in this browser. Pick your area below instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        router.push(`/dentists?lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}&page=1`)
      },
      err => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) setError('Location access is blocked. Allow it in your browser settings, or pick your area below.')
        else if (err.code === err.TIMEOUT) setError('Finding your location took too long. Try again.')
        else setError('Could not get your location. Try again, or pick your area below.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <div>
      <form className="hhs" role="search" onSubmit={e => { e.preventDefault(); submit() }}>
        <button type="submit" className="hhs-icon" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
        <input
          className="hhs-input"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search treatments, areas, or dentists"
          enterKeyHint="search"
        />
        <button type="button" className="hhs-near" onClick={nearMe} disabled={locating}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          {locating ? 'Locating…' : 'Near me'}
        </button>
      </form>
      {error && <p className="hhs-err" role="alert">{error}</p>}

      <style jsx>{`
        .hhs {
          display: flex; align-items: center; gap: 4px;
          width: 100%; max-width: 640px;
          background: #fff; border-radius: 14px;
          padding: 6px 6px 6px 6px;
          box-shadow: 0 10px 30px rgba(2,6,23,0.25);
          border: 2px solid transparent;
          transition: border-color .15s;
        }
        .hhs:focus-within { border-color: ${TEAL}; }
        .hhs-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 40px; flex-shrink: 0;
          background: none; border: 0; cursor: pointer; padding: 0;
        }
        .hhs-input {
          flex: 1; min-width: 0; border: 0; outline: none; background: transparent;
          font-family: var(--font-body); font-size: 15px; color: ${NAVY};
          height: 44px; padding: 0 4px;
          -webkit-appearance: none; appearance: none;
        }
        .hhs-input::-webkit-search-decoration,
        .hhs-input::-webkit-search-cancel-button { -webkit-appearance: none; }
        .hhs-input::placeholder { color: #94A3B8; }
        .hhs-near {
          display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
          min-height: 44px; padding: 0 14px;
          background: ${TEAL}; color: #fff; border: 0; border-radius: 10px;
          font-family: var(--font-body); font-weight: 700; font-size: 14px;
          cursor: pointer; white-space: nowrap; transition: background .15s;
        }
        .hhs-near:hover { background: ${TEAL_DARK}; }
        .hhs-near:disabled { cursor: wait; opacity: .85; }
        .hhs-err { margin-top: 10px; font-size: 13px; color: #FECACA; max-width: 640px; }
        @media (max-width: 380px) {
          .hhs-near { padding: 0 10px; font-size: 13px; }
        }
      `}</style>
    </div>
  )
}
