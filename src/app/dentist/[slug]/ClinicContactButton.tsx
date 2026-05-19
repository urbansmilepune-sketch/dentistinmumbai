'use client'

// Floating "Contact Clinic" button on the public dentist profile.
//
// This is NOT the dashboard's platform-support button — it dials the dentist
// directly via the same wa.me / tel: links the hero CTAs already use, and
// records whatsapp_click / call_click events through the same analytics
// endpoint TrackedLink uses, so the dentist's dashboard counters stay
// consistent however the patient initiated contact.
//
// Mobile collapses to the bottom action bar that page.tsx already renders —
// the floating bubble would double up on small screens, so a media rule
// below hides it under 768px.

import { useEffect, useRef, useState } from 'react'

interface Props {
  dentistId: string
  clinicName: string
  /** Fully formed wa.me link with prefill, or null when no usable number. */
  whatsappUrl: string | null
  /** Raw phone for `tel:` link, or null when none. */
  phone: string | null
}

function track(dentistId: string, eventType: 'whatsapp_click' | 'call_click') {
  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dentist_id: dentistId, event_type: eventType }),
    keepalive: true,
  }).catch(() => {})
}

export default function ClinicContactButton({ dentistId, clinicName, whatsappUrl, phone }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  // If the dentist has neither a WhatsApp number nor a phone number, there's
  // nothing for this button to do — don't render. The hero CTAs already
  // guard the same way, so a dentist with zero contact channels stays
  // contact-less rather than getting a button that opens an empty popup.
  if (!whatsappUrl && !phone) return null

  return (
    <div ref={wrapRef} className="clinic-contact-wrap">
      {open && (
        <div role="dialog" aria-label="Contact clinic options" style={popupStyle}>
          <div style={popupHeaderStyle}>
            <span>Contact {clinicName}</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank" rel="noopener noreferrer"
                onClick={() => { track(dentistId, 'whatsapp_click'); setOpen(false) }}
                style={{ ...optionStyle, background: '#25D366', color: '#fff', borderColor: '#1FB854' }}
              >
                <span style={iconStyle}>💬</span>
                <span style={{ flex: 1 }}>
                  <span style={labelStyle}>WhatsApp</span>
                  <span style={{ ...hintStyle, color: 'rgba(255,255,255,0.85)' }}>Usually replies in minutes</span>
                </span>
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                onClick={() => { track(dentistId, 'call_click'); setOpen(false) }}
                style={optionStyle}
              >
                <span style={iconStyle}>📞</span>
                <span style={{ flex: 1 }}>
                  <span style={labelStyle}>Call</span>
                  <span style={hintStyle}>{phone}</span>
                </span>
              </a>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={open ? 'Close contact options' : 'Contact this clinic'}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={triggerStyle}
      >
        <span style={{ fontSize: 16 }}>{open ? '✕' : '💬'}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{open ? 'Close' : 'Contact Clinic'}</span>
      </button>

      <style>{`
        .clinic-contact-wrap {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 95;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          font-family: var(--font-body);
        }
        /* Hide on mobile — the sticky bottom action bar already covers
           WhatsApp + Call + Book and would visually clash with this. */
        @media (max-width: 768px) {
          .clinic-contact-wrap { display: none !important; }
        }
      `}</style>
    </div>
  )
}

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 16px', minHeight: 44,
  background: '#003F7A', color: '#fff',
  border: 'none', borderRadius: 40,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(0, 63, 122, 0.32), 0 2px 6px rgba(0, 63, 122, 0.18)',
}

const popupStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #E2E8F0',
  boxShadow: '0 16px 40px rgba(15, 25, 35, 0.18)',
  padding: 12,
  width: 260,
  maxWidth: 'calc(100vw - 40px)',
}

const popupHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  fontWeight: 700, fontSize: 13, color: '#0F1923',
  marginBottom: 10,
  gap: 8,
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 14, lineHeight: 1,
  cursor: 'pointer', color: '#64748B', padding: 4,
}

const optionStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%', padding: '9px 11px', boxSizing: 'border-box',
  background: '#F8FAFC', border: '1px solid #E2E8F0',
  borderRadius: 9,
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  textAlign: 'left',
  textDecoration: 'none',
  color: '#0F1923',
}

const iconStyle: React.CSSProperties = {
  fontSize: 18, lineHeight: 1, flexShrink: 0,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 1,
}

const hintStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748B',
}
