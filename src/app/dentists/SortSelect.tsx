'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface SortSelectProps {
  currentSort: string
}

export default function SortSelect({ currentSort }: SortSelectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', e.target.value)
    params.set('page', '1')
    router.push(`/dentists?${params.toString()}`)
  }

  return (
    <select
      value={currentSort}
      onChange={handleChange}
      style={{
        padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
        fontSize: 13, fontFamily: 'var(--font-body)', background: '#fff',
        color: 'var(--text)', cursor: 'pointer',
      }}
    >
      <option value="relevance">Relevance</option>
      <option value="rating">Rating High–Low</option>
      <option value="fee_asc">Fee Low–High</option>
      <option value="fee_desc">Fee High–Low</option>
      <option value="experience">Experience</option>
    </select>
  )
}
