'use client'

import { useState } from 'react'

interface Location {
  id: string
  name: string
  address: string | null
  phone: string | null
  working_hours: Record<string, any> | null
  is_primary: boolean
  areas?: { name: string } | null
}

interface Props {
  locations: Location[]
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

/**
 * Sidebar card for dentists with more than one clinic. Tabs swap which
 * location's address + hours show. We render server-side data with `useState`
 * for the tab; no fetch round-trips on switch.
 */
export default function LocationTabs({ locations }: Props) {
  const [activeId, setActiveId] = useState(locations[0]?.id)
  const active = locations.find(l => l.id === activeId) ?? locations[0]
  if (!active) return null

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Tab strip — horizontal scroll on narrow screens */}
      <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
        {locations.map(loc => {
          const on = loc.id === active.id
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => setActiveId(loc.id)}
              style={{
                flexShrink: 0,
                padding: '14px 18px',
                background: 'none',
                border: 'none',
                borderBottom: on ? '3px solid var(--blue)' : '3px solid transparent',
                color: on ? 'var(--blue)' : 'var(--muted)',
                fontWeight: on ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
              {loc.is_primary && <span style={{ fontSize: 11 }}>★</span>}
              {loc.name}
            </button>
          )
        })}
      </div>

      <div style={{ padding: 20 }}>
        {(active.address || active.areas?.name) && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Address</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {active.address || ''}{active.address && active.areas?.name ? ' · ' : ''}{active.areas?.name || ''}
            </p>
            {active.phone && (
              <a href={`tel:${active.phone}`} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, display: 'inline-block', marginTop: 6 }}>
                📞 {active.phone}
              </a>
            )}
          </div>
        )}

        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Working Hours</p>
        {DAYS.map(d => {
          const h = active.working_hours?.[d]
          return (
            <div key={d} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{DAY_LABELS[d]}</span>
              <span style={{ fontWeight: 600, color: h?.is_open ? 'var(--text)' : '#EF4444' }}>
                {h?.is_open ? `${h.open_time} – ${h.close_time}` : 'Closed'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
