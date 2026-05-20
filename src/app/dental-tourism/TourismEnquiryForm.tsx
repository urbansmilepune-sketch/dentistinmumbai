'use client'

// Contact form for /dental-tourism. Posts to /api/dental-tourism. Mirrors
// the NotifyMeModal pattern: inline-rendered success state instead of a
// toast, so the form replaces itself when submission lands and the user
// doesn't have to wonder whether it worked.

import { useState } from 'react'

const TREATMENT_OPTIONS = [
  'Dental Implants',
  'Full-mouth restoration',
  'Veneers / Smile makeover',
  'Crowns & bridges',
  'Root canal',
  'Orthodontics / Aligners',
  'Cosmetic dentistry',
  'Other',
]

export default function TourismEnquiryForm() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [country, setCountry] = useState('')
  const [message, setMessage] = useState('')
  const [picked, setPicked]   = useState<string[]>([])
  const [state, setState]     = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function togglePick(t: string) {
    setPicked(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/dental-tourism', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone, country, message,
          treatments: picked,
          source: 'dental_tourism_page',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setState('sent')
      } else {
        setState('error')
        setErrorMsg(data?.error || 'Could not send right now. Try again?')
      }
    } catch {
      setState('error')
      setErrorMsg('Network error — please try again.')
    }
  }

  if (state === 'sent') {
    return (
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#166534', marginBottom: 8 }}>Enquiry received</h3>
        <p style={{ fontSize: 14, color: '#166534', lineHeight: 1.6 }}>
          Our dental tourism team will email you within one business day with cost estimates, recommended clinics, and travel guidance.
        </p>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', minHeight: 44,
    borderRadius: 8, border: '1.5px solid #E2E8F0',
    fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
    background: '#fff', color: '#0F1923',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 28, boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label htmlFor="t-name" style={labelStyle}>Full name</label>
          <input id="t-name" required value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
        </div>
        <div>
          <label htmlFor="t-email" style={labelStyle}>Email</label>
          <input id="t-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="t-phone" style={labelStyle}>Phone / WhatsApp (with country code)</label>
          <input id="t-phone" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="+1 555 123 4567" />
        </div>
        <div>
          <label htmlFor="t-country" style={labelStyle}>Country</label>
          <input id="t-country" value={country} onChange={e => setCountry(e.target.value)} style={inputStyle} placeholder="United Kingdom" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Treatments you're interested in (pick any)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TREATMENT_OPTIONS.map(t => {
            const active = picked.includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => togglePick(t)}
                style={{
                  padding: '7px 12px', minHeight: 34,
                  borderRadius: 999,
                  fontSize: 12, fontWeight: 600,
                  background: active ? '#1D4ED8' : '#fff',
                  color: active ? '#fff' : '#475569',
                  border: `1px solid ${active ? '#1D4ED8' : '#E2E8F0'}`,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >{t}</button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="t-msg" style={labelStyle}>Tell us about your case (optional)</label>
        <textarea
          id="t-msg"
          rows={4}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Diagnosis, urgency, preferred travel dates, anything else useful."
          style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
        />
      </div>

      {state === 'error' && (
        <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 12 }}>{errorMsg}</div>
      )}

      <button
        type="submit"
        disabled={state === 'sending'}
        style={{ width: '100%', padding: '13px 16px', minHeight: 48, background: state === 'sending' ? '#93C5FD' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: state === 'sending' ? 'wait' : 'pointer' }}
      >
        {state === 'sending' ? 'Sending…' : 'Send my enquiry'}
      </button>
      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 10, textAlign: 'center' }}>
        We respond within one business day. Your details are stored only for follow-up — no marketing, no third-party sharing.
      </p>
    </form>
  )
}
