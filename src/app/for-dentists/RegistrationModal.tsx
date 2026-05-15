'use client'

import { useState } from 'react'

interface RegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  foundingNumber: number
  areas: string[]
  cityName?: string
  citySlug?: string
}

const QUALIFICATIONS = [
  'BDS',
  'BDS + MDS',
  'BDS + Fellowship',
  'MDS Specialist',
  'BDS + Diploma',
]

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM-DR-'
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export default function RegistrationModal({ isOpen, onClose, foundingNumber, areas, cityName = 'Mumbai', citySlug = 'mumbai' }: RegistrationModalProps) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', clinic_name: '',
    area: '', qualification: '', mci_registration: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [refNo, setRefNo] = useState('')
  const [error, setError] = useState('')

  const spotNumber = foundingNumber + 1

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setError('')
  }

  async function handleSubmit() {
    const required = ['name', 'phone', 'email', 'clinic_name', 'area', 'qualification', 'mci_registration']
    const missing = required.filter(k => !form[k as keyof typeof form])
    if (missing.length > 0) { setError('Please fill all required fields.'); return }

    if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
      setError('Please enter a valid 10-digit phone number.'); return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, founding_number: spotNumber, city: citySlug }),
      })
      const data = await res.json()
      if (data.ref_no) {
        setRefNo(data.ref_no)
        setSuccess(true)
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  function handleClose() {
    setForm({ name: '', phone: '', email: '', clinic_name: '', area: '', qualification: '', mci_registration: '' })
    setSuccess(false); setRefNo(''); setError('')
    onClose()
  }

  if (!isOpen) return null

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid var(--border)', fontSize: 14,
    fontFamily: 'var(--font-body)', outline: 'none',
    color: 'var(--text)', background: '#fff',
  }

  const labelStyle = { fontSize: 13, fontWeight: 600 as const, display: 'block' as const, marginBottom: 6, color: 'var(--text)' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />

      <div style={{
        position: 'relative', background: '#fff', borderRadius: 20,
        width: '100%', maxWidth: 560, maxHeight: '92vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '2px 10px', borderRadius: 20, border: '1px solid #FDE68A' }}>
                  🏅 Founding Member Spot #{spotNumber}
                </span>
              </div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 4 }}>List Your Clinic Free</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                You are joining as one of the first 250 dentists. Permanent priority placement and Founding Member badge reserved.
              </p>
            </div>
            <button onClick={handleClose} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 16, cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}>✕</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {!success ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Name + Phone row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Dr. Your Name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone Number *</label>
                  <input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="10-digit number" type="tel" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Email Address *</label>
                <input value={form.email} onChange={e => update('email', e.target.value)} placeholder="your@email.com" type="email" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Clinic Name *</label>
                <input value={form.clinic_name} onChange={e => update('clinic_name', e.target.value)} placeholder="Your Dental Clinic Name" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Area in {cityName} *</label>
                <select value={form.area} onChange={e => update('area', e.target.value)} style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as any }}>
                  <option value="">Select your area</option>
                  {areas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Qualification *</label>
                <select value={form.qualification} onChange={e => update('qualification', e.target.value)} style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as any }}>
                  <option value="">Select qualification</option>
                  {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>MCI / DCI Registration No. *</label>
                <input value={form.mci_registration} onChange={e => update('mci_registration', e.target.value)} placeholder="Your registration number" style={inputStyle} />
              </div>

              {error && (
                <div style={{ padding: '12px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B' }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          ) : (
            /* Success screen */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>
                Welcome, {form.name.split(' ')[0]}!
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
                Your Founding Member registration is confirmed.
              </p>

              <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 14, padding: '16px', marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Reference Number</p>
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--blue)' }}>{refNo}</p>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                {[
                  { icon: '✅', text: `Our team will build and activate your clinic profile for ${form.clinic_name} in ${form.area} within 24 hours.` },
                  { icon: '📱', text: `We'll call you on ${form.phone} to collect photos and details.` },
                  { icon: '🏅', text: `You are Founding Member #${spotNumber} — your priority placement and badge are reserved permanently.` },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.text}</p>
                  </div>
                ))}
              </div>

              <button onClick={handleClose} className="btn btn-primary" style={{ width: '100%' }}>Done</button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, background: '#fff' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: '100%', padding: '14px', background: '#FF6135', color: '#fff',
                border: 'none', borderRadius: 12, fontFamily: 'var(--font-body)',
                fontWeight: 700, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1, marginBottom: 10,
              }}
            >{submitting ? 'Submitting...' : '🏅 Claim My Founding Member Spot →'}</button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
              ✅ Completely free · No credit card · No hidden charges · Profile live within 24 hours
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  )
}
