'use client'

import { useState } from 'react'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '??' },
  { id: 'treatments', label: 'Treatments', icon: '??' },
  { id: 'gallery', label: 'Gallery', icon: '???' },
  { id: 'reviews', label: 'Reviews', icon: '?' },
  { id: 'location', label: 'Location', icon: '??' },
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
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#fff', borderRadius: '12px 12px 0 0', overflow: 'hidden', marginBottom: 16 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActive(tab.id)} style={{ flex: 1, padding: '14px 8px', border: 'none', background: active === tab.id ? 'var(--blue-light)' : '#fff', color: active === tab.id ? 'var(--blue)' : 'var(--muted)', fontWeight: active === tab.id ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', borderBottom: active === tab.id ? '2px solid var(--blue)' : '2px solid transparent', transition: 'all 0.15s' }}>
            <div>{tab.icon}</div>
            <div style={{ marginTop: 2 }}>{tab.id === 'reviews' && reviewCount > 0 ? tab.label + ' (' + reviewCount + ')' : tab.label}</div>
          </button>
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: '0 0 12px 12px', border: '1px solid var(--border)', borderTop: 'none', padding: '20px' }}>
        {content[active]}
      </div>
    </div>
  )
}
