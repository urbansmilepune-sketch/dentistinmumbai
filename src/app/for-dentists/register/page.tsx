'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const AREAS = ['Andheri', 'Bandra', 'Borivali', 'Chembur', 'Colaba', 'Dadar', 'Ghatkopar', 'Goregaon', 'Juhu', 'Kandivali', 'Kharghar', 'Kurla', 'Lower Parel', 'Malad', 'Mulund', 'Navi Mumbai', 'Powai', 'Santacruz', 'South Mumbai', 'Thane', 'Vashi', 'Vile Parle', 'Worli', 'Belapur']
const QUALIFICATIONS = ['BDS', 'BDS + MDS', 'BDS + Fellowship', 'MDS Specialist', 'BDS + Diploma']

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM-DR-'
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', clinic_name: '',
    area: '', qualification: '', mci_registration: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [refNo, setRefNo] = useState('')
  const [error, setError] = useState('')
  const [prefilledFromLogin, setPrefilledFromLogin] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const emailParam = params.get('email')
    if (emailParam) {
      setForm(f => ({ ...f, email: emailParam }))
      setPrefilledFromLogin(true)
    }
  }, [])

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setError('')
  }

  async function handleSubmit() {
    const required = ['name', 'phone', 'email', 'clinic_name', 'area', 'qualification', 'mci_registration']
    const missing = required.filter(k => !form[k as keyof typeof form])
    if (missing.length > 0) { setError('Please fill all required fields.'); return }
    if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) { setError('Please enter a valid 10-digit phone number.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, founding_number: Math.floor(Math.random() * 250) + 1 }),
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

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '1.5px solid var(--border)', fontSize: 14,
    fontFamily: 'var(--font-body)', outline: 'none',
    background: '#fff', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: 13, fontWeight: 600 as const, display: 'block' as const, marginBottom: 6 }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, background: 'var(--blue)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 17 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>DentistInMumbai<span style={{ color: 'var(--blue)' }}>.in</span></span>
          </Link>
          <Link href="/for-dentists/login" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>Already registered? Login →</Link>
        </nav>
      </header>

      <main style={{ padding: '48px 20px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {!success ? (
            <>
              {prefilledFromLogin && (
                <div style={{ padding: '14px 18px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, fontSize: 14, color: '#92400E', marginBottom: 24, lineHeight: 1.5 }}>
                  <strong>No account found for {form.email}.</strong> Please complete the registration below to claim your free listing — your profile will be activated within 24 hours.
                </div>
              )}
              {/* Hero */}
              <div style={{ textAlign: 'center', marginBottom: 36 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 40, marginBottom: 16 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>🏅 Founding Member Programme</span>
                </div>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', marginBottom: 12, lineHeight: 1.2 }}>
                  List Your Clinic Free
                </h1>
                <p style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 480, margin: '0 auto' }}>
                  Join Mumbai's fastest growing dental directory. Free forever for founding members. No credit card. No commission.
                </p>
              </div>

              {/* Trust bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 32 }}>
                {['✅ Free forever', '✅ Profile live in 24 hrs', '✅ No commission', '✅ No credit card'].map(item => (
                  <span key={item} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue-dark)' }}>{item}</span>
                ))}
              </div>

              {/* Form */}
              <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '32px' }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, marginBottom: 24 }}>Registration Form</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Name + Phone */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                    <input value={form.clinic_name} onChange={e => update('clinic_name', e.target.value)} placeholder="Your Dental Clinic" style={inputStyle} />
                  </div>

                  <div>
                    <label style={labelStyle}>Area in Mumbai *</label>
                    <select value={form.area} onChange={e => update('area', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">Select your area</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Qualification *</label>
                    <select value={form.qualification} onChange={e => update('qualification', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
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

                  <button
                    onClick={handleSubmit} disabled={submitting}
                    style={{ width: '100%', padding: '14px', background: '#FF6135', color: '#fff', border: 'none', borderRadius: 12, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
                  >{submitting ? 'Submitting...' : '🏅 Claim My Free Listing →'}</button>

                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                    Completely free · No credit card · No hidden charges · Profile live within 24 hours
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Success */
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 72, marginBottom: 20 }}>🎉</div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, marginBottom: 8 }}>
                Welcome, {form.name.split(' ')[0]}!
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 16, marginBottom: 28 }}>Your registration is confirmed.</p>

              <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 14, padding: '20px', marginBottom: 28 }}>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Reference Number</p>
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--blue)' }}>{refNo}</p>
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '24px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
                {[
                  { icon: '✅', text: `We will build and activate your clinic profile for ${form.clinic_name} in ${form.area} within 24 hours.` },
                  { icon: '📱', text: `We'll call you on ${form.phone} to collect photos and more details.` },
                  { icon: '🏅', text: `Your Founding Member badge and priority placement are reserved permanently.` },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.text}</p>
                  </div>
                ))}
              </div>

              <Link href="/for-dentists" style={{ display: 'inline-block', padding: '12px 28px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                Back to For Dentists →
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
