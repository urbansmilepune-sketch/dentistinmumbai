'use client'

// Small "Is this also your WhatsApp number?" box shown under a dentist's
// phone field (registration forms + profile editor). The default answer is
// "yes", so the WhatsApp number is filled from the phone without any extra
// typing; "Use a different number" reveals a separate WhatsApp input.
//
// The parent owns the state: `same` and `whatsapp`. On save it should store
// `same ? phone : whatsapp` (see resolveWhatsApp below).

import type { CSSProperties } from 'react'
import { formatIndianWhatsAppDigits } from '@/lib/phone'

interface Props {
  phone: string
  same: boolean
  whatsapp: string
  onChange: (next: { same: boolean; whatsapp: string }) => void
  inputStyle: CSSProperties
  // Set false when the page already has its own WhatsApp input.
  showInput?: boolean
}

// True when two raw numbers are the same Indian mobile (ignores spaces, +91, 0).
export function sameIndianNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = formatIndianWhatsAppDigits(a)
  return !!x && x === formatIndianWhatsAppDigits(b)
}

// The WhatsApp value to save for a given answer.
export function resolveWhatsApp(phone: string, same: boolean, whatsapp: string): string {
  return (same ? phone : whatsapp).trim()
}

export default function WhatsAppNumberPrompt({ phone, same, whatsapp, onChange, inputStyle, showInput = true }: Props) {
  const phoneOk = !!formatIndianWhatsAppDigits(phone)
  if (!phoneOk && same) return null

  const btn = (active: boolean): CSSProperties => ({
    flex: 1,
    minWidth: 140,
    padding: '9px 12px',
    borderRadius: 10,
    border: `1.5px solid ${active ? '#16A34A' : 'var(--border)'}`,
    background: active ? '#DCFCE7' : '#fff',
    color: active ? '#166534' : 'var(--text)',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  })

  return (
    <div role="group" aria-label="WhatsApp number" style={{ marginTop: 10, padding: '12px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 4 }}>
        💬 {phoneOk ? <>Use <span style={{ whiteSpace: 'nowrap' }}>{phone.trim()}</span> as your WhatsApp number?</> : 'Use your phone number as your WhatsApp number?'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        Patients tap WhatsApp on your profile to message you directly.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={btn(same)} aria-pressed={same}
          onClick={() => onChange({ same: true, whatsapp })}>
          {same ? '✓ ' : ''}Yes, use this number
        </button>
        <button type="button" style={btn(!same)} aria-pressed={!same}
          onClick={() => onChange({ same: false, whatsapp: sameIndianNumber(whatsapp, phone) ? '' : whatsapp })}>
          {!same ? '✓ ' : ''}Add a different number
        </button>
      </div>
      {!same && showInput && (
        <div style={{ marginTop: 10 }}>
          <input
            value={whatsapp}
            onChange={e => onChange({ same: false, whatsapp: e.target.value })}
            placeholder="10-digit WhatsApp number"
            type="tel"
            autoFocus
            style={inputStyle}
          />
        </div>
      )}
    </div>
  )
}
