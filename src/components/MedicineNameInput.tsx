'use client'

// Medicine name box that suggests medicines this dentist prescribed before.
// Typing filters the list; tapping a suggestion fills the name and hands the
// last-used dose/frequency/duration to `onPick`. Typing a name that isn't in
// the list just keeps it as a new medicine.

import { useEffect, useId, useRef, useState } from 'react'
import { matchMedicines, pastMedicineDetails, type PastMedicine } from '@/lib/medicineHistory'

interface Props {
  value: string
  onChange: (name: string) => void
  onPick: (m: PastMedicine) => void
  history: PastMedicine[]
  placeholder?: string
  style?: React.CSSProperties
  ariaLabel?: string
  autoFocus?: boolean
  /** Enter with no suggestion highlighted (e.g. to add a new medicine). */
  onEnter?: () => void
}

const INK = '#0F172A'
const MUTED = '#64748B'
const TINT = '#CCFBF1'

export default function MedicineNameInput({ value, onChange, onPick, history, placeholder, style, ariaLabel, autoFocus, onEnter }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const matches = history.length ? matchMedicines(history, value, 6) : []
  const showList = open && matches.length > 0

  useEffect(() => {
    if (!open) return
    function onDoc(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  function pick(m: PastMedicine) {
    onPick(m)
    setOpen(false)
    setActive(-1)
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); setOpen(true); setActive(i => (i + 1) % matches.length); return }
    if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); setOpen(true); setActive(i => (i <= 0 ? matches.length - 1 : i - 1)); return }
    if (e.key === 'Enter') {
      if (showList && active >= 0) { e.preventDefault(); pick(matches[active]); return }
      if (onEnter) { e.preventDefault(); setOpen(false); onEnter() }
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 0 }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        style={{ ...style, width: '100%', boxSizing: 'border-box' }}
      />
      {showList && (
        <ul id={listId} role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, minWidth: 240, zIndex: 60,
          listStyle: 'none', margin: 0, padding: 4, background: '#fff', border: '1px solid #E2E8F0',
          borderRadius: 12, boxShadow: '0 10px 28px rgba(15,23,42,0.14)', maxHeight: 300, overflowY: 'auto',
          fontFamily: 'var(--font-body)', textAlign: 'left',
        }}>
          {!value.trim() && (
            <li aria-hidden style={{ padding: '6px 10px 4px', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>Your usual medicines</li>
          )}
          {matches.map((m, i) => {
            const on = i === active
            const details = pastMedicineDetails(m)
            return (
              <li
                key={m.name.toLowerCase()}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                // Keep focus in the box so the tap lands as a pick, not a blur.
                onPointerDown={e => e.preventDefault()}
                onClick={() => pick(m)}
                onPointerEnter={() => setActive(i)}
                style={{
                  padding: '9px 10px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, cursor: 'pointer',
                  background: on ? TINT : 'transparent', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  {details && <div style={{ fontSize: 12, color: MUTED, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{details}</div>}
                </div>
                <span style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }}>{m.count === 1 ? 'used once' : `used ${m.count}×`}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
