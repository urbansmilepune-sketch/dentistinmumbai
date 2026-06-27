'use client'

// Client form for /join. POSTs to /api/india/register. On success we
// route the dentist to /for-dentists/login with their email pre-filled
// so they can sign in immediately and start posting cases.
//
// The city dropdown lists the 13 live city slugs in alphabetical order
// + a sentinel "other" value so dentists in unlaunched cities can
// still create a national-only profile. The server handles the
// "no city site to host them" case gracefully.

import { useState } from 'react'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

const SPECIALIZATIONS = [
  'General Dentist',
  'Orthodontist',
  'Implantologist',
  'Endodontist',
  'Periodontist',
  'Oral Surgeon',
  'Pedodontist',
  'Prosthodontist',
  'Cosmetic Dentist',
] as const

const CITY_OPTIONS = (Object.entries(CITY_CONFIGS) as Array<[CitySlug, { cityName: string }]>)
  .map(([slug, cfg]) => ({ slug, label: cfg.cityName }))
  .sort((a, b) => a.label.localeCompare(b.label))

export default function JoinForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    specialization: '',
    city: '',
    clinic_name: '',
    experience_years: '',
    mci_registration: '',
    linkedin_url: '',
  })
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending'); setErr('')
    try {
      const res = await fetch('/api/india/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience_years: form.experience_years ? Number(form.experience_years) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        setState('error'); setErr(data?.error || 'Could not register right now')
        return
      }
      setSuccessMessage(data.message || 'Profile created.')
      setState('sent')
    } catch {
      setState('error'); setErr('Network error — please try again.')
    }
  }

  if (state === 'sent') {
    return (
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#166534', marginBottom: 10 }}>
          You're in.
        </h2>
        <p style={{ fontSize: 14, color: '#166534', lineHeight: 1.7, marginBottom: 20 }}>
          {successMessage}
        </p>
        <a href={`/for-dentists/login?next=/professional/me`}
          style={{ display: 'inline-block', padding: '11px 22px', minHeight: 44, background: '#166534', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          Sign in to your profile →
        </a>
      </div>
    )
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', minHeight: 44, fontSize: 14,
    borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', color: '#0F1923',
    fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 28, boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle} htmlFor="j-name">Full name</label>
          <input id="j-name" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="(Dr. is added automatically)" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="j-email">Email</label>
          <input id="j-email" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@clinic.com" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="j-phone">Phone</label>
          <input id="j-phone" required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxxxxxxx" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="j-pass">Password</label>
          <input id="j-pass" type="password" required minLength={8} value={form.password} onChange={e => set('password', e.target.value)} placeholder="8+ characters" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="j-spec">Specialization</label>
          <select id="j-spec" required value={form.specialization} onChange={e => set('specialization', e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="j-city">City</label>
          <select id="j-city" required value={form.city} onChange={e => set('city', e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            {CITY_OPTIONS.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            <option value="other">My city isn't listed yet</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle} htmlFor="j-clinic">Clinic name</label>
          <input id="j-clinic" required value={form.clinic_name} onChange={e => set('clinic_name', e.target.value)} placeholder="The clinic you practice at" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="j-exp">Years of experience</label>
          <input id="j-exp" type="number" min="0" max="80" required value={form.experience_years} onChange={e => set('experience_years', e.target.value.replace(/\D/g, ''))} placeholder="e.g. 8" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="j-mci">State Dental Council registration number</label>
          <input id="j-mci" required value={form.mci_registration} onChange={e => set('mci_registration', e.target.value)} placeholder="As issued by your State Dental Council" style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle} htmlFor="j-li">LinkedIn URL <span style={{ color: '#94A3B8', textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>(optional)</span></label>
          <input id="j-li" type="url" value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" style={inputStyle} />
        </div>
      </div>

      {state === 'error' && err && (
        <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 12 }}>{err}</div>
      )}

      <button type="submit" disabled={state === 'sending'}
        style={{ width: '100%', padding: '13px 16px', minHeight: 48, background: state === 'sending' ? '#93C5FD' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: state === 'sending' ? 'wait' : 'pointer' }}>
        {state === 'sending' ? 'Creating profile…' : 'Create my profile →'}
      </button>
      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
        Already a member? <a href="/for-dentists/login" style={{ color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>Sign in →</a>
      </p>
    </form>
  )
}
