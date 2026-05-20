'use client'

// Client wrapper for /cities. Owns the NotifyMeModal state so coming-soon
// city tiles can fire the waitlist flow without each tile owning its own
// modal instance.

import { useState } from 'react'
import NotifyMeModal from '@/components/national/NotifyMeModal'

interface UnifiedCity {
  slug: string
  name: string
  state: string
  status: 'live' | 'soon'
  domain?: string
  dentistCount?: number
}

interface StateBlock {
  state: string
  cities: UnifiedCity[]
  liveCount: number
}

interface Props {
  stateBlocks: StateBlock[]
}

export default function CitiesGrid({ stateBlocks }: Props) {
  const [target, setTarget] = useState<{ slug: string; name: string; state: string } | null>(null)

  return (
    <>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>
        {stateBlocks.map(block => (
          <section key={block.state} style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#0F1923' }}>{block.state}</h2>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>
                {block.liveCount > 0 ? `${block.liveCount} live` : 'Coming soon'} · {block.cities.length} cit{block.cities.length === 1 ? 'y' : 'ies'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {block.cities.map(c => (
                c.status === 'live' ? (
                  <a
                    key={c.slug}
                    href={`https://${c.domain}`}
                    target="_blank"
                    rel="noopener"
                    style={{
                      display: 'block', padding: '16px 18px',
                      background: '#fff', border: '1px solid #BFDBFE',
                      borderRadius: 12, textDecoration: 'none', color: '#0F1923',
                      boxShadow: '0 2px 4px rgba(15, 25, 35, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{c.name}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#DCFCE7', color: '#166534', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Live</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>
                      {c.dentistCount} dentist{c.dentistCount === 1 ? '' : 's'} →
                    </div>
                  </a>
                ) : (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setTarget({ slug: c.slug, name: c.name, state: c.state })}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '16px 18px',
                      background: '#F8FAFC', border: '1px dashed #CBD5E1',
                      borderRadius: 12, color: '#0F1923', fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{c.name}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#F1F5F9', color: '#475569', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Soon</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>
                      Notify me →
                    </div>
                  </button>
                )
              ))}
            </div>
          </section>
        ))}
      </main>

      {target && (
        <NotifyMeModal
          city={target}
          source="cities_page"
          onClose={() => setTarget(null)}
        />
      )}
    </>
  )
}
