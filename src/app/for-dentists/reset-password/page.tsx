'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getCityByDomain, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [cityConfig, setCityConfig] = useState<CityConfig>(CITY_CONFIGS[DEFAULT_CITY])

  useEffect(() => {
    setCityConfig(getCityByDomain(window.location.hostname))
    const supabase = createClient()
    // Two-source readiness check:
    //   1. onAuthStateChange fires PASSWORD_RECOVERY exactly once when the
    //      reset-link redirect lands and the recovery session is exchanged
    //      from the URL fragment. We MUST wait for it before showing the
    //      form, otherwise a signed-in dentist visiting /reset-password
    //      directly could update the password of whatever session they
    //      happen to hold (theirs OR a leftover staff token).
    //   2. If the user is bouncing back into this page after navigating
    //      away, onAuthStateChange may not re-fire — fall back to checking
    //      whether the current session originated from a recovery flow.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      // amr (auth methods reference) includes 'recovery' when the session
      // came from a password-reset link. Treat that as the same green
      // light as the PASSWORD_RECOVERY event.
      const amr = (session?.user as any)?.amr
      if (Array.isArray(amr) && amr.some((m: any) => m?.method === 'recovery')) {
        setReady(true)
      }
    })
    return () => { subscription?.unsubscribe() }
  }, [])
  const brandTld = '.' + cityConfig.domain.split('.').slice(1).join('.')

  async function handleReset() {
    if (!password) { setError('Please enter a new password'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) { setError('Failed to reset password. Please try again.'); return }
    setDone(true)
    setTimeout(() => router.push('/for-dentists/dashboard'), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 32 }}>
        <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>DentistIn{cityConfig.cityName.replace(/\s+/g, '')}<span style={{ color: 'var(--blue)' }}>{brandTld}</span></span>
      </Link>

      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '40px', width: '100%', maxWidth: 420 }}>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Password Updated!</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Redirecting you to dashboard...</p>
          </div>
        ) : !ready ? (
          // Guard: never render the password input until we've confirmed a
          // PASSWORD_RECOVERY session is live. Without this, a normally
          // signed-in dentist hitting this URL would get a form that
          // rewrites their own password through supabase.auth.updateUser.
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 10 }}>Verifying reset link…</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              If this hangs for more than a few seconds, the link may have expired.{' '}
              <Link href="/for-dentists/forgot-password" style={{ color: 'var(--blue)', fontWeight: 600 }}>Request a new one</Link>.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>Set New Password</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 28 }}>Choose a strong password for your account.</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>New Password</label>
              <input
                type="password" value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Minimum 8 characters"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Confirm Password</label>
              <input
                type="password" value={confirm}
                onChange={e => { setConfirm(e.target.value); setError('') }}
                placeholder="Re-enter your password"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`, fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }}
              />
              {error && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{error}</p>}
            </div>

            <button
              onClick={handleReset} disabled={loading}
              style={{ width: '100%', padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >{loading ? 'Updating...' : 'Update Password'}</button>
          </>
        )}
      </div>
    </div>
  )
}
