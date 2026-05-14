'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  minChars?: number
  maxResults?: number
  style?: React.CSSProperties
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  ariaLabel?: string
}

export default function AutocompleteInput({
  value, onChange, suggestions,
  placeholder, minChars = 3, maxResults = 8,
  style, inputMode, ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const query = value.trim().toLowerCase()
  const matches = query.length >= minChars
    ? suggestions
        .filter(s => {
          const sl = s.toLowerCase()
          return sl.includes(query) && sl !== query
        })
        .slice(0, maxResults)
    : []

  // Click-outside / Escape close
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Reset active when matches change
  useEffect(() => { setActiveIndex(-1) }, [query])

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false); setActiveIndex(-1)
      return
    }
    if (!matches.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex(i => (i + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex(i => (i <= 0 ? matches.length - 1 : i - 1))
    } else if (e.key === 'Enter' && open && activeIndex >= 0) {
      e.preventDefault()
      pick(matches[activeIndex])
    }
  }

  function pick(s: string) {
    onChange(s)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (matches.length > 0) setOpen(true) }}
        onKeyDown={handleKey}
        placeholder={placeholder}
        style={style}
        inputMode={inputMode}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        aria-controls={open ? 'autocomplete-list' : undefined}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul
          id="autocomplete-list"
          role="listbox"
          ref={listRef}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            zIndex: 50, listStyle: 'none', margin: 0, padding: 4,
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: 260, overflowY: 'auto',
            fontFamily: 'var(--font-body)',
          }}>
          {matches.map((s, i) => {
            const active = i === activeIndex
            return (
              <li
                key={s}
                role="option"
                aria-selected={active}
                onMouseDown={e => { e.preventDefault(); pick(s) }}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  background: active ? 'var(--blue-light)' : 'transparent',
                  color: active ? 'var(--blue-dark)' : 'var(--text)',
                  fontWeight: active ? 600 : 500,
                }}>
                {s}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
