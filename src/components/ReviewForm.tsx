'use client'

import { useState } from 'react'

interface Props {
  dentistId: string
  dentistName: string
}

export default function ReviewForm({ dentistId, dentistName }: Props) {
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    patient_name: '', phone: '', rating: 0, review_text: '', treatment: '',
  })
  const [otp, setOtp] = useState('')
  const [hoverRating, setHoverRating] = useState(0)

  async function sendOTP() {
    if (!form.patient_name || !form.phone || !form.rating || !form.review_text) {
      setError('Please fill all required fields'); return
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
      setError('Enter a valid 10-digit phone number'); return
    }
    if (form.review_text.length < 20) {
      setError('Please write at least 20 characters'); return
    }
    setLoading(true); setError('')
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_otp', phone: form.phone }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) setStep('otp')
    else setError(data.error || 'Failed to send OTP')
  }

  async function submitReview() {
    if (!otp || otp.length !== 6) { setError('Enter the 6-digit OTP'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_review',
        phone: form.phone, otp,
        dentist_id: dentistId,
        patient_name: form.patient_name,
        rating: form.rating,
        review_text: form.review_text,
        treatment: form.treatment,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) setStep('done')
    else setError(data.error || 'Failed to submit review')
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }

  if (step === 'done') return (
    <div style={{ textAlign: 'center', padding: '32px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Review Submitted!</h3>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>Thank you for your feedback. Your review will appear after approval.</p>
    </div>
  )

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Write a Review</h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Share your experience with {dentistName}</p>

      {error && <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: 8, fontSize: 13, color: '#991B1B', marginBottom: 16 }}>⚠️ {error}</div>}

      {step === 'form' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Your Name *</label>
              <input value={form.patient_name} onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))} placeholder="First name is fine" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone *</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="For OTP verification" type="tel" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>Rating *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} type="button"
                  onClick={() => setForm(f => ({ ...f, rating: star }))}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 32, color: star <= (hoverRating || form.rating) ? '#F59E0B' : '#D1D5DB', transition: 'color 0.1s', padding: '0 2px' }}>
                  ★
                </button>
              ))}
              {form.rating > 0 && <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>{['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][form.rating]}</span>}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Treatment Received</label>
            <input value={form.treatment} onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))} placeholder="e.g. Dental Implants, Root Canal, Braces" style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Your Review * <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(min 20 characters)</span></label>
            <textarea value={form.review_text} onChange={e => setForm(f => ({ ...f, review_text: e.target.value }))} placeholder="Share your experience — what did you like? How was the treatment and staff?" rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: form.review_text.length >= 20 ? 'var(--green)' : 'var(--muted)', marginTop: 3 }}>{form.review_text.length} characters</div>
          </div>

          <button onClick={sendOTP} disabled={loading}
            style={{ padding: '12px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Sending OTP...' : 'Verify & Submit →'}
          </button>
        </div>
      )}

      {step === 'otp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--blue-light)', borderRadius: 10 }}>
            <p style={{ fontSize: 14, color: 'var(--blue)' }}>OTP sent to <strong>{form.phone}</strong></p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Valid for 10 minutes</p>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Enter 6-digit OTP</label>
            <input value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
              placeholder="______" type="tel" maxLength={6}
              style={{ ...inputStyle, fontSize: 24, letterSpacing: 8, textAlign: 'center' }} />
          </div>
          <button onClick={submitReview} disabled={loading || otp.length !== 6}
            style={{ padding: '12px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: loading || otp.length !== 6 ? 0.7 : 1 }}>
            {loading ? 'Submitting...' : 'Submit Review'}
          </button>
          <button onClick={() => { setStep('form'); setOtp(''); setError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            ← Edit my review
          </button>
        </div>
      )}
    </div>
  )
}
