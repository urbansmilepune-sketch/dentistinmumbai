'use client'

// Dentist login box on the dentistinindia.in home page (signed out).
// Same sign-in routes as /for-dentists/login: a one-time email code (default),
// password, or Google. After signing in the page reloads as the dentist home.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const BLUE = '#1D4ED8'
const input: React.CSSProperties = {
  width: '100%', minHeight: 50, padding: '0 14px', borderRadius: 12, border: '1px solid #CBD5E1',
  fontSize: 16, fontFamily: 'var(--font-body)', background: '#fff', color: '#0F1923', boxSizing: 'border-box',
}
const btn: React.CSSProperties = {
  width: '100%', minHeight: 48, borderRadius: 12, border: 'none', background: BLUE, color: '#fff',
  fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'var(--font-body)',
}
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: BLUE, fontWeight: 700, fontSize: 13,
  cursor: 'pointer', fontFamily: 'var(--font-body)',
}

export default function LoginBox() {
  const [mode, setMode] = useState<'otp' | 'password'>('otp')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const boxes = useRef<Array<HTMLInputElement | null>>([])
  const code = digits.join('')

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // Sign in the moment all six digits are in.
  useEffect(() => {
    if (step === 'code' && code.length === 6 && !busy) verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim()) { setError('Enter your email address first.'); return }
    setError(''); setBusy(true)
    try {
      const { ok, data } = await post('/api/auth/email-otp/send', { email: email.trim() })
      if (!ok) { setError(data?.error || 'Could not send the code. Please try again.'); return }
      setStep('code'); setDigits(['', '', '', '', '', '']); setResendIn(30)
      setTimeout(() => boxes.current[0]?.focus(), 50)
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  async function verify() {
    if (code.length !== 6) { setError('Enter the full 6-digit code.'); return }
    setError(''); setBusy(true)
    try {
      const { ok, data } = await post('/api/auth/email-otp/verify', { email: email.trim(), otp: code })
      if (!ok || !data?.success) {
        setError(data?.error || 'That code did not work. Please try again.')
        setDigits(['', '', '', '', '', '']); setBusy(false)
        setTimeout(() => boxes.current[0]?.focus(), 50)
        return
      }
      // Full page load so the server sees the new login cookie.
      window.location.href = '/'
    } catch { setError('Network error. Please try again.'); setBusy(false) }
  }

  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const { ok, data } = await post('/api/auth/password-login', { email: email.trim(), password })
      if (!ok || !data?.success) {
        setError(data?.error || 'Incorrect email or password. If you never set a password, use an email code instead.')
        setBusy(false); return
      }
      window.location.href = '/'
    } catch { setError('Network error. Please try again.'); setBusy(false) }
  }

  async function google() {
    setError(''); setBusy(true)
    document.cookie = `dentistin_next=${encodeURIComponent('/')}; path=/; max-age=600; samesite=lax; secure`
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { access_type: 'offline', prompt: 'consent' } },
    })
    if (authError) { setError('Google sign-in failed. Please try again.'); setBusy(false) }
  }

  function setDigit(i: number, raw: string) {
    const d = raw.replace(/\D/g, '')
    if (d.length > 1) {
      // Pasted or autofilled the whole code.
      const all = d.slice(0, 6 - i).split('')
      setDigits(prev => { const n = [...prev]; all.forEach((c, k) => { n[i + k] = c }); return n })
      boxes.current[Math.min(i + all.length, 5)]?.focus()
      return
    }
    setDigits(prev => { const n = [...prev]; n[i] = d; return n })
    if (d && i < 5) boxes.current[i + 1]?.focus()
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 10px 30px rgba(15,25,35,0.06)' }}>
      {error && (
        <div role="alert" style={{ padding: '10px 12px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B' }}>{error}</div>
      )}

      {mode === 'otp' && step === 'email' && (
        <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label htmlFor="nh-email" style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Email</label>
          <input id="nh-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourclinic.com" style={{ ...input, marginTop: -8 }} />
          <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending code…' : 'Send login code'}</button>
        </form>
      )}

      {mode === 'otp' && step === 'code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>We sent a 6-digit code to <strong>{email}</strong></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { boxes.current[i] = el }}
                value={d}
                onChange={e => setDigit(i, e.target.value)}
                onKeyDown={e => { if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus() }}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${i + 1}`}
                style={{ ...input, padding: 0, textAlign: 'center', fontSize: 20, fontWeight: 700, minHeight: 52 }}
              />
            ))}
          </div>
          <button type="button" onClick={verify} disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={linkBtn} onClick={() => { setStep('email'); setError('') }}>Use a different email</button>
            <button type="button" style={{ ...linkBtn, color: resendIn > 0 ? '#94A3B8' : BLUE }} disabled={resendIn > 0 || busy} onClick={() => sendCode()}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}

      {mode === 'password' && (
        <form onSubmit={passwordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label htmlFor="nh-email-pw" style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Email</label>
          <input id="nh-email-pw" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourclinic.com" style={{ ...input, marginTop: -6 }} />
          <label htmlFor="nh-pw" style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Password</label>
          <input id="nh-pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" style={{ ...input, marginTop: -6 }} />
          <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <Link href="/for-dentists/forgot-password" style={{ fontSize: 13, color: BLUE, fontWeight: 600, textAlign: 'center' }}>Forgot password?</Link>
        </form>
      )}

      {step === 'email' && (
        <div style={{ textAlign: 'center' }}>
          <button type="button" style={linkBtn} onClick={() => { setMode(mode === 'otp' ? 'password' : 'otp'); setError('') }}>
            {mode === 'otp' ? 'Sign in with password instead' : 'Get a login code instead'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748B', fontSize: 12.5 }}>
        <span style={{ flex: 1, height: 1, background: '#E2E8F0' }} />or<span style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      </div>
      <button type="button" onClick={google} disabled={busy} style={{ ...btn, background: '#fff', color: '#0F1923', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
        Continue with Google
      </button>
    </div>
  )
}
