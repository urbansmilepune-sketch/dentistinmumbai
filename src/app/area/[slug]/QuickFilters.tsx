'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface QuickFiltersProps {
  areaSlug: string
  totalCount: number
  areaName: string
}

const FILTERS = [
  { key: 'open', label: '🟢 Open Now' },
  { key: 'gender', label: '👩‍⚕️ Female Doctor', value: 'female' },
  { key: 'verified', label: '✅ Verified' },
  { key: 'emi', label: '💳 EMI Available' },
]

export default function QuickFilters({ areaSlug, totalCount, areaName }: QuickFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function toggle(key: string, value?: string) {
    const params = new URLSearchParams(searchParams.toString())
    const current = params.get(key)
    if (current) params.delete(key)
    else params.set(key, value || 'true')
    router.push(`/area/${areaSlug}?${params.toString()}`)
  }

  function isActive(key: string, value?: string) {
    const v = searchParams.get(key)
    if (value) return v === value
    return !!v
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '16px 0' }}>
      <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
        Showing <strong style={{ color: 'var(--text)' }}>{totalCount}</strong> dentists in {areaName}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = isActive(f.key, f.value)
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key, f.value)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                border: `1.5px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                background: active ? 'var(--blue)' : '#fff',
                color: active ? '#fff' : 'var(--text)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
            >{f.label}</button>
          )
        })}
      </div>
    </div>
  )
}
