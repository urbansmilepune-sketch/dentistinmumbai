'use client'

// Mobile-first filter/sort pill bar shared by the area and treatment result
// pages. Generalised from the area page's original AreaFilters — the only
// route-specific bit is `basePath` (e.g. "/area/goregaon-east" or
// "/treatment/dental-implants"), which every pill pushes its updated query
// string onto.
//
// Every pill drives a real query param the server page reads and applies:
//   sort row    — Use my location (lat/lng GPS), Open now, Top rated (sort=rating),
//                 Lowest fee (sort=fee)
//   filter row  — Female dentist (gender=female), Verified, EMI (emi=true)
//
// Geolocation mirrors NearMeButton's getCurrentPosition flow, inlined here so
// the location control lives in the same navy/teal pill bar.

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { NAVY, TEAL } from '@/app/dentist/[slug]/profileTheme'
import { MapPinIcon, ClockIcon, StarIcon, ShieldCheckIcon, CardIcon, GenderFemaleIcon } from '@/app/dentist/[slug]/profileIcons'

interface Props { basePath: string }

export default function ResultFilters({ basePath }: Props) {
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

  function push(p: URLSearchParams) {
    router.push(`${basePath}${p.toString() ? `?${p.toString()}` : ''}`)
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
    <div className="rfl">
      <div className="rfl-row" role="group" aria-label="Sort dentists">
        <button className={`rfl-pill ${hasCoords ? 'rfl-on' : ''}`} onClick={hasCoords ? clearLocation : requestLocation} disabled={locating}>
          <MapPinIcon size={14} color={hasCoords ? '#fff' : TEAL} />
          {locating ? 'Locating…' : hasCoords ? 'Nearest · clear' : 'Use my location'}
        </button>
        <button className={`rfl-pill ${openActive ? 'rfl-on' : ''}`} onClick={() => toggle('open')}>
          <ClockIcon size={14} color={openActive ? '#fff' : TEAL} /> Open now
        </button>
        <button className={`rfl-pill ${sort === 'rating' ? 'rfl-on' : ''}`} onClick={() => setSort('rating')}>
          <StarIcon size={14} color={sort === 'rating' ? '#fff' : '#F59E0B'} /> Top rated
        </button>
        <button className={`rfl-pill ${sort === 'fee' ? 'rfl-on' : ''}`} onClick={() => setSort('fee')}>
          <span className="rfl-rupee">₹</span> Lowest fee
        </button>
      </div>

      <div className="rfl-row" role="group" aria-label="Filter dentists">
        <button className={`rfl-pill ${genderActive ? 'rfl-on' : ''}`} onClick={() => toggle('gender', 'female')}>
          <GenderFemaleIcon size={14} color={genderActive ? '#fff' : TEAL} /> Female dentist
        </button>
        <button className={`rfl-pill ${verifiedActive ? 'rfl-on' : ''}`} onClick={() => toggle('verified')}>
          <ShieldCheckIcon size={14} color={verifiedActive ? '#fff' : TEAL} /> Verified
        </button>
        <button className={`rfl-pill ${emiActive ? 'rfl-on' : ''}`} onClick={() => toggle('emi')}>
          <CardIcon size={14} color={emiActive ? '#fff' : TEAL} /> EMI
        </button>
      </div>

      {error && <p className="rfl-error">{error}</p>}

      <style>{`
        .rfl { display: flex; flex-direction: column; gap: 10px; }
        .rfl-row {
          display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        .rfl-row::-webkit-scrollbar { display: none; }
        .rfl-pill {
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0;
          min-height: 40px; padding: 0 14px; border-radius: 22px;
          background: #fff; color: ${NAVY}; border: 1.5px solid #E2E8F0;
          font-family: var(--font-body); font-weight: 600; font-size: 13px; cursor: pointer;
          transition: background .15s, border-color .15s, color .15s;
        }
        .rfl-pill:hover { border-color: ${TEAL}; }
        .rfl-pill:disabled { cursor: wait; opacity: .7; }
        .rfl-on { background: ${TEAL}; color: #fff; border-color: ${TEAL}; }
        .rfl-rupee { font-weight: 800; font-size: 14px; }
        .rfl-error { font-size: 12px; color: #991B1B; background: #FEE2E2; border: 1px solid #FECACA; border-radius: 8px; padding: 8px 10px; margin: 0; }
      `}</style>
    </div>
  )
}
