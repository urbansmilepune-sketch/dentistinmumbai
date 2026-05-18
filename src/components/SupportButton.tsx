'use client'

// Floating "Help" button mounted at the bottom-right of the dashboard.
// Click expands a small popup with two-or-three CTAs: WhatsApp admin,
// email support, and a pre-shaped Bug Report WhatsApp link. The button
// is intentionally hidden on every public page — patients don't need
// support chat and surfacing it there would muddle the dentist-support
// triage queue.

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const ADMIN_WHATSAPP = '917719903232'
const SUPPORT_EMAIL = 'support@dentistinmumbai.in'

function isDashboardPath(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith('/for-dentists/dashboard')
}

export default function SupportButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Drives a 5-second pulse on the trigger when the button first mounts
  // (or when the dentist lands on a fresh dashboard page) so they
  // actually notice the support entry point exists. After the timer
  // elapses the pulse class drops off and the button stays static.
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

  // Stop pulsing after 5s. Resets whenever the dentist navigates to a
  // different dashboard page so the attention-getter re-fires once per
  // route (it does NOT re-fire on the same route or on inner navigation
  // that doesn't change pathname).
  useEffect(() => {
    setPulsing(true)
    const t = setTimeout(() => setPulsing(false), 5000)
    return () => clearTimeout(t)
  }, [pathname])

  // Render nothing on public pages. usePathname() can be null during the
  // very first render in certain Next.js scenarios — treat null as "not
  // a dashboard route" and hide.
  if (!isDashboardPath(pathname)) return null

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
    <div ref={wrapRef} style={wrapStyle}>
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
