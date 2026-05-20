'use client'

// Client-side India map for the national homepage. The actual GeoJSON
// projection happens server-side in indiaMap.ts — this component
// receives ready-to-render SVG path strings + projected dot positions
// as props. That keeps d3-geo and the 559 KB state GeoJSON out of the
// client bundle entirely.
//
// All interactivity (hover tooltip, click to navigate or open the
// waitlist modal) lives here; the data flow is one-way from server.

import { useState } from 'react'
import {
  VB_W, VB_H, type StatePath, type Dot, type LiveDot, type SoonDot,
} from './indiaMapData'

interface DentistCountMap { [slug: string]: number }

interface Props {
  statePaths: StatePath[]
  liveDots: LiveDot[]
  soonDots: SoonDot[]
  dentistCountByCity: DentistCountMap
  onComingSoonClick: (city: { slug: string; name: string; state: string }) => void
}

export default function IndiaMap({ statePaths, liveDots, soonDots, dentistCountByCity, onComingSoonClick }: Props) {
  const [hover, setHover] = useState<{ dot: Dot; mx: number; my: number } | null>(null)

  function handleMove(e: React.MouseEvent<SVGElement>, dot: Dot) {
    // Use the parent SVG's bounding box so the tooltip is positioned
    // relative to the SVG container regardless of where in the DOM the
    // cursor event originated.
    const svg = e.currentTarget.ownerSVGElement || (e.currentTarget as unknown as SVGSVGElement)
    const rect = svg.getBoundingClientRect()
    setHover({ dot, mx: e.clientX - rect.left, my: e.clientY - rect.top })
  }

  function handleClick(dot: Dot) {
    if (dot.kind === 'live') {
      window.open(`https://${dot.domain}`, '_blank', 'noopener,noreferrer')
    } else {
      onComingSoonClick({ slug: dot.slug, name: dot.name, state: dot.state })
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
        {/* Pulse keyframes scoped inside the SVG so this component owns
            its full animation surface — no globals.css edit required. */}
        <style>{`
          @keyframes india-pulse {
            0%   { r: 8;  opacity: 1;   }
            70%  { r: 22; opacity: 0;   }
            100% { r: 22; opacity: 0;   }
          }
          .india-pulse { animation: india-pulse 2s ease-out infinite; }
        `}</style>

        {/* State boundaries. One <path> per state so we can stroke between
            them; fill is a very light blue so the country reads as a
            single shape, stroke is the standard slate-200 we use across
            the admin. */}
        <g aria-hidden="true">
          {statePaths.map(s => (
            <path
              key={s.name}
              d={s.d}
              fill="#F0F9FF"
              stroke="#E2E8F0"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* Coming-soon dots first, live dots on top — so when two are
            close (Mumbai + Thane + Navi Mumbai etc.) the live halos
            always win the z-order battle. */}
        {soonDots.map(d => (
          <circle
            key={'s-' + d.slug}
            cx={d.x} cy={d.y} r={5}
            fill="#94A3B8" stroke="#fff" strokeWidth={1.5}
            style={{ cursor: 'pointer' }}
            onMouseEnter={e => handleMove(e, d)}
            onMouseMove={e => handleMove(e, d)}
            onMouseLeave={() => setHover(null)}
            onClick={() => handleClick(d)}
          />
        ))}

        {liveDots.map(d => (
          <g key={'l-' + d.slug} style={{ cursor: 'pointer' }}>
            <circle cx={d.x} cy={d.y} r={8} fill="#0057A8" className="india-pulse" />
            <circle
              cx={d.x} cy={d.y} r={8}
              fill="#0057A8" stroke="#fff" strokeWidth={2}
              onMouseEnter={e => handleMove(e, d)}
              onMouseMove={e => handleMove(e, d)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d)}
            />
          </g>
        ))}
      </svg>

      {/* Tooltip. pointer-events:none so the dot beneath isn't covered
          on tiny screens where the cursor + tooltip overlap. */}
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
          {hover.dot.kind === 'live' ? (
            <>
              <div style={{ fontSize: 13 }}>{hover.dot.name}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {hover.dot.state} · {dentistCountByCity[hover.dot.slug] ?? 0} dentist{(dentistCountByCity[hover.dot.slug] ?? 0) === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: 10, color: '#60A5FA', marginTop: 2 }}>Click to visit →</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13 }}>{hover.dot.name}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{hover.dot.state} · Coming soon</div>
              <div style={{ fontSize: 10, color: '#FBBF24', marginTop: 2 }}>Click to get notified →</div>
            </>
          )}
        </div>
      )}

      {/* Legend. Counts match the source-of-truth in the indiaMap.ts
          projection (live = CITY_CONFIGS, soon = COMING_SOON_CITIES). */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, fontSize: 13, color: '#475569' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#0057A8', boxShadow: '0 0 0 4px rgba(0, 87, 168, 0.22)' }} />
          <span><strong style={{ color: '#0F1923' }}>{liveDots.length}</strong> cities live</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#94A3B8' }} />
          <span><strong style={{ color: '#0F1923' }}>{soonDots.length}</strong> cities coming soon</span>
        </span>
      </div>
    </div>
  )
}
