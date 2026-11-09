'use client'

// Homepage "need" flow. The hero asks three things in order (what do you
// need, where, then a Find button) and the dentist row below follows the
// chosen need: its heading becomes "Dentists for root canal near you" and it
// shows dentists who list that treatment. Both halves share the choice
// through NeedProvider, which page.tsx wraps around the hero and the row.

import { createContext, useContext, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NAVY, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'

export interface Need { label: string; slug: string }

const NeedCtx = createContext<{ need: Need | null; setNeed: (n: Need | null) => void }>({ need: null, setNeed: () => {} })

export function NeedProvider({ children }: { children: ReactNode }) {
  const [need, setNeed] = useState<Need | null>(null)
  return <NeedCtx.Provider value={{ need, setNeed }}>{children}</NeedCtx.Provider>
}

interface HeroProps {
  needs: Need[]
  areas: { name: string; slug: string }[]
  cityName: string
  dentistCount: number
}

export function NeedHero({ needs, areas, cityName, dentistCount }: HeroProps) {
  const router = useRouter()
  const { need, setNeed } = useContext(NeedCtx)
  const [typing, setTyping] = useState(false)
  const [q, setQ] = useState('')
  const [area, setArea] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickNeed(n: Need) {
    setQ('')
    setNeed(need?.label === n.label ? null : n)
  }

  function nearMe() {
    setError(null)
    if (coords) { setCoords(null); return }
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Location is not supported in this browser. Pick your area instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        setArea('')
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      err => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) setError('Location access is blocked. Allow it in your browser settings, or pick your area.')
        else if (err.code === err.TIMEOUT) setError('Finding your location took too long. Try again.')
        else setError('Could not get your location. Try again, or pick your area.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  function find() {
    const typed = q.trim()
    if (typed) {
      const areaName = areas.find(a => a.slug === area)?.name
      router.push(`/search?q=${encodeURIComponent(areaName ? `${typed} ${areaName}` : typed)}`)
      return
    }
    const p = new URLSearchParams()
    if (need) p.set('treatment', need.slug)
    if (coords) { p.set('lat', coords.lat.toFixed(5)); p.set('lng', coords.lng.toFixed(5)) }
    else if (area) p.set('area', area)
    p.set('page', '1')
    router.push(`/dentists?${p.toString()}`)
  }

  return (
    <section className="nh">
      <div className="container nh-in">
        <h1 className="nh-h1">Find the Best Dentist in {cityName}</h1>
        <p className="nh-sub"><span>Choose, Book and Visit</span></p>

        <form className="nh-flow" onSubmit={e => { e.preventDefault(); find() }}>
          <div className="nh-step nh-s1">
            <p className="nh-label" id="nh-what"><span className="nh-n">1</span>What do you need?</p>
            <div className="nh-chips" role="group" aria-labelledby="nh-what">
              {needs.map(n => (
                <button
                  key={n.label}
                  type="button"
                  className={`nh-chip${need?.label === n.label ? ' on' : ''}`}
                  aria-pressed={need?.label === n.label}
                  onClick={() => pickNeed(n)}
                >{n.label}</button>
              ))}
            </div>
            {typing ? (
              <input
                id="nh-q"
                className="nh-input"
                type="search"
                value={q}
                onChange={e => { setQ(e.target.value); if (e.target.value) setNeed(null) }}
                placeholder="e.g. bleeding gums, broken tooth"
                aria-label="Describe what you need"
                enterKeyHint="search"
                autoFocus
              />
            ) : (
              <p className="nh-other">Something else? <button type="button" onClick={() => setTyping(true)}>Type it here</button></p>
            )}
          </div>

          <div className="nh-step nh-s2">
            <label className="nh-label" htmlFor="nh-area"><span className="nh-n">2</span>Where do you need it?</label>
            <div className="nh-where">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              {coords ? (
                <span className="nh-here">Near your location</span>
              ) : (
                <select id="nh-area" className="nh-select" value={area} onChange={e => setArea(e.target.value)}>
                  <option value="">Anywhere in {cityName}</option>
                  {areas.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                </select>
              )}
              <button type="button" className={`nh-near${coords ? ' on' : ''}`} onClick={nearMe} disabled={locating}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8-8-2Z" /></svg>
                {locating ? 'Locating…' : coords ? 'Near me ✓' : 'Near me'}
              </button>
            </div>
            {error && <p className="nh-err" role="alert">{error}</p>}
          </div>

          <button type="submit" className="nh-go">
            Find suitable dentists
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>

        <ul className="nh-trust">
          {dentistCount > 0 && <li><Tick /><span><b>{dentistCount} dentists</b> in {cityName}</span></li>}
          <li><Tick />Registration checked</li>
          <li><Tick />Free to book</li>
        </ul>
      </div>

      <style jsx>{`
        .nh { background: #F3F8F8; border-bottom: 1px solid #E2E8F0; padding: 52px 20px 44px; }
        .nh-in { max-width: 820px; margin: 0 auto; text-align: center; }
        .nh-h1 {
          font-family: var(--font-heading); font-weight: 700; color: ${NAVY};
          font-size: clamp(1.6rem, 4.2vw, 2.4rem); line-height: 1.15; letter-spacing: -0.02em;
          margin: 0; text-wrap: balance;
        }
        .nh-sub { margin: 8px 0 26px; font-size: clamp(1rem, 2vw, 1.2rem); font-weight: 600; color: ${TEAL_DARK}; }
        .nh-sub span { background: linear-gradient(transparent 62%, rgba(20,184,166,0.18) 62%); padding: 0 2px; }
        .nh-flow {
          text-align: left; background: #fff; border: 1px solid #E2E8F0; border-radius: 16px;
          padding: 20px 22px; display: grid; grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px 14px; align-items: end; box-shadow: 0 6px 18px rgba(15,23,42,0.05);
        }
        .nh-step { display: grid; grid-template-columns: minmax(0, 1fr); gap: 9px; min-width: 0; }
        .nh-s1 { grid-column: 1 / -1; }
        .nh-s2 { border-top: 1px solid #E2E8F0; padding-top: 16px; }
        .nh-label { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; font-weight: 700; color: ${NAVY}; }
        .nh-n {
          width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
          background: #E6FAF7; color: ${TEAL_DARK}; font-size: 11.5px; font-weight: 700;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .nh-chips { display: flex; flex-wrap: wrap; gap: 7px; }
        .nh-chip {
          font-family: var(--font-body); font-size: 13.5px; font-weight: 600; color: #334155;
          background: #fff; border: 1px solid #E2E8F0; border-radius: 999px;
          min-height: 36px; padding: 0 13px; cursor: pointer; white-space: nowrap;
          transition: border-color .15s, background .15s;
        }
        .nh-chip:hover { border-color: ${TEAL}; }
        .nh-chip.on { background: #E6FAF7; border-color: ${TEAL}; color: ${NAVY}; }
        .nh-chip:focus-visible, .nh-go:focus-visible, .nh-near:focus-visible, .nh-other button:focus-visible { outline: 2px solid ${TEAL}; outline-offset: 2px; }
        .nh-other { margin: 0; font-size: 13px; color: #64748B; }
        .nh-other button { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: ${TEAL_DARK}; cursor: pointer; }
        .nh-input {
          width: 100%; height: 42px; border: 1px solid #E2E8F0; border-radius: 10px; padding: 0 12px;
          font-family: var(--font-body); font-size: 15px; color: ${NAVY}; outline: none;
        }
        .nh-input:focus { border-color: ${TEAL}; }
        .nh-where {
          display: flex; align-items: center; gap: 10px; min-height: 46px;
          border: 1px solid #E2E8F0; border-radius: 11px; padding: 4px 6px 4px 12px;
        }
        .nh-where:focus-within { border-color: ${TEAL}; }
        .nh-select {
          flex: 1; min-width: 0; border: 0; outline: none; background: transparent; height: 36px;
          font-family: var(--font-body); font-size: 15px; font-weight: 600; color: ${NAVY}; cursor: pointer;
        }
        .nh-here { flex: 1; font-size: 15px; font-weight: 600; color: ${NAVY}; }
        .nh-near {
          display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
          font-family: var(--font-body); font-size: 13px; font-weight: 700; color: ${TEAL_DARK};
          background: #E6FAF7; border: 1px solid transparent; border-radius: 999px; padding: 6px 11px; cursor: pointer; white-space: nowrap;
        }
        .nh-near.on { border-color: ${TEAL}; }
        .nh-near:disabled { cursor: wait; opacity: .8; }
        .nh-err { margin: 0; font-size: 13px; color: #B42318; }
        .nh-go {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          height: 46px; padding: 0 22px; border: 0; border-radius: 11px; cursor: pointer;
          background: ${TEAL}; color: #fff; font-family: var(--font-body); font-weight: 700; font-size: 15px; white-space: nowrap;
          transition: background .15s;
        }
        .nh-go:hover { background: ${TEAL_DARK}; }
        .nh-trust { list-style: none; padding: 0; margin: 16px 0 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; font-size: 13px; color: #64748B; }
        .nh-trust li { display: inline-flex; align-items: center; gap: 5px; line-height: 1.3; white-space: nowrap; }
        .nh-trust li :global(svg) { flex-shrink: 0; }
        .nh-trust b { color: ${NAVY}; font-weight: 700; }
        @media (max-width: 640px) {
          .nh { padding: 24px 0 22px; }
          .nh-in { text-align: left; }
          .nh-sub { margin: 6px 0 18px; }
          .nh-flow { grid-template-columns: minmax(0, 1fr); padding: 14px; gap: 14px; }
          .nh-s2 { padding-top: 14px; }
          .nh-go { width: 100%; height: 48px; }
          .nh-where { gap: 8px; padding: 4px 5px 4px 10px; }
          .nh-select { font-size: 16px; }
          .nh-near { font-size: 12.5px; padding: 6px 9px; gap: 4px; }
          .nh-trust { justify-content: flex-start; font-size: 12.5px; gap: 6px 12px; }
        }
      `}</style>
    </section>
  )
}

interface SpotlightProps {
  cityName: string
  /** Server-rendered cards, keyed by dentist id. */
  cards: { id: string; node: ReactNode }[]
  /** Dentist ids to show with no need picked, and per treatment slug. */
  defaultIds: string[]
  byTreatment: Record<string, string[]>
}

export function NeedSpotlight({ cityName, cards, defaultIds, byTreatment }: SpotlightProps) {
  const { need } = useContext(NeedCtx)
  const ids = need ? (byTreatment[need.slug] ?? []) : defaultIds
  const byId = new Map(cards.map(c => [c.id, c.node]))
  const title = need ? `Dentists for ${need.label.toLowerCase()} near you` : `Dentists near you in ${cityName}`
  const seeAll = need ? `/dentists?treatment=${need.slug}` : '/dentists'

  if (!need && defaultIds.length === 0) return null

  return (
    <section className="hm-sec" style={{ background: '#fff' }}>
      <div className="container">
        <div className="hm-head">
          <h2 className="hm-h2" aria-live="polite">{title}</h2>
          <Link href={seeAll} className="hm-more hm-seeall">See all →</Link>
        </div>
        <p className="hm-sub">Degree, fee and timings on every card. Free to book.</p>
        {ids.length > 0 ? (
          <div className="hm-cards">
            {ids.map(id => <div key={id} className="hm-card">{byId.get(id)}</div>)}
          </div>
        ) : (
          <p style={{ fontSize: 14, color: '#334155', margin: 0 }}>
            <Link href={seeAll} className="hm-more">See dentists for {need?.label.toLowerCase()} in {cityName} →</Link>
          </p>
        )}
      </div>
    </section>
  )
}

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEAL_DARK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
