'use client'

import { useState } from 'react'

interface Tab {
  id: string
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: '👤' },
  { id: 'treatments', label: 'Treatments & Fees', icon: '💉' },
  { id: 'gallery', label: 'Gallery', icon: '🖼️' },
  { id: 'reviews', label: 'Reviews', icon: '⭐' },
  { id: 'location', label: 'Location', icon: '📍' },
]

interface ProfileTabsProps {
  overview: React.ReactNode
  treatments: React.ReactNode
  gallery: React.ReactNode
  reviews: React.ReactNode
  location: React.ReactNode
  reviewCount: number
}

export default function ProfileTabs({ overview, treatments, gallery, reviews, location, reviewCount }: ProfileTabsProps) {
  const [active, setActive] = useState('overview')

  const content: Record<string, React.ReactNode> = { overview, treatments, gallery, reviews, location }

  return (
    <div>
      {/* Tab bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 68, zIndex: 10, overflowX: 'auto' }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '16px 24px', background: 'none', border: 'none',
                borderBottom: active === tab.id ? '3px solid var(--blue)' : '3px solid transparent',
                color: active === tab.id ? 'var(--blue)' : 'var(--muted)',
                fontFamily: 'var(--font-body)', fontWeight: active === tab.id ? 700 : 500,
                fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}{tab.id === 'reviews' && reviewCount > 0 ? ` (${reviewCount})` : ''}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '32px 0' }}>
        {content[active]}
      </div>
    </div>
  )
}
