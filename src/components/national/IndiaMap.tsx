'use client'

// Interactive India map for the national parent site.
//
// Renders a single SVG with:
//   1. A stylised India outline as the backdrop (hand-traced path — close
//      enough to read as "India" without requiring a TopoJSON dependency).
//   2. One <circle> per city, projected from real lat/lng to viewBox
//      coordinates using a plain equirectangular projection. The bounding
//      box is wide enough to cover Kashmir → Kerala without crowding.
//   3. Hover tooltip with city name + dentist count (live cities only).
//   4. Click action: live → open the city domain in a new tab; coming-soon
//      → fire onComingSoonClick() so the parent can show the waitlist
//      modal.
//
// All interactivity is client-side; the parent passes the dentist-count
// map already aggregated server-side so this component doesn't fetch.

import { useState, useMemo } from 'react'
import { CITY_CONFIGS, type CityConfig } from '@/config/cities'
import { COMING_SOON_CITIES, type ComingSoonCity } from '@/config/citiesNational'

// India's bounding box used by the projection. Slightly wider than the
// real extents so dots sit comfortably inside the outline.
const LAT_RANGE: [number, number] = [6, 37]
const LNG_RANGE: [number, number] = [68, 98]

// viewBox dimensions. India is roughly square at these latitudes, so a
// 1000 × 1100 box gives the dots room without distorting proportions.
const VB_W = 1000
const VB_H = 1100
const PAD = 40

function project(lat: number, lng: number) {
  const x = PAD + ((lng - LNG_RANGE[0]) / (LNG_RANGE[1] - LNG_RANGE[0])) * (VB_W - 2 * PAD)
  const y = PAD + ((LAT_RANGE[1] - lat) / (LAT_RANGE[1] - LAT_RANGE[0])) * (VB_H - 2 * PAD)
  return { x, y }
}

// Stylised India outline. Hand-traced to capture the recognisable
// silhouette (Kashmir notch, Gujarat coast, Kerala tip, Bay of Bengal
// curve, North-East stem) without requiring a 500KB TopoJSON. Swap with
// a precise path when we want to display state borders.
const INDIA_PATH = [
  'M 540 140',
  'C 545 95, 600 90, 645 105',
  'C 690 115, 705 140, 695 175',
  'C 770 165, 825 195, 860 230',
  'L 880 285',
  'C 895 320, 875 345, 845 360',
  'C 820 380, 810 415, 800 455',
  'C 790 500, 800 540, 815 575',
  'C 830 610, 855 640, 880 660',
  'C 900 680, 895 705, 870 715',
  'L 805 740',
  'C 770 755, 740 780, 715 805',
  'C 690 830, 670 845, 650 850',
  'L 620 855',
  'C 600 870, 575 880, 555 890',
  'C 525 905, 495 925, 475 940',
  'C 450 960, 425 980, 405 990',
  'L 375 985',
  'L 355 945',
  'C 350 905, 360 870, 365 835',
  'L 360 790',
  'C 345 760, 320 740, 305 715',
  'C 290 690, 280 660, 285 625',
  'L 295 580',
  'C 285 540, 270 510, 255 480',
  'C 235 450, 220 415, 215 380',
  'L 220 335',
  'C 230 305, 240 280, 245 250',
  'C 250 220, 265 200, 290 185',
  'C 320 170, 350 165, 385 165',
  'C 425 165, 470 155, 510 150',
  'Z',
].join(' ')

interface DentistCountMap {
  [slug: string]: number
}

interface Props {
  /** Server-aggregated dentist counts per live city slug. Missing slugs
   *  render as "—" in the tooltip so a brand-new city without dentists
   *  yet doesn't blow up the UI. */
  dentistCountByCity: DentistCountMap
  /** Invoked when the user clicks a coming-soon dot. Parent opens the
   *  waitlist modal. */
  onComingSoonClick: (city: { slug: string; name: string; state: string }) => void
}

type Marker =
  | { kind: 'live'; city: CityConfig; x: number; y: number }
  | { kind: 'soon'; city: ComingSoonCity; x: number; y: number }

export default function IndiaMap({ dentistCountByCity, onComingSoonClick }: Props) {
  const [hover, setHover] = useState<{ marker: Marker; mx: number; my: number } | null>(null)

  const markers = useMemo<Marker[]>(() => {
    const live: Marker[] = Object.values(CITY_CONFIGS).map(c => {
      const { x, y } = project(c.lat, c.lng)
      return { kind: 'live', city: c, x, y }
    })
    const soon: Marker[] = COMING_SOON_CITIES.map(c => {
      const { x, y } = project(c.lat, c.lng)
      return { kind: 'soon', city: c, x, y }
    })
    // Render live last so the pulsing live dots appear on top when two
    // cities are close to each other (e.g. Mumbai + Thane + Navi Mumbai).
    return [...soon, ...live]
  }, [])

  function handleMove(e: React.MouseEvent<SVGElement>, marker: Marker) {
    // SVG-relative offset so the tooltip follows the cursor inside the
    // map without leaking past the container.
    const rect = (e.currentTarget.ownerSVGElement || e.currentTarget).getBoundingClientRect()
    setHover({ marker, mx: e.clientX - rect.left, my: e.clientY - rect.top })
  }

  function handleClick(marker: Marker) {
    if (marker.kind === 'live') {
      window.open(`https://${marker.city.domain}`, '_blank', 'noopener,noreferrer')
    } else {
      onComingSoonClick({ slug: marker.city.slug, name: marker.city.name, state: marker.city.state })
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 720, margin: '0 auto' }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Interactive map of India showing cities live on the dental network and cities coming soon"
        style={{ display: 'block' }}
      >
        {/* Subtle gradient backdrop. Saves us a CSS background image and
            scales cleanly with the SVG. */}
        <defs>
          <radialGradient id="india-bg" cx="50%" cy="40%" r="65%">
            <stop offset="0%"   stopColor="#EFF6FF" />
            <stop offset="100%" stopColor="#F8FAFC" />
          </radialGradient>
        </defs>

        <path d={INDIA_PATH} fill="url(#india-bg)" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />

        {/* Pulse animation lives in CSS-in-SVG so the component is fully
            self-contained — no global stylesheet edit required. */}
        <style>{`
          @keyframes india-pulse {
            0%   { r: 8;  opacity: 1;   }
            70%  { r: 22; opacity: 0;   }
            100% { r: 22; opacity: 0;   }
          }
          .india-pulse { transform-box: fill-box; animation: india-pulse 2s ease-out infinite; }
        `}</style>

        {markers.map((m, i) => {
          if (m.kind === 'live') {
            return (
              <g key={'l' + i} style={{ cursor: 'pointer' }}>
                {/* Pulse halo */}
                <circle cx={m.x} cy={m.y} r="8" fill="#3B82F6" className="india-pulse" />
                {/* Core dot — interactive hit target */}
                <circle
                  cx={m.x} cy={m.y} r="8"
                  fill="#1D4ED8" stroke="#fff" strokeWidth="2"
                  onMouseEnter={e => handleMove(e, m)}
                  onMouseMove={e => handleMove(e, m)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => handleClick(m)}
                />
              </g>
            )
          }
          return (
            <circle
              key={'s' + i}
              cx={m.x} cy={m.y} r="6"
              fill="#94A3B8" stroke="#fff" strokeWidth="1.5"
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => handleMove(e, m)}
              onMouseMove={e => handleMove(e, m)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(m)}
            />
          )
        })}
      </svg>

      {/* Tooltip. Pointer-events disabled so it can't intercept mouseleave
          events fired by the dot beneath it (which would flicker the
          tooltip in/out). Position is svg-container-relative. */}
      {hover && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none',
            left: hover.mx + 12, top: hover.my + 12,
            background: '#0F1923', color: '#fff',
            padding: '8px 12px', borderRadius: 8,
            fontSize: 12, fontWeight: 600, lineHeight: 1.4,
            boxShadow: '0 8px 24px rgba(15, 25, 35, 0.2)',
            whiteSpace: 'nowrap', zIndex: 10,
          }}
        >
          {hover.marker.kind === 'live' ? (
            <>
              <div style={{ fontSize: 13 }}>{hover.marker.city.cityName}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {hover.marker.city.state} · {dentistCountByCity[hover.marker.city.citySlug] ?? 0} dentist{(dentistCountByCity[hover.marker.city.citySlug] ?? 0) === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: 10, color: '#60A5FA', marginTop: 2 }}>Click to visit →</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13 }}>{hover.marker.city.name}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{hover.marker.city.state} · Coming soon</div>
              <div style={{ fontSize: 10, color: '#FBBF24', marginTop: 2 }}>Click to get notified →</div>
            </>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, fontSize: 13, color: '#475569' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#1D4ED8', boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.25)' }} />
          <span><strong style={{ color: '#0F1923' }}>{Object.keys(CITY_CONFIGS).length}</strong> cities live</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#94A3B8' }} />
          <span><strong style={{ color: '#0F1923' }}>{COMING_SOON_CITIES.length}</strong> cities coming soon</span>
        </span>
      </div>
    </div>
  )
}
