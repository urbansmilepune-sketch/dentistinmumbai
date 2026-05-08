'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SearchBarProps {
  areas: { name: string; slug: string }[]
  treatments: { name: string; slug: string }[]
}

export default function SearchBar({ areas, treatments }: SearchBarProps) {
  const router = useRouter()
  const [area, setArea] = useState('')
  const [treatment, setTreatment] = useState('')

  function handleSearch() {
    const params = new URLSearchParams()
    if (area) params.set('area', area)
    if (treatment) params.set('treatment', treatment)
    router.push(`/dentists?${params.toString()}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="search-bar-wrapper">
      <div className="search-bar">
        <div className="search-field">
          <span className="search-icon">📍</span>
          <select
            value={area}
            onChange={e => setArea(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Select area in Mumbai"
          >
            <option value="">All areas in Mumbai</option>
            {areas.map(a => (
              <option key={a.slug} value={a.slug}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="search-divider" aria-hidden="true" />
        <div className="search-field">
          <span className="search-icon">🦷</span>
          <select
            value={treatment}
            onChange={e => setTreatment(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Select treatment"
          >
            <option value="">Any treatment</option>
            {treatments.map(t => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
        </div>
        <button
          className="search-btn"
          onClick={handleSearch}
          aria-label="Search dentists"
        >
          Find Dentists
        </button>
      </div>

      <style jsx>{`
        .search-bar-wrapper {
          width: 100%;
          max-width: 720px;
        }
        .search-bar {
          display: flex;
          align-items: center;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0,87,168,0.18);
          overflow: hidden;
          border: 2px solid rgba(255,255,255,0.6);
        }
        .search-field {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 20px;
          min-height: 64px;
        }
        .search-icon {
          font-size: 18px;
          flex-shrink: 0;
        }
        .search-field select {
          flex: 1;
          border: none;
          outline: none;
          font-family: var(--font-body);
          font-size: 15px;
          font-weight: 500;
          color: var(--text);
          background: transparent;
          cursor: pointer;
          -webkit-appearance: none;
          appearance: none;
        }
        .search-field select option {
          color: var(--text);
        }
        .search-divider {
          width: 1px;
          height: 36px;
          background: var(--border);
          flex-shrink: 0;
        }
        .search-btn {
          padding: 0 32px;
          height: 64px;
          background: var(--blue);
          color: #fff;
          font-family: var(--font-body);
          font-weight: 700;
          font-size: 15px;
          border: none;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .search-btn:hover {
          background: var(--blue-dark);
        }
        @media (max-width: 640px) {
          .search-bar {
            flex-direction: column;
            border-radius: 12px;
          }
          .search-field {
            width: 100%;
            border-bottom: 1px solid var(--border);
          }
          .search-divider { display: none; }
          .search-btn {
            width: 100%;
            border-radius: 0 0 10px 10px;
          }
        }
      `}</style>
    </div>
  )
}
