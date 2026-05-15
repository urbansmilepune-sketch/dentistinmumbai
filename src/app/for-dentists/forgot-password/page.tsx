'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCityByDomain, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cityConfig, setCityConfig] = useState<CityConfig>(CITY_CONFIGS[DEFAULT_CITY])
  useEffect(() => { setCityConfig(getCityByDomain(window.location.hostname)) }, [])
  const brandTld = '.' + cityConfig.domain.split('.').slice(1).join('.')

  async function handleSubmit() {
    if (!email) { setError('Please enter your email address'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    // Send the password-reset back to the current city's domain so the user
    // lands on the same brand they came from.
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/for-dentists/reset-password`,
    })
    setLoading(false)
    if (authError) { setError('Could not send reset email. Please try again.'); return }
    setSent(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 32 }}>
        <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>DentistIn{cityConfig.cityName.replace(/\s+/g, '')}<span style={{ color: 'var(--blue)' }}>{brandTld}</span></span>
      </Link>

      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '40px', width: '100%', maxWidth: 420 }}>
        {!sent ? (
          <>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>Reset Password</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 28 }}>Enter your registered email and we'll send you a reset link.</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email Address</label>
              <input
                type="email" value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="your@email.com"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`, fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }}
              />
              {error && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{error}</p>}
            </div>

            <button
              onClick={handleSubmit} disabled={loading}
              style={{ width: '100%', padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginBottom: 16 }}
            >{loading ? 'Sending...' : 'Send Reset Link'}</button>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              Remember your password? <Link href="/for-dentists/login" style={{ color: 'var(--blue)', fontWeight: 600 }}>Login</Link>
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Check your email</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              We've sent a password reset link to <strong>{email}</strong>. Check your inbox and click the link to reset your password.
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Didn't receive it? Check spam or</p>
            <button onClick={() => setSent(false)} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>try again</button>
          </div>
        )}
      </div>
    </div>
  )
}
