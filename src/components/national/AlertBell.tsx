'use client'

// Bell with the unseen-alert count, in the dentistinindia.in header
// (27 Nov 2026). Opens a short list of the latest alerts and clears the
// count. Signed-out visitors never see it: NationalShell doesn't read auth,
// so this checks for a Supabase session cookie before asking the server.
// See src/lib/networkAlerts.ts and src/app/api/network-alerts.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AlertLine, { type AlertLineItem } from './AlertLine'

export default function AlertBell() {
  const [ready, setReady] = useState(false)
  const [unseen, setUnseen] = useState(0)
  const [items, setItems] = useState<AlertLineItem[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let alive = true
    if (!/sb-[^=]*-auth-token/.test(document.cookie)) return
    fetch('/api/network-alerts?limit=5', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j) { setUnseen(j.unseen || 0); setItems(j.items || []); setReady(true) } })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])

  if (!ready) return null

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unseen > 0) {
      setUnseen(0)
      fetch('/api/network-alerts/seen', { method: 'POST' }).catch(() => {})
    }
  }

  return (
    <span ref={box} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unseen ? `Alerts, ${unseen} new` : 'Alerts'}
        style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#0F1923', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {unseen > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 19, height: 19, padding: '0 5px', borderRadius: 99, background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
            {unseen > 99 ? '99+' : unseen}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Alerts" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 'min(360px, calc(100vw - 24px))', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, boxShadow: '0 14px 34px rgba(15,25,35,.16)', padding: '8px 14px 12px', zIndex: 80 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <strong style={{ fontSize: 15, color: '#0F1923' }}>Alerts</strong>
            <Link href="/alerts" onClick={() => setOpen(false)} style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>See all</Link>
          </div>
          {items.length === 0 ? (
            <p style={{ margin: '8px 0 4px', fontSize: 13.5, color: '#64748B', lineHeight: 1.5 }}>
              No alerts yet. When a dentist follows you, likes your case or replies, it shows here.
            </p>
          ) : (
            <div>{items.map((it, i) => <AlertLine key={it.key} item={it} first={i === 0} compact onClick={() => setOpen(false)} />)}</div>
          )}
        </div>
      )}
    </span>
  )
}
