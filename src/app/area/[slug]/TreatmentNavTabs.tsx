'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Treatment {
  name: string
  slug: string
  icon: string
}

interface TreatmentNavTabsProps {
  areaSlug: string
  treatments: Treatment[]
  activeTab?: string
}

const TAB_LABELS: Record<string, string> = {
  '': 'All Dentists',
  'dental-implants': 'Implants',
  'braces-aligners': 'Braces',
  'root-canal': 'Root Canal',
  'teeth-whitening': 'Whitening',
  'veneers': 'Veneers',
  'smile-makeover': 'Smile Design',
  'kids-dentistry': 'Pediatric',
}

export default function TreatmentNavTabs({ areaSlug, treatments, activeTab = '' }: TreatmentNavTabsProps) {
  const tabTreatments = [
    { name: 'All Dentists', slug: '', icon: '🦷' },
    ...treatments
      .filter(t => Object.keys(TAB_LABELS).includes(t.slug))
      .map(t => ({ ...t, name: TAB_LABELS[t.slug] || t.name }))
  ]

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
      <div className="container">
        <div style={{ display: 'flex', gap: 0, minWidth: 'max-content' }}>
          {tabTreatments.map(t => {
            const href = t.slug ? `/area/${areaSlug}/${t.slug}` : `/area/${areaSlug}`
            const isActive = activeTab === t.slug
            return (
              <Link key={t.slug} href={href} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '14px 20px', whiteSpace: 'nowrap',
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--blue)' : 'var(--muted)',
                borderBottom: isActive ? '3px solid var(--blue)' : '3px solid transparent',
                transition: 'color 0.15s, border-color 0.15s',
                textDecoration: 'none',
              }}>
                <span>{t.icon}</span>
                <span>{t.name}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
