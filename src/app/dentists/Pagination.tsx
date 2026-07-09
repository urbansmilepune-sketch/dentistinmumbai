'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface PaginationProps {
  currentPage: number
  totalPages: number
}

export default function Pagination({ currentPage, totalPages }: PaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  if (totalPages <= 1) return null

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    // page=1 is the bare URL — never emit &page=1 (Section 4).
    if (page <= 1) params.delete('page')
    else params.set('page', String(page))
    const qs = params.toString()
    router.push(qs ? `/dentists?${qs}` : '/dentists')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i)
    }
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 40 }}>
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage === 1}
        style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
          background: '#fff', fontSize: 13, fontWeight: 600, cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
          color: currentPage === 1 ? 'var(--muted)' : 'var(--text)',
          fontFamily: 'var(--font-body)',
        }}
      >← Prev</button>

      {pages.map((page, i) =>
        page === '...' ? (
          <span key={`dots-${i}`} style={{ color: 'var(--muted)', padding: '0 4px' }}>…</span>
        ) : (
          <button
            key={page}
            onClick={() => goToPage(page as number)}
            style={{
              width: 40, height: 40, borderRadius: 8,
              border: page === currentPage ? '2px solid var(--blue)' : '1px solid var(--border)',
              background: page === currentPage ? 'var(--blue)' : '#fff',
              color: page === currentPage ? '#fff' : 'var(--text)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >{page}</button>
        )
      )}

      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage === totalPages}
        style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
          background: '#fff', fontSize: 13, fontWeight: 600,
          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
          color: currentPage === totalPages ? 'var(--muted)' : 'var(--text)',
          fontFamily: 'var(--font-body)',
        }}
      >Next →</button>
    </div>
  )
}
