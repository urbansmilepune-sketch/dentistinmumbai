'use client'

// Floating "Help" button mounted at the bottom-right of the dashboard.
// Click expands a small popup with three CTAs: WhatsApp admin, email
// support, and a pre-shaped Bug Report WhatsApp link.
//
// This component renders unconditionally. Visibility is controlled by
// WHERE it's mounted, not WHAT it returns — it's imported from
// src/app/for-dentists/dashboard/layout.tsx so it only appears under
// authenticated dashboard routes. Public pages and admin don't mount
// it at all. This removes every previous source of "button missing"
// bugs (pathname null on first render, hydration mismatches, route
// transitions wiping mounted state).

import { useEffect, useRef, useState } from 'react'

const ADMIN_WHATSAPP = '917719903232'
const SUPPORT_EMAIL = 'support@dentistinmumbai.in'

export default function SupportButton() {
  const [open, setOpen] = useState(false)
  // Drives a 5-second pulse on the trigger when the button first mounts
  // so the dentist actually notices it exists. After the timer elapses
  // the pulse class drops off and the button stays static.
  const [pulsing, setPulsing] = useState(true)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Esc — popup overlays page content so we want
  // the same dismissal pattern as a menu.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Stop pulsing after 5s. Mount-only effect — fires once when the user
  // lands on any dashboard route. We don't reset it on inner navigation
  // because the dashboard layout doesn't unmount this component as the
  // dentist clicks between sub-pages.
  useEffect(() => {
    const t = setTimeout(() => setPulsing(false), 5000)
    return () => clearTimeout(t)
  }, [])

  function currentUrl(): string {
    if (typeof window === 'undefined') return ''
    return window.location.href
  }

  function openWhatsApp() {
    const text = `Hi, I need help with DentistIn. ${currentUrl()}`
    window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  function openEmail() {
    window.location.href = `mailto:${SUPPORT_EMAIL}`
    setOpen(false)
  }

  function openBugReport() {
    const text = `🐛 Bug Report: [describe issue] Page: ${currentUrl()}`
    window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    // .support-button-wrap in globals.css applies `display: flex !important`
    // so no upstream rule can hide the wrapper. wrapStyle below still sets
    // display:flex as the inline default — the class is belt-and-suspenders.
    <div ref={wrapRef} className="support-button-wrap" style={wrapStyle}>
      {open && (
        <div role="dialog" aria-label="Support options" style={popupStyle}>
          <div style={popupHeaderStyle}>
            <span>How can we help?</span>
            <button type="button" aria-label="Close support" onClick={() => setOpen(false)} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={openWhatsApp} style={{ ...optionStyle, background: '#25D366', color: '#fff' }}>
              <span style={iconStyle}>💬</span>
              <span style={{ flex: 1 }}>
                <span style={labelStyle}>WhatsApp Us</span>
                <span style={hintStyle}>Fastest — we usually reply in minutes</span>
              </span>
            </button>
            <button type="button" onClick={openEmail} style={optionStyle}>
              <span style={iconStyle}>📧</span>
              <span style={{ flex: 1 }}>
                <span style={labelStyle}>Email Us</span>
                <span style={hintStyle}>{SUPPORT_EMAIL}</span>
              </span>
            </button>
            <button type="button" onClick={openBugReport} style={{ ...optionStyle, background: '#FEE2E2', borderColor: '#FECACA' }}>
              <span style={iconStyle}>🐛</span>
              <span style={{ flex: 1 }}>
                <span style={{ ...labelStyle, color: '#991B1B' }}>Report a Bug</span>
                <span style={hintStyle}>Pre-fills WhatsApp with this page URL</span>
              </span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={open ? 'Close help' : 'Open help'}
        aria-expanded={open}
        onClick={() => { setOpen(v => !v); setPulsing(false) }}
        className={pulsing && !open ? 'support-trigger-pulse' : undefined}
        style={triggerStyle}
      >
        <span style={{ fontSize: 20 }}>{open ? '✕' : '💬'}</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{open ? 'Close' : 'Help'}</span>
      </button>

      <style>{`
        @keyframes support-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(0, 63, 122, 0.55), 0 8px 24px rgba(0, 63, 122, 0.32); }
          70%  { box-shadow: 0 0 0 14px rgba(0, 63, 122, 0), 0 8px 24px rgba(0, 63, 122, 0.32); }
          100% { box-shadow: 0 0 0 0 rgba(0, 63, 122, 0), 0 8px 24px rgba(0, 63, 122, 0.32); }
        }
        .support-trigger-pulse {
          animation: support-pulse 1.6s ease-out infinite;
        }
      `}</style>
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  position: 'fixed',
  right: 24,
  bottom: 24,
  zIndex: 9999,
  fontFamily: 'var(--font-body)',
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10,
}

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 10,
  padding: '12px 20px', minHeight: 52,
  background: '#003F7A', color: '#fff',
  border: 'none', borderRadius: 50,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
  boxShadow: '0 12px 28px rgba(0, 63, 122, 0.35), 0 4px 8px rgba(0, 63, 122, 0.2)',
}

const popupStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #E2E8F0',
  boxShadow: '0 16px 40px rgba(15, 25, 35, 0.18)',
  padding: 14,
  width: 280,
  maxWidth: 'calc(100vw - 40px)',
}

const popupHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  fontWeight: 700, fontSize: 14, color: '#0F1923',
  marginBottom: 10,
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 16, lineHeight: 1,
  cursor: 'pointer', color: '#64748B', padding: 4,
}

const optionStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  width: '100%', padding: '10px 12px',
  background: '#F8FAFC', border: '1px solid #E2E8F0',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  textAlign: 'left',
}

const iconStyle: React.CSSProperties = {
  fontSize: 20, lineHeight: 1, flexShrink: 0,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 700, fontSize: 13, color: '#0F1923', marginBottom: 2,
}

const hintStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748B',
}
