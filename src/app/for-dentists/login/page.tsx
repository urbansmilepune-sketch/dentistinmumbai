'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCityByDomain, isNationalHost, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

export default function DentistLoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'email' | 'google'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [error, setError] = useState('')
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

          <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email address</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="doctor@example.com"
                autoComplete="email"
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>
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

            {/* Magic-link fallback for dentists who don't know their password. */}
            <div style={{ marginTop: -4 }}>
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={magicLoading}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--blue)', fontWeight: 600, cursor: magicLoading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: magicLoading ? 0.7 : 1 }}
              >
                {magicLoading ? 'Sending login link…' : 'Forgot password? Get a login link →'}
              </button>
              {magicSent && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 10, fontSize: 13, color: '#166534', fontWeight: 600 }}>
                  📧 Check your email for a login link
                </div>
              )}
            </div>
            <button
              type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >{loading ? 'Signing in...' : submitLabel}</button>
          </form>

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





