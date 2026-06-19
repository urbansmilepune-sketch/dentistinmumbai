'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCityByDomain, isNationalHost, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

type LoginMethod = 'otp' | 'password' | 'magic'

export default function DentistLoginPage() {
  const router = useRouter()
  // Default to Email OTP — the simplest path for dentists who never set a
  // password. Password and Magic Link stay available behind the tab strip.
  const [method, setMethod] = useState<LoginMethod>('otp')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [error, setError] = useState('')

  // ── Email-OTP flow state ──────────────────────────────────────────────
  // otpStep 'email' = collecting the address + "Send OTP"; 'code' = the
  // 6-box code entry. otpDigits is the per-box value; resendIn counts down
  // from 30s before the "Resend" link re-enables.
  const [otpStep, setOtpStep] = useState<'email' | 'code'>('email')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const otpBoxRefs = useRef<Array<HTMLInputElement | null>>([])
  const otpCode = otpDigits.join('')
  const [cityConfig, setCityConfig] = useState<CityConfig>(CITY_CONFIGS[DEFAULT_CITY])
  const [national, setNational] = useState(false)
  const [nextParam, setNextParam] = useState<string>('')
  useEffect(() => {
    const host = window.location.hostname
    setNational(isNationalHost(host))
    setCityConfig(getCityByDomain(host))
    // Read ?next= directly from the URL instead of useSearchParams() — the
    // latter requires a Suspense boundary at build time and adds zero
    // value here since this is a 'use client' component.
    setNextParam(new URLSearchParams(window.location.search).get('next') ?? '')
  }, [])

  // Resend cooldown: tick down to 0 once a code has been sent.
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])
  const brandLeft = national ? 'dentistinindia' : cityConfig.domain.split('.')[0]
  const brandTld = national ? '.in' : '.' + cityConfig.domain.split('.').slice(1).join('.')
  // The orange chunk between "DentistIn" and the TLD. National host shows
  // "India"; city hosts show the city name. Previously this used
  // cityConfig.cityName directly, which leaked Mumbai branding onto
  // dentistinindia.in because getCityByDomain falls back to Mumbai for
  // unknown hosts.
  const brandCityChunk = national ? 'India' : cityConfig.cityName.replace(/\s+/g, '')
  const brandLeftPretty = `DentistIn${brandCityChunk}`

  // Per-mode copy. The login page wears two hats: a city-clinic portal
  // (DentistInMumbai.in etc.) and the national professional network
  // (DentistInIndia.in). Frame the page accordingly.
  const heroHeadline   = national ? "India's Professional Network for Dentists" : 'Your practice dashboard awaits'
  const heroSub        = national ? 'Sign in to share cases and connect with peers' : 'Manage everything from one place'
  const heroBullets    = national
    ? ['Share clinical cases with peers', 'Connect with specialists nearby', 'Build your professional profile', 'Get listed on your city directory']
    : ['Manage appointments 24/7', 'Upload clinic photos', 'Track patient enquiries', 'Rank higher on Google']
  const rightSubLine   = national ? 'Sign in to the network' : 'Sign in to your practice portal'
  const submitLabel    = national ? 'Sign In' : 'Sign In to Dashboard'
  const joinHref       = national ? '/join' : '/for-dentists'
  const joinCta        = national ? 'Join the network →' : 'List your clinic free →'
  const magicLinkLine  = national ? 'Check your email for your magic sign-in link' : 'Check your email for your dashboard access link'

  const supabase = createClient()

  // Allow callers to specify a post-login target via ?next=. Same-origin
  // safety: we accept only paths that start with "/" so an attacker
  // can't pass an absolute URL and redirect the user off-platform.
  function nextPath(): string {
    if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) return nextParam
    // Default landing: national host → feed (the professional network
    // surface); city hosts → city dashboard.
    return national ? '/feed' : '/for-dentists/dashboard'
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Incorrect email or password. Please try again.')
      setLoading(false); return
    }
    // Same origin only — each domain (each city + national) is a separate
    // apex so the supabase auth cookie is host-scoped; cross-domain
    // redirects drop the session and loop. The dashboard reads the dentist
    // row by email, so data renders correctly here even if this domain
    // doesn't match the dentist's registered city.
    router.push(nextPath())
    router.refresh()
  }

// Passwordless fallback: dentists who never set (or forgot) a password can
// get a one-click login link emailed to them. signInWithOtp sends the link;
// clicking it lands on /auth/callback (same route as Google OAuth), which
// exchanges the code for a session and routes to the dashboard/feed. We keep
// emailRedirectTo on the current origin so the host-scoped auth cookie sticks.
  async function handleMagicLink() {
    if (!email) { setError('Enter your email address above first, then request a login link.'); return }
    setError(''); setMagicSent(false); setMagicLoading(true)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setMagicLoading(false)
    if (otpError) { setError('Could not send a login link. Please check the email and try again.'); return }
    setMagicSent(true)
  }

async function handleGoogle() {
  setError(''); setGLoading(true)
  const { error: authError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' }
    },
  })
  if (authError) { setError('Google sign-in failed.'); setGLoading(false) }
}

  // ── Email-OTP handlers ────────────────────────────────────────────────
  // Step 1: email a 6-digit code. On success move to the code step and start
  // the 30s resend cooldown. Used for both the first send and "Resend".
  async function handleSendOtp() {
    if (!email) { setError('Enter your email address first.'); return }
    setError(''); setOtpSending(true)
    try {
      const res = await fetch('/api/auth/email-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not send the code. Please try again.'); return }
      setOtpStep('code')
      setOtpDigits(['', '', '', '', '', ''])
      setResendIn(30)
      // Focus the first box once it renders.
      setTimeout(() => otpBoxRefs.current[0]?.focus(), 50)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setOtpSending(false)
    }
  }

  // Step 2: verify the code. The server returns a one-time magic link; we
  // navigate to it (full-page, since it's a Supabase URL) so /auth/callback
  // sets the session cookie and routes to the dashboard.
  async function handleVerifyOtp() {
    if (otpCode.length !== 6) { setError('Enter the full 6-digit code.'); return }
    setError(''); setOtpVerifying(true)
    try {
      const res = await fetch('/api/auth/email-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode }),
      })
      const data = await res.json()
      if (!res.ok || !data?.redirect_url) {
        setError(data?.error || 'Could not verify the code. Please try again.')
        setOtpDigits(['', '', '', '', '', ''])
        setTimeout(() => otpBoxRefs.current[0]?.focus(), 50)
        return
      }
      window.location.href = data.redirect_url
    } catch {
      setError('Network error. Please try again.')
      setOtpVerifying(false)
    }
  }

  function setOtpDigit(i: number, ch: string) {
    setOtpDigits(prev => {
      const next = [...prev]
      next[i] = ch
      return next
    })
  }

  function handleOtpBoxChange(i: number, raw: string) {
    const d = raw.replace(/\D/g, '')
    if (!d) { setOtpDigit(i, ''); return }
    // Take the last typed digit so retyping over a filled box works.
    setOtpDigit(i, d[d.length - 1])
    if (i < 5) otpBoxRefs.current[i + 1]?.focus()
  }

  function handleOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      otpBoxRefs.current[i - 1]?.focus()
    }
  }

  function handleOtpPaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6 - i)
    if (!pasted) return
    e.preventDefault()
    setOtpDigits(prev => {
      const next = [...prev]
      for (let k = 0; k < pasted.length; k++) next[i + k] = pasted[k]
      return next
    })
    const last = Math.min(i + pasted.length, 5)
    otpBoxRefs.current[last]?.focus()
  }

  // Auto-verify the moment all six boxes are filled — saves a click. The
  // verifying guard stops the effect from firing twice for one full code.
  useEffect(() => {
    if (method === 'otp' && otpStep === 'code' && otpCode.length === 6 && !otpVerifying) {
      handleVerifyOtp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode])

  function switchMethod(m: LoginMethod) {
    setMethod(m)
    setError('')
    setMagicSent(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Left brand panel */}
      <div style={{ display: 'none', width: '40%', flexDirection: 'column', justifyContent: 'space-between', padding: '40px', background: 'linear-gradient(145deg, #003F7A, #0057A8)' }} className="login-panel">
        <div>
          <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#fff', textDecoration: 'none' }}>
            DentistIn<span style={{ color: '#FF6135' }}>{brandCityChunk}</span>{brandTld}
          </Link>
        </div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, color: '#fff', lineHeight: 1.3, marginBottom: 12 }}>
            {heroHeadline}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, marginBottom: 32 }}>{heroSub}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {heroBullets.map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#00A878', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, flexShrink: 0 }}>✓</div>
                <span style={{ color: '#fff', fontSize: 14 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
          Not a member? <Link href={joinHref} style={{ color: '#fff', textDecoration: 'underline' }}>{joinCta}</Link>
        </p>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: '#fff' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Mobile logo */}
          <div style={{ marginBottom: 32, textAlign: 'center' }}>
            <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--blue)', textDecoration: 'none' }}>
              DentistIn<span style={{ color: '#FF6135' }}>{brandCityChunk}</span>{brandTld}
            </Link>
          </div>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Welcome back, Doctor</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>{rightSubLine}</p>

          {/* First-login nudge: dentists who just registered get a one-click
              magic link in their approval email rather than a password —
              this banner steers them toward their inbox so they don't waste
              time trying password combinations that don't exist. */}
          <div style={{ padding: '12px 14px', background: '#E8F3FF', border: '1px solid #BFDBFE', borderRadius: 10, fontSize: 13, color: 'var(--blue-dark)', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, lineHeight: 1.2 }}>📧</span>
            <span><strong>Just registered?</strong> {magicLinkLine} — no password needed for your first sign-in.</span>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', marginBottom: 20 }}>
              {error}
            </div>
          )}

          {/* Login-method tabs. Email OTP is first and default — the simplest
              path for dentists with no password. Password + Magic Link remain. */}
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 18 }}>
            {([
              { key: 'otp', label: 'Email OTP' },
              { key: 'password', label: 'Password' },
              { key: 'magic', label: 'Magic Link' },
            ] as Array<{ key: LoginMethod; label: string }>).map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => switchMethod(m.key)}
                style={{
                  flex: 1, padding: '9px 6px', borderRadius: 9, border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13,
                  background: method === m.key ? 'var(--blue)' : 'transparent',
                  color: method === m.key ? '#fff' : 'var(--muted)',
                  transition: 'background 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Shared email field. Locked during OTP code entry so the address
              the code was sent to can't drift out from under the verify call. */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="doctor@example.com"
              autoComplete="email"
              disabled={method === 'otp' && otpStep === 'code'}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const, background: (method === 'otp' && otpStep === 'code') ? 'var(--bg)' : '#fff' }}
            />
          </div>

          {/* ── Email OTP ─────────────────────────────────────────────── */}
          {method === 'otp' && otpStep === 'email' && (
            <button
              type="button" onClick={handleSendOtp} disabled={otpSending}
              style={{ width: '100%', padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: otpSending ? 'not-allowed' : 'pointer', opacity: otpSending ? 0.7 : 1 }}
            >{otpSending ? 'Sending code…' : 'Send OTP to Email'}</button>
          )}

          {method === 'otp' && otpStep === 'code' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Enter the 6-digit code sent to <strong style={{ color: 'var(--text)' }}>{email}</strong>
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginBottom: 16 }}>
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { otpBoxRefs.current[i] = el }}
                    value={d}
                    onChange={e => handleOtpBoxChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    onPaste={e => handleOtpPaste(i, e)}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    aria-label={`Digit ${i + 1}`}
                    style={{ width: '100%', aspectRatio: '1', textAlign: 'center', padding: '0', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const, minWidth: 0 }}
                  />
                ))}
              </div>
              <button
                type="button" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}
                style={{ width: '100%', padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: (otpVerifying || otpCode.length !== 6) ? 'not-allowed' : 'pointer', opacity: (otpVerifying || otpCode.length !== 6) ? 0.6 : 1 }}
              >{otpVerifying ? 'Verifying…' : 'Verify & Login'}</button>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => { setOtpStep('email'); setError(''); setOtpDigits(['', '', '', '', '', '']) }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}
                >← Use a different email</button>
                {resendIn > 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Resend in {resendIn}s</span>
                ) : (
                  <button
                    type="button" onClick={handleSendOtp} disabled={otpSending}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: otpSending ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}
                  >{otpSending ? 'Sending…' : 'Resend OTP'}</button>
                )}
              </div>
            </div>
          )}

          {/* ── Password ──────────────────────────────────────────────── */}
          {method === 'password' && (
            <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{ width: '100%', padding: '11px 42px 11px 14px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
                <div style={{ textAlign: 'right', marginTop: 6 }}>
                  <Link href="/for-dentists/forgot-password" style={{ fontSize: 12, color: 'var(--blue)' }}>Forgot password?</Link>
                </div>
              </div>
              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >{loading ? 'Signing in...' : submitLabel}</button>
            </form>
          )}

          {/* ── Magic Link ────────────────────────────────────────────── */}
          {method === 'magic' && (
            <div>
              <button
                type="button" onClick={handleMagicLink} disabled={magicLoading}
                style={{ width: '100%', padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: magicLoading ? 'not-allowed' : 'pointer', opacity: magicLoading ? 0.7 : 1 }}
              >{magicLoading ? 'Sending login link…' : 'Send me a magic link'}</button>
              {magicSent && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 10, fontSize: 13, color: '#166534', fontWeight: 600 }}>
                  📧 Check your email for a login link
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle} disabled={gLoading}
            style={{ width: '100%', padding: '12px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: gLoading ? 'not-allowed' : 'pointer', opacity: gLoading ? 0.7 : 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {gLoading ? 'Redirecting...' : 'Sign in with Google'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: 24 }}>
            New to {brandLeftPretty}?{' '}
            <Link href={joinHref} style={{ color: 'var(--blue)', fontWeight: 600 }}>{joinCta}</Link>
          </p>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .login-panel { display: flex !important; }
        }
      `}</style>
    </div>
  )
}





