'use client'

// Mobile-first filter/sort bar for the area page. Replaces the old QuickFilters
// on this route (the nested area+treatment route still uses QuickFilters).
//
// Every pill drives a real query param the server page reads and applies:
//   sort row    — Use my location (lat/lng GPS), Open now, Top rated (sort=rating),
//                 Lowest fee (sort=fee)
//   filter row  — Female dentist (gender=female), Verified, EMI, 4★ & up (rating=4)
//
// Geolocation mirrors NearMeButton's proven getCurrentPosition flow, inlined
// here so the location control lives in the same navy/teal pill bar rather than
// the blue-styled sidebar button NearMeButton renders on /dentists.

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { NAVY, TEAL } from '@/app/dentist/[slug]/profileTheme'
import { MapPinIcon, ClockIcon, StarIcon, ShieldCheckIcon, CardIcon, GenderFemaleIcon } from '@/app/dentist/[slug]/profileIcons'

interface Props { areaSlug: string }

export default function AreaFilters({ areaSlug }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasCoords = !!sp.get('lat') && !!sp.get('lng')
  const sort = sp.get('sort') || ''
  const genderActive = sp.get('gender') === 'female'
  const verifiedActive = sp.get('verified') === 'true'
  const emiActive = sp.get('emi') === 'true'
  const openActive = sp.get('open') === 'true'
  const ratingActive = sp.get('rating') === '4'

  function push(p: URLSearchParams) {
    router.push(`/area/${areaSlug}${p.toString() ? `?${p.toString()}` : ''}`)
  }
  function toggle(key: string, value = 'true') {
    const p = new URLSearchParams(sp.toString())
    if (p.get(key) === value) p.delete(key)
    else p.set(key, value)
    push(p)
  }
  function setSort(value: string) {
    const p = new URLSearchParams(sp.toString())
    if (p.get('sort') === value) p.delete('sort')
    else p.set('sort', value)
    push(p)
  }
  function requestLocation() {
    setError(null)
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Location not supported in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const p = new URLSearchParams(sp.toString())
        p.set('lat', pos.coords.latitude.toFixed(5))
        p.set('lng', pos.coords.longitude.toFixed(5))
        setLocating(false)
        push(p)
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
    const p = new URLSearchParams(sp.toString())
    p.delete('lat')
    p.delete('lng')
    push(p)
  }

  return (
    <div className="afl">
      <div className="afl-row" role="group" aria-label="Sort dentists">
        <button className={`afl-pill ${hasCoords ? 'afl-on' : ''}`} onClick={hasCoords ? clearLocation : requestLocation} disabled={locating}>
          <MapPinIcon size={14} color={hasCoords ? '#fff' : TEAL} />
          {locating ? 'Locating…' : hasCoords ? 'Nearest · clear' : 'Use my location'}
        </button>
        <button className={`afl-pill ${openActive ? 'afl-on' : ''}`} onClick={() => toggle('open')}>
          <ClockIcon size={14} color={openActive ? '#fff' : TEAL} /> Open now
        </button>
        <button className={`afl-pill ${sort === 'rating' ? 'afl-on' : ''}`} onClick={() => setSort('rating')}>
          <StarIcon size={14} color={sort === 'rating' ? '#fff' : '#F59E0B'} /> Top rated
        </button>
        <button className={`afl-pill ${sort === 'fee' ? 'afl-on' : ''}`} onClick={() => setSort('fee')}>
          <span className="afl-rupee">₹</span> Lowest fee
        </button>
      </div>

      <div className="afl-row" role="group" aria-label="Filter dentists">
        <button className={`afl-pill ${genderActive ? 'afl-on' : ''}`} onClick={() => toggle('gender', 'female')}>
          <GenderFemaleIcon size={14} color={genderActive ? '#fff' : TEAL} /> Female dentist
        </button>
        <button className={`afl-pill ${verifiedActive ? 'afl-on' : ''}`} onClick={() => toggle('verified')}>
          <ShieldCheckIcon size={14} color={verifiedActive ? '#fff' : TEAL} /> Verified
        </button>
        <button className={`afl-pill ${emiActive ? 'afl-on' : ''}`} onClick={() => toggle('emi')}>
          <CardIcon size={14} color={emiActive ? '#fff' : TEAL} /> EMI
        </button>
        <button className={`afl-pill ${ratingActive ? 'afl-on' : ''}`} onClick={() => toggle('rating', '4')}>
          <StarIcon size={14} color={ratingActive ? '#fff' : '#F59E0B'} /> 4★ &amp; up
        </button>
      </div>

      {error && <p className="afl-error">{error}</p>}

      <style>{`
        .afl { display: flex; flex-direction: column; gap: 10px; }
        .afl-row {
          display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        .afl-row::-webkit-scrollbar { display: none; }
        .afl-pill {
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0;
          min-height: 40px; padding: 0 14px; border-radius: 22px;
          background: #fff; color: ${NAVY}; border: 1.5px solid #E2E8F0;
          font-family: var(--font-body); font-weight: 600; font-size: 13px; cursor: pointer;
          transition: background .15s, border-color .15s, color .15s;
        }
        .afl-pill:hover { border-color: ${TEAL}; }
        .afl-pill:disabled { cursor: wait; opacity: .7; }
        .afl-on { background: ${TEAL}; color: #fff; border-color: ${TEAL}; }
        .afl-rupee { font-weight: 800; font-size: 14px; }
        .afl-error { font-size: 12px; color: #991B1B; background: #FEE2E2; border: 1px solid #FECACA; border-radius: 8px; padding: 8px 10px; margin: 0; }
      `}</style>
    </div>
  )
}
