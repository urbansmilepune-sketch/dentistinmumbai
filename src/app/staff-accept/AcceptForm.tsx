'use client'

// Client form rendered by /staff-accept once the server component has
// validated the token. Submits to /api/staff/accept which creates the
// auth.users row and activates the clinic_staff row, then signs the
// staff member into the same browser session.
//
// autoComplete="off" + autoComplete="new-password" mirrors the login
// page hardening: this domain may have the clinic owner's saved
// password, and we do not want it autofilled into a staff member's
// password field on a shared machine.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/staff/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Could not finish setting up your account. Try again.')
        setSubmitting(false)
        return
      }

      // Auto-sign-in so the staff member lands inside the dashboard
      // instead of having to re-type the password on /for-dentists/login.
      const supabase = createClient()
      const { error: signinErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signinErr) {
        // Account is set up, just couldn't sign in client-side — send
        // them to the login page with their email pre-filled.
        router.push(`/for-dentists/login?email=${encodeURIComponent(email)}`)
        return
      }
      router.push('/for-dentists/dashboard')
      router.refresh()
    } catch {
      setError('Network error — please retry.')
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid var(--border)', fontSize: 14,
    fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6,
  }

  return (
    <form onSubmit={onSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Choose a password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPass ? 'text' : 'password'}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            style={{ ...inputStyle, paddingRight: 42 }}
          />
          <button type="button" onClick={() => setShowPass(s => !s)}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>
            {showPass ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Confirm password</label>
        <input
          type={showPass ? 'text' : 'password'}
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Re-enter the same password"
          autoComplete="new-password"
          style={inputStyle}
        />
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>
      )}

      <button type="submit" disabled={submitting}
        style={{ marginTop: 4, padding: '13px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Setting up your account…' : 'Accept invite & sign in'}
      </button>

      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5, textAlign: 'center' }}>
        By accepting you agree to access only the patient data your role is permitted to. Suspicious activity is logged.
      </p>
    </form>
  )
}
