'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePortalSession, loadPortalSession, type PortalClinic } from '@/lib/patientSession'

// Consumer-facing teal palette — deliberately distinct from the clinical blue
// of the dentist dashboard so the portal reads as a friendly patient space.
const TEAL = '#0D9488'
const TEAL_DARK = '#0F766E'
const TEAL_LIGHT = '#CCFBF1'

type Step = 'phone' | 'otp' | 'clinic'

export default function PatientLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [clinics, setClinics] = useState<PortalClinic[]>([])
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Already logged in? Skip straight to the dashboard.
  useEffect(() => {
    if (loadPortalSession()) router.replace('/patient/dashboard')
  }, [router])

  const phoneDigits = phone.replace(/\D/g, '').slice(-10)

  async function sendOtp() {
    setError(null); setInfo(null)
    if (!/^\d{10}$/.test(phoneDigits)) { setError('Enter a valid 10-digit mobile number.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/patient/otp/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not send OTP. Please try again.'); return }
      setStep('otp')
      setInfo(`We've sent a 6-digit code to ${phoneDigits}.`)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyOtp() {
    setError(null); setInfo(null)
    if (!/^\d{6}$/.test(otp.trim())) { setError('Enter the 6-digit code from your SMS.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/patient/otp/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits, otp: otp.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not verify the code.'); return }
      const list: PortalClinic[] = data.clinics || []
      if (list.length === 0) { setError('No clinic has enabled portal access for this number yet.'); return }
      setToken(data.token)
      setClinics(list)
      if (list.length === 1) {
        finish(data.token, list, list[0].patient_id)
      } else {
        setStep('clinic')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function finish(tok: string, list: PortalClinic[], patientId: string) {
    savePortalSession({ token: tok, phone: phoneDigits, clinics: list, selectedPatientId: patientId })
    router.replace('/patient/dashboard')
  }

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 20, padding: '28px 24px',
    boxShadow: '0 10px 40px rgba(13,148,136,0.12)', border: '1px solid #E2E8F0',
  }
  const input: React.CSSProperties = {
    width: '100%', padding: '16px 16px', fontSize: 18, borderRadius: 12,
    border: '2px solid #CBD5E1', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--font-body)', letterSpacing: step === 'otp' ? '0.3em' : 'normal',
    textAlign: step === 'otp' ? 'center' : 'left',
  }
  const button: React.CSSProperties = {
    width: '100%', padding: '16px', fontSize: 17, fontWeight: 700, color: '#fff',
    background: busy ? '#94A3B8' : TEAL, border: 'none', borderRadius: 12,
    cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', marginTop: 14,
  }

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TEAL_LIGHT} 0%, #F8FAFC 45%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', fontFamily: 'var(--font-body)' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 28 }}>
          <img src="/logo.png" alt="DentistIn" style={{ height: 44, objectFit: 'contain' }} />
        </div>

        <div style={card}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, color: '#0F172A', marginBottom: 6, textAlign: 'center' }}>
            Your Dental Records
          </h1>
          <p style={{ fontSize: 15, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
            Access your appointments, prescriptions and invoices
          </p>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 12, fontSize: 14, marginBottom: 16 }}>
              {error}
            </div>
          )}
          {info && !error && (
            <div style={{ background: TEAL_LIGHT, border: `1px solid ${TEAL}`, color: TEAL_DARK, padding: '12px 14px', borderRadius: 12, fontSize: 14, marginBottom: 16 }}>
              {info}
            </div>
          )}

          {step === 'phone' && (
            <>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>Mobile number</label>
              <input
                type="tel" inputMode="numeric" autoFocus
                value={phone} onChange={e => setPhone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendOtp() }}
                placeholder="10-digit mobile number" style={input}
              />
              <button onClick={sendOtp} disabled={busy} style={button}>{busy ? 'Sending…' : 'Send OTP'}</button>
            </>
          )}

          {step === 'otp' && (
            <>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>Enter the 6-digit code</label>
              <input
                type="tel" inputMode="numeric" autoFocus maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') verifyOtp() }}
                placeholder="······" style={input}
              />
              <button onClick={verifyOtp} disabled={busy} style={button}>{busy ? 'Verifying…' : 'Verify & Continue'}</button>
              <button onClick={() => { setStep('phone'); setOtp(''); setError(null); setInfo(null) }}
                style={{ width: '100%', padding: 12, marginTop: 10, background: 'none', border: 'none', color: TEAL_DARK, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                ← Change number
              </button>
            </>
          )}

          {step === 'clinic' && (
            <>
              <label style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 12 }}>Select your clinic</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {clinics.map(c => (
                  <button key={c.patient_id} onClick={() => finish(token, clinics, c.patient_id)}
                    style={{ textAlign: 'left', padding: '16px', borderRadius: 12, border: '2px solid #CBD5E1', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#0F172A' }}>{c.clinic_name || c.dentist_name || 'Clinic'}</div>
                    {c.dentist_name && <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Dr. {c.dentist_name.replace(/^dr\.?\s*/i, '')}</div>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#94A3B8', marginTop: 20, lineHeight: 1.6 }}>
          🔒 Your records are private and secured with a one-time password sent to your phone.
        </p>
      </div>
    </div>
  )
}
