'use client'

// "Find your clinic on Google": the dentist types their clinic name, picks it
// from Google's suggestions (Places API New, called from the browser with a
// key locked to our domains), confirms the listing, and we save its place ID.
// After that the guide can open their exact Google listing with one tap.
// Google itself still needs the dentist to paste the booking link: no public
// API lets us add the Book button for them.

import { useEffect, useRef, useState } from 'react'
import { NAVY, TEAL, TEAL_SOFT } from '@/app/dentist/[slug]/profileTheme'
import { googleListingUrl } from '@/lib/googleBooking'

export type GooglePlace = {
  id: string
  name: string
  address: string
  rating: number | null
  reviews: number | null
  mapsUrl: string
}

type Suggestion = { placeId: string; main: string; secondary: string }
type Mode = 'search' | 'confirm' | 'linked' | 'notfound'

const PLACES = 'https://places.googleapis.com/v1'
const DETAIL_FIELDS = 'id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri'

const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }
const btn = (kind: 'primary' | 'dark' | 'plain'): React.CSSProperties => ({
  height: 46, borderRadius: 12, width: '100%', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none',
  ...(kind === 'primary' ? { background: TEAL, border: `1px solid ${TEAL}`, color: '#fff' }
    : kind === 'dark' ? { background: NAVY, border: `1px solid ${NAVY}`, color: '#fff' }
      : { background: '#fff', border: '1px solid var(--border)', color: 'var(--text)' }),
})

function newSessionToken(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

async function fetchPlace(apiKey: string, placeId: string, sessionToken?: string): Promise<GooglePlace> {
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''
  const res = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}${qs}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAIL_FIELDS },
  })
  if (!res.ok) throw new Error('details')
  const p = await res.json()
  return {
    id: p.id || placeId,
    name: p.displayName?.text || 'Your clinic',
    address: p.formattedAddress || '',
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    mapsUrl: p.googleMapsUri || googleListingUrl(placeId),
  }
}

function ListingCard({ place, strong }: { place: GooglePlace; strong?: boolean }) {
  return (
    <div style={{ border: strong ? `2px solid ${TEAL}` : '1px solid var(--border)', borderRadius: 14, padding: 12, display: 'grid', gap: 4 }}>
      <b style={{ fontSize: 15 }}>{place.name}</b>
      {place.rating !== null && (
        <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>
          ★ {place.rating.toFixed(1)}{' '}
          {place.reviews !== null && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({place.reviews.toLocaleString('en-IN')} Google reviews)</span>}
        </span>
      )}
      {place.address && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{place.address}</span>}
    </div>
  )
}

export default function ClinicFinder({
  apiKey, initialPlaceId, defaultQuery, lat, lng, whatsAppHref, onPlaceChange,
}: {
  apiKey: string
  initialPlaceId: string | null
  defaultQuery: string
  lat: number
  lng: number
  whatsAppHref: string
  onPlaceChange: (place: GooglePlace | null) => void
}) {
  const [mode, setMode] = useState<Mode>(initialPlaceId ? 'linked' : 'search')
  const [query, setQuery] = useState(defaultQuery)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searched, setSearched] = useState(false)
  const [place, setPlace] = useState<GooglePlace | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sessionRef = useRef<string>(newSessionToken())

  // Load the saved listing once so the dentist sees which one is linked.
  useEffect(() => {
    if (!initialPlaceId) return
    let cancelled = false
    fetchPlace(apiKey, initialPlaceId)
      .then(p => { if (!cancelled) { setPlace(p); onPlaceChange(p) } })
      .catch(() => {
        if (cancelled) return
        const fallback: GooglePlace = { id: initialPlaceId, name: 'Your Google listing', address: '', rating: null, reviews: null, mapsUrl: googleListingUrl(initialPlaceId) }
        setPlace(fallback); onPlaceChange(fallback)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, initialPlaceId])

  // Ask Google for suggestions as the dentist types (debounced).
  useEffect(() => {
    if (mode !== 'search') return
    const input = query.trim()
    if (input.length < 3) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${PLACES}/places:autocomplete`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
          body: JSON.stringify({
            input,
            sessionToken: sessionRef.current,
            includedRegionCodes: ['in'],
            locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } },
          }),
        })
        if (!res.ok) throw new Error('autocomplete')
        const data = await res.json()
        type Raw = { placePrediction?: { placeId?: string; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }; text?: { text?: string } } }
        const list: Suggestion[] = ((data.suggestions || []) as Raw[])
          .map(s => s.placePrediction)
          .filter((p): p is NonNullable<Raw['placePrediction']> => !!p?.placeId)
          .slice(0, 5)
          .map(p => ({
            placeId: p.placeId!,
            main: p.structuredFormat?.mainText?.text || p.text?.text || '',
            secondary: p.structuredFormat?.secondaryText?.text || '',
          }))
        setSuggestions(list); setSearched(true); setError('')
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setSuggestions([]); setSearched(true)
        setError("Google search isn't working right now. You can still use the steps below.")
      }
    }, 300)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query, mode, apiKey, lat, lng])

  async function pick(s: Suggestion) {
    setBusy(true); setError('')
    try {
      const p = await fetchPlace(apiKey, s.placeId, sessionRef.current)
      sessionRef.current = newSessionToken()
      setPlace(p); setMode('confirm')
    } catch {
      setError("Couldn't load that listing from Google. Please try again.")
    } finally { setBusy(false) }
  }

  async function save(next: GooglePlace | null) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/dentist/google-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: next ? next.id : null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not save. Please try again.')
      onPlaceChange(next)
      if (next) { setPlace(next); setMode('linked') } else { setPlace(null); setMode('search') }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    } finally { setBusy(false) }
  }

  const longEnough = query.trim().length >= 3
  const errorLine = error ? <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B91C1C' }}>{error}</p> : null

  if (mode === 'linked') {
    return (
      <div style={card}>
        <b style={{ fontSize: 14 }}>Your Google listing</b>
        {place ? <ListingCard place={place} /> : <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Loading from Google…</p>}
        {place && <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" style={btn('dark')}>Open my Google listing ↗</a>}
        <button type="button" onClick={() => save(null)} disabled={busy} style={btn('plain')}>Change clinic</button>
        {errorLine}
      </div>
    )
  }

  if (mode === 'confirm' && place) {
    return (
      <div style={card}>
        <b style={{ fontSize: 16, fontFamily: 'var(--font-heading)' }}>Is this your clinic?</b>
        <ListingCard place={place} strong />
        <button type="button" onClick={() => save(place)} disabled={busy} style={btn('primary')}>{busy ? 'Saving…' : 'Yes, this is my clinic'}</button>
        <button type="button" onClick={() => { setMode('search'); setPlace(null) }} disabled={busy} style={btn('plain')}>Pick a different one</button>
        {errorLine}
      </div>
    )
  }

  if (mode === 'notfound') {
    return (
      <div style={card}>
        <span style={{ justifySelf: 'start', background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>Not on Google yet</span>
        <b style={{ fontSize: 16, fontFamily: 'var(--font-heading)' }}>Your clinic needs a Google listing first</b>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>Patients search &quot;dentist near me&quot; on Google Maps. Without a listing they can&apos;t find you there. It&apos;s free and takes about 10 minutes, plus a Google check that can take a few days.</p>
        <a href="https://business.google.com/create" target="_blank" rel="noopener noreferrer" style={btn('dark')}>Create free Google listing ↗</a>
        <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" style={{ ...btn('plain'), background: '#25D366', borderColor: '#25D366', color: '#fff' }}>Send me the steps on WhatsApp</a>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Come back here after Google approves it and we&apos;ll add the Book button.</p>
        <button type="button" onClick={() => setMode('search')} style={btn('plain')}>Search again</button>
      </div>
    )
  }

  return (
    <div style={card}>
      <b style={{ fontSize: 16, fontFamily: 'var(--font-heading)' }}>Find your clinic on Google</b>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Type your clinic name and area, then pick it from the list.</p>
      <input
        id="gbp-clinic-search"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="e.g. Smile Care Dental Wakad"
        autoComplete="off"
        aria-label="Clinic name"
        style={{ height: 46, borderRadius: 12, border: `2px solid ${TEAL}`, padding: '0 12px', fontSize: 15, fontFamily: 'var(--font-body)', width: '100%', boxSizing: 'border-box' }}
      />
      {longEnough && suggestions.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {suggestions.map(s => (
            <button key={s.placeId} type="button" onClick={() => pick(s)} disabled={busy}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', borderBottom: '1px solid var(--border)', padding: '10px 12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <b style={{ display: 'block', fontSize: 14, color: 'var(--text)' }}>{s.main}</b>
              {s.secondary && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.secondary}</span>}
            </button>
          ))}
          <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right', padding: '6px 12px', background: TEAL_SOFT }}>powered by Google</div>
        </div>
      )}
      {longEnough && searched && suggestions.length === 0 && !error && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No match on Google. Try adding your area, or tap &quot;Not on Google&quot;.</p>
      )}
      {errorLine}
      <button type="button" onClick={() => setMode('notfound')} style={btn('plain')}>Not on Google</button>
    </div>
  )
}
