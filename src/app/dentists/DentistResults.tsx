'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

// List/grid view toggle for the /dentists results. The toggle is PURE client
// state (useState) and deliberately never touches the URL — the old
// implementation pushed `?view=grid`, which manufactured a crawlable duplicate
// of every filtered listing URL (Section 4, index hygiene). The server
// pre-renders both the list and grid card sets (DentistCard is a server
// component with two distinct layouts) and we simply toggle which set is
// visible; there is no navigation and no query param.
export default function DentistResults({ listCards, gridCards }: { listCards: ReactNode; gridCards: ReactNode }) {
  const [view, setView] = useState<'list' | 'grid'>('list')

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ display: 'flex', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['list', 'grid'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              aria-label={v === 'list' ? 'List view' : 'Grid view'}
              style={{
                padding: '8px 14px', fontSize: 16, cursor: 'pointer',
                border: 'none', fontFamily: 'var(--font-body)',
                background: view === v ? 'var(--blue)' : 'transparent',
                color: view === v ? '#fff' : 'var(--muted)',
              }}
            >
              {v === 'list' ? '☰' : '⊞'}
            </button>
          ))}
        </div>
      </div>

      {/* Both sets are in the DOM; only the active one is displayed. Cheap at
          PER_PAGE=6 cards and keeps DentistCard fully server-rendered. */}
      <div style={{ display: view === 'list' ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        {listCards}
      </div>
      <div style={{
        display: view === 'grid' ? 'grid' : 'none',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {gridCards}
      </div>
    </>
  )
}
