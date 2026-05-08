'use client'

import { useState } from 'react'

interface FaqItem { q: string; a: string }

export default function AreaFAQAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          background: '#fff', border: `1px solid ${open === i ? 'var(--blue)' : 'var(--border)'}`,
          borderRadius: 12, overflow: 'hidden',
          boxShadow: open === i ? '0 0 0 3px var(--blue-light)' : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, padding: '16px 20px', background: 'none', border: 'none',
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
              color: open === i ? 'var(--blue)' : 'var(--text)', textAlign: 'left', cursor: 'pointer',
            }}
          >
            <span>{item.q}</span>
            <span style={{ fontSize: 20, color: 'var(--blue)', flexShrink: 0, lineHeight: 1 }}>{open === i ? '−' : '+'}</span>
          </button>
          {open === i && (
            <div style={{ padding: '0 20px 16px' }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
