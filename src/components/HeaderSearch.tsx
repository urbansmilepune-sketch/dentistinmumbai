'use client'

// Free-text search input that lives in the shared SiteHeader. Type and press
// Enter (or tap the magnifier) to navigate to /search?q=… — there is no
// autocomplete dropdown yet, it's type-and-enter only. The /search page reads
// ?q= server-side and scopes results to the current city.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NAVY, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'

interface Props {
  /** Pre-fills the box — used on /search so the header mirrors the active query. */
  initialQuery?: string
  placeholder?: string
}

function MagnifierIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export default function HeaderSearch({ initialQuery = '', placeholder = 'Search treatments, areas, or dentists...' }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)

  function submit() {
    const query = q.trim()
    if (!query) return
    router.push(`/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <form className="hs" role="search" onSubmit={e => { e.preventDefault(); submit() }}>
      <span className="hs-icon" aria-hidden="true"><MagnifierIcon color="#94A3B8" /></span>
      <input
        className="hs-input"
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Search treatments, areas, or dentists"
        enterKeyHint="search"
      />
      <button type="submit" className="hs-btn" aria-label="Search">
        <MagnifierIcon color="#fff" />
      </button>

      <style jsx>{`
        .hs {
          display: flex;
          align-items: center;
          width: 100%;
          background: #fff;
          border: 1.5px solid #E2E8F0;
          border-radius: 999px;
          padding-left: 14px;
          transition: border-color .15s, box-shadow .15s;
        }
        .hs:focus-within {
          border-color: ${TEAL};
          box-shadow: 0 0 0 3px rgba(20,184,166,0.12);
        }
        .hs-icon { display: inline-flex; flex-shrink: 0; }
        .hs-input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          font-family: var(--font-body);
          font-size: 14.5px;
          color: ${NAVY};
          padding: 0 10px;
          height: 44px;
          -webkit-appearance: none;
          appearance: none;
        }
        /* Hide the native clear (×) of type=search for a clean pill. */
        .hs-input::-webkit-search-decoration,
        .hs-input::-webkit-search-cancel-button { -webkit-appearance: none; }
        .hs-input::placeholder { color: #94A3B8; }
        .hs-btn {
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          width: 44px; height: 44px;
          margin: 2px;
          border: none;
          border-radius: 999px;
          background: ${TEAL};
          cursor: pointer;
          transition: background .15s;
        }
        .hs-btn:hover { background: ${TEAL_DARK}; }
        .hs-btn:active { transform: scale(0.96); }
      `}</style>
    </form>
  )
}
