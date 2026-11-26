'use client'

// "For patients" button in the signed-out home header. Patients never book on
// dentistinindia.in: treatments go to Find an expert, cities go to the city
// site where booking happens.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Props {
  treatments: Array<{ slug: string; label: string }>
  cities: Array<{ name: string; domain: string }>
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 34, padding: '0 12px', borderRadius: 999,
  border: '1px solid #CBD5E1', background: '#fff', fontSize: 13, color: '#0F1923', textDecoration: 'none',
}

export default function PatientsMenu({ treatments, cities }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', borderRadius: 999, background: '#EFF6FF', color: '#1E3A8A', border: '1px solid #DBEAFE', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
      >
        For patients
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 'min(320px, calc(100vw - 32px))', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, boxShadow: '0 16px 40px rgba(15,25,35,0.16)', padding: 16, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#0F1923' }}>Looking for a dentist?</div>
          <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>Find dentists by the work they have shared with other dentists.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {treatments.map(t => <Link key={t.slug} href={`/experts?t=${t.slug}`} style={chip}>{t.label}</Link>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748B', fontSize: 12.5 }}>
            <span style={{ flex: 1, height: 1, background: '#E2E8F0' }} />or book in your city<span style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cities.map(c => <a key={c.domain} href={`https://${c.domain}`} style={chip}>{c.name}</a>)}
            <Link href="/cities" style={{ ...chip, fontWeight: 700, color: '#1D4ED8' }}>All cities</Link>
          </div>
        </div>
      )}
    </div>
  )
}
