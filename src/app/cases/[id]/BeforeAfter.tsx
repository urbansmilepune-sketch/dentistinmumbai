'use client'

// Before/after comparison slider for a case. Drag the range control to
// reveal more of the "before" image over the "after" image.

import { useState } from 'react'

export default function BeforeAfter({ before, after, afterLabel }: { before: string; after: string; afterLabel: string }) {
  const [pct, setPct] = useState(50)
  return (
    <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: '#0F1923', margin: '0 0 12px' }}>Before and after</h2>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden', background: '#0F1923' }}>
        <img src={after} alt={afterLabel} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, overflow: 'hidden' }}>
          <img src={before} alt="Before treatment" style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${10000 / Math.max(pct, 1)}%`, maxWidth: 'none', objectFit: 'contain' }} />
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${pct}% - 1px)`, width: 2, background: '#fff' }} />
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(15,25,35,0.7)', padding: '3px 8px', borderRadius: 6 }}>Before</span>
        <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(15,25,35,0.7)', padding: '3px 8px', borderRadius: 6 }}>{afterLabel}</span>
      </div>
      <label htmlFor="ba-slider" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 10 }}>Slide to compare</label>
      <input id="ba-slider" type="range" min={0} max={100} value={pct} onChange={e => setPct(Number(e.target.value))} style={{ width: '100%', minHeight: 32 }} />
    </section>
  )
}
