'use client'

// Tiny client form for the case-browse keyword search. We use a form
// + GET so the URL updates with ?q=... and the server-rendered page
// re-fetches results. Clear button resets the URL without reloading.

import { useState } from 'react'

export default function SearchBox({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial)

  function clear() {
    setQ('')
    // Re-issue a GET to /cases stripping ?q= while preserving other
    // filters that were already in the URL.
    const params = new URLSearchParams(window.location.search)
    params.delete('q')
    const qs = params.toString()
    window.location.href = qs ? `/cases?${qs}` : '/cases'
  }

  return (
    <form method="get" action="/cases" style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 240 }}>
      <input
        type="search"
        name="q"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search cases by title, description, specialty…"
        style={{
          flex: 1, minWidth: 0,
          padding: '10px 14px', minHeight: 40,
          borderRadius: 8, border: '1.5px solid #E2E8F0',
          fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
          background: '#fff', color: '#0F1923',
        }}
      />
      {/* Preserve other filters when the form submits — the existing
          URL params get carried along as hidden fields. We don't render
          a `q` hidden field because the input above is named q. */}
      <HiddenFiltersFromUrl exclude={['q']} />
      <button type="submit" style={{ padding: '10px 16px', minHeight: 40, background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
        Search
      </button>
      {initial && (
        <button type="button" onClick={clear} style={{ padding: '10px 14px', minHeight: 40, background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          Clear
        </button>
      )}
    </form>
  )
}

function HiddenFiltersFromUrl({ exclude }: { exclude: string[] }) {
  // SSR will skip this (no window); the form still submits — it just
  // won't carry pre-existing filters. After hydration this fills in
  // hidden inputs for any URL params we want to preserve.
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const out: React.ReactElement[] = []
  for (const [k, v] of params) {
    if (exclude.includes(k)) continue
    out.push(<input key={k + v} type="hidden" name={k} value={v} />)
  }
  return <>{out}</>
}
