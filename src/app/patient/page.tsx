'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCityBySlug } from '@/config/cities'
import { createClient } from '@/lib/supabase/client'
import { savePortalSession, loadPortalSession, takeIdleLogoutNotice, type PortalClinic } from '@/lib/patientSession'

// Patient app login. Same navy/teal as the dentist app.
const NAVY = '#0F172A'
const TEAL = '#14B8A6'
const TEAL_DARK = '#0F766E'
const TEAL_LIGHT = '#CCFBF1'

type Step = 'phone' | 'otp' | 'clinic'
// How the patient logs in: SMS code to their mobile, email code, or Google
// (same choices as the dentist login).
type Mode = 'phone' | 'email'

export default function PatientLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [mode, setMode] = useState<Mode>('phone')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gBusy, setGBusy] = useState(false)
  const [otp, setOtp] = useState('')
  const [clinics, setClinics] = useState<PortalClinic[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const phoneDigits = phone.replace(/\D/g, '').slice(-10)
  const emailClean = email.trim().toLowerCase()
  // What we send to the API and keep in the saved session.
  const loginBody = mode === 'email' ? { email: emailClean } : { phone: phoneDigits }
  const loginId = mode === 'email' ? emailClean : phoneDigits

  async function sendOtp() {
    setError(null); setInfo(null)
    if (mode === 'phone' && !/^\d{10}$/.test(phoneDigits)) { setError('Enter a valid 10-digit mobile number.'); return }
    if (mode === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) { setError('Enter a valid email address.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/patient/otp/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(loginBody),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not send OTP. Please try again.'); return }
      setStep('otp')
      setInfo(`We've sent a 6-digit code to ${loginId}.`)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyOtp() {
    setError(null); setInfo(null)
    if (!/^\d{6}$/.test(otp.trim())) { setError(`Enter the 6-digit code from your ${mode === 'email' ? 'email' : 'SMS'}.`); return }
    setBusy(true)
    try {
      const res = await fetch('/api/patient/otp/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...loginBody, otp: otp.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not verify the code.'); return }
      showClinics(data.clinics || [], loginId)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // The login id (phone or email) the clinic list belongs to.
  const [loggedInAs, setLoggedInAs] = useState('')
  function showClinics(list: PortalClinic[], id: string) {
    if (list.length === 0) { setError('We could not find any dental records for this login.'); return }
    setLoggedInAs(id)
    setClinics(list)
    if (list.length === 1) finish(list, list[0].patient_id, id)
    else setStep('clinic')
  }

  async function finishFromServer() {
    setBusy(true)
    try {
      const res = await fetch('/api/patient/session', { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not log you in. Please try again.'); return }
      showClinics(data.clinics || [], data.email || data.phone || '')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function googleLogin() {
    setError(null); setInfo(null); setGBusy(true)
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/patient/google/callback` },
    })
    if (authError) { setError('Google sign-in did not work. Please try again.'); setGBusy(false) }
  }

  function finish(list: PortalClinic[], patientId: string, id = loggedInAs) {
    // `phone` holds the login id: the mobile number, or the email for email
    // and Google logins.
    savePortalSession({ phone: id, clinics: list, selectedPatientId: patientId })
    router.replace('/patient/dashboard')
  }

  // Already logged in? Skip straight to the dashboard. If we just logged
  // them out for being idle, say so.
  useEffect(() => {
    if (loadPortalSession()) { router.replace('/patient/dashboard'); return }
    // Back from Google: the server has set the login cookie, fetch the clinics.
    const params = new URLSearchParams(window.location.search)
    const back = params.get('login') === 'google' ? 'ok' : params.get('error')
    if (back) {
      // Clean the URL inside the timer so a re-run of this effect (React
      // strict mode) still sees the params.
      const clean = () => window.history.replaceState(null, '', '/patient')
      if (back === 'ok') {
        const t = window.setTimeout(() => { clean(); finishFromServer() }, 0)
        return () => window.clearTimeout(t)
      }
      const t = window.setTimeout(() => { clean(); setError(back === 'google_no_records'
        ? `We could not find any dental records for ${params.get('email') || 'this Google account'}. Log in with the mobile number or email you gave at the clinic.`
        : 'Google sign-in did not work. Please try again, or use your mobile number.') }, 0)
      return () => window.clearTimeout(t)
    }
    if (!takeIdleLogoutNotice()) return
    const t = window.setTimeout(() => setInfo('You were logged out after 7 days without using the app. Log in again with your mobile number.'), 0)
    return () => window.clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on load
  }, [router])

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 20, padding: '28px 24px',
    boxShadow: '0 18px 40px rgba(15,23,42,0.18)', border: '1px solid #E2E8F0',
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
    <div style={{ minHeight: '100dvh', background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY} 260px, #F1F5F9 260px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(env(safe-area-inset-top) + 24px) 16px 24px', fontFamily: 'var(--font-body)' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginTop: 12, marginBottom: 24, color: '#fff' }}>
          <img src="/icons/dentist-app-192.png" alt="" width={56} height={56} style={{ borderRadius: 14, display: 'block', margin: '0 auto 10px' }} />
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20 }}>DentistIn</div>
          <div style={{ fontSize: 13, color: '#5EEAD4', marginTop: 2 }}>For patients</div>
        </div>

        <div style={card}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, color: '#0F172A', marginBottom: 6, textAlign: 'center' }}>
            Your dental records
          </h1>
          <p style={{ fontSize: 15, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
            Appointments, treatment plan, prescriptions and bills from your dentist
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
              <div role="tablist" style={{ display: 'flex', background: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 16 }}>
                {([['phone', 'Mobile number'], ['email', 'Email']] as const).map(([m, label]) => (
                  <button key={m} role="tab" aria-selected={mode === m} type="button"
                    onClick={() => { setMode(m); setError(null); setInfo(null) }}
                    style={{ flex: 1, padding: '10px 6px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, background: mode === m ? '#fff' : 'transparent', color: mode === m ? NAVY : '#64748B', boxShadow: mode === m ? '0 1px 3px rgba(15,23,42,0.12)' : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'phone' ? (
                <>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>Mobile number</label>
                  <input
                    type="tel" inputMode="numeric" autoFocus
                    value={phone} onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendOtp() }}
                    placeholder="10-digit mobile number" style={input}
                  />
                </>
              ) : (
                <>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>Email</label>
                  <input
                    type="email" inputMode="email" autoFocus autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendOtp() }}
                    placeholder="you@example.com" style={input}
                  />
                </>
              )}
              <button onClick={sendOtp} disabled={busy} style={button}>{busy ? 'Sending…' : mode === 'email' ? 'Email me a code' : 'Send OTP'}</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 4px', color: '#94A3B8', fontSize: 13 }}>
                <span style={{ flex: 1, height: 1, background: '#E2E8F0' }} />or<span style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
              </div>
              <button type="button" onClick={googleLogin} disabled={gBusy || busy}
                style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, color: NAVY, background: '#fff', border: '2px solid #CBD5E1', borderRadius: 12, cursor: gBusy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                {gBusy ? 'Opening Google…' : 'Continue with Google'}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>Enter the 6-digit code{mode === 'email' ? ' from your email' : ''}</label>
              <input
                type="tel" inputMode="numeric" autoFocus maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') verifyOtp() }}
                placeholder="······" style={input}
              />
              <button onClick={verifyOtp} disabled={busy} style={button}>{busy ? 'Verifying…' : 'Verify & Continue'}</button>
              <button onClick={() => { setStep('phone'); setOtp(''); setError(null); setInfo(null) }}
                style={{ width: '100%', padding: 12, marginTop: 10, background: 'none', border: 'none', color: TEAL_DARK, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                ← {mode === 'email' ? 'Change email' : 'Change number'}
              </button>
            </>
          )}

          {step === 'clinic' && (
            <>
              <label style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 12 }}>Pick a clinic (you can switch later)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {clinics.map(c => (
                  <button key={c.patient_id} onClick={() => finish(clinics, c.patient_id)}
                    style={{ textAlign: 'left', padding: '16px', borderRadius: 12, border: '2px solid #CBD5E1', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#0F172A' }}>{c.clinic_name || c.dentist_name || 'Clinic'}</div>
                    <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{[c.dentist_name ? `Dr. ${c.dentist_name.replace(/^dr\.?\s*/i, '')}` : '', c.city ? getCityBySlug(c.city).cityName : ''].filter(Boolean).join(' · ')}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#94A3B8', marginTop: 20, lineHeight: 1.6 }}>
          🔒 Your records are private. Use the mobile number or email you gave your clinic; we send a one-time code to it, or sign in with that Google account. You stay logged in on this phone until you log out or don&apos;t use the app for 7 days.
        </p>
      </div>
    </div>
  )
}
