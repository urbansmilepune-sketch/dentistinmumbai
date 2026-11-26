'use client'

// Three columns on desktop (profile | feed | my clinic). On a phone the
// profile becomes a short strip and the two other columns become tabs, so
// nothing is squeezed. Ashish asked for no "National" / "City" labels.

import { useState } from 'react'

interface Props {
  strip: React.ReactNode
  left: React.ReactNode
  mid: React.ReactNode
  right: React.ReactNode
}

export default function HomeColumns({ strip, left, mid, right }: Props) {
  const [tab, setTab] = useState<'feed' | 'clinic'>('feed')
  const tabBtn = (on: boolean): React.CSSProperties => ({
    minHeight: 42, borderRadius: 999, border: on ? '1px solid #1D4ED8' : '1px solid #CBD5E1',
    background: on ? '#1D4ED8' : '#fff', color: on ? '#fff' : '#334155', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', fontFamily: 'var(--font-body)',
  })
  return (
    <div data-tab={tab} className="dh-wrap">
      <style>{`
        .dh-grid{display:grid;grid-template-columns:280px minmax(0,1fr) 320px;gap:24px;align-items:start;max-width:1240px;margin:0 auto;padding:20px 24px 48px}
        .dh-col{display:flex;flex-direction:column;gap:14px;min-width:0}
        .dh-sticky{position:sticky;top:76px}
        .dh-strip,.dh-tabs{display:none}
        @media (max-width:1080px){.dh-grid{grid-template-columns:240px minmax(0,1fr) 280px;gap:16px;padding:16px}}
        @media (max-width:860px){
          .dh-grid{grid-template-columns:minmax(0,1fr);gap:14px;padding:14px 14px 40px}
          .dh-left{display:none}
          .dh-strip{display:block}
          .dh-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 14px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:64px;z-index:20}
          .dh-wrap[data-tab="feed"] .dh-right{display:none}
          .dh-wrap[data-tab="clinic"] .dh-mid{display:none}
          .dh-sticky{position:static}
          .dh-hnav{display:none!important}
        }
      `}</style>
      <div className="dh-strip">{strip}</div>
      <div className="dh-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'feed'} style={tabBtn(tab === 'feed')} onClick={() => setTab('feed')}>Feed</button>
        <button type="button" role="tab" aria-selected={tab === 'clinic'} style={tabBtn(tab === 'clinic')} onClick={() => setTab('clinic')}>My clinic</button>
      </div>
      <div className="dh-grid">
        <aside className="dh-col dh-left"><div className="dh-col dh-sticky">{left}</div></aside>
        <main className="dh-col dh-mid">{mid}</main>
        <aside className="dh-col dh-right">{right}</aside>
      </div>
    </div>
  )
}
