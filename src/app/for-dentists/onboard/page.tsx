'use client'

// First-run onboarding wizard. Mobile-first, full-screen, 5 steps, NO sidebar
// or dashboard chrome (this route lives OUTSIDE dashboard/layout.tsx, so it
// renders standalone). The dashboard layout redirects owners with a bare
// profile here until they finish or skip — both set dentists.onboarding_completed.
//
// Each step persists to the dentists row BEFORE advancing, via the RLS-scoped
// client (email = jwt email), the same write path the profile/hours editors
// use. Photo reuses /api/cloudinary/upload (writes profile_photo server-side);
// the map step reuses /api/dentist/maps-embed (clinic name → embed).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCityBySlug, CITY_CONFIGS, type CitySlug } from '@/config/cities'

const NAVY = '#0F172A'
const TEAL = '#14B8A6'
const TOTAL = 5

export default function OnboardWizard() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [dentistId, setDentistId] = useState('')
  const [slug, setSlug] = useState('')
  const [siteBase, setSiteBase] = useState('https://dentistinmumbai.in')
  const [form, setForm] = useState({
    name: '',
    clinic_name: '',
    city: 'mumbai' as CitySlug,
    consultation_fee: '',
    mapsName: '',
    profile_photo: '' as string | null,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      // Deliberately NOT selecting onboarding_completed here — that column is
      // added out-of-band and may not exist yet; selecting it would 400.
      const { data: d } = await supabase
        .from('dentists')
        .select('id, slug, name, clinic_name, city, consultation_fee, profile_photo')
        .eq('email', user.email)
        .single()
      if (cancelled) return
      if (!d) { router.push('/for-dentists/register'); return }
      setDentistId(d.id)
      setSlug(d.slug || '')
      setSiteBase(`https://${getCityBySlug(d.city).domain}`)
      setForm(f => ({
        ...f,
        name: d.name || '',
        clinic_name: d.clinic_name || '',
        city: (d.city || 'mumbai') as CitySlug,
        consultation_fee: d.consultation_fee ? String(d.consultation_fee) : '',
        profile_photo: d.profile_photo || '',
      }))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Persist a patch to the dentists row; throws on RLS denial / zero rows so
  // callers can surface it. Same observability trick as the hours editor.
  async function save(patch: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('dentists')
      .update(patch)
      .eq('id', dentistId)
      .select('id')
    if (error || !data || data.length === 0) {
      throw new Error(error?.message || 'Save failed — please try again.')
    }
  }

  // Advance after persisting an optional patch.
  async function next(patch: Record<string, unknown>) {
    setBusy(true); setErr('')
    try {
      if (Object.keys(patch).length) await save(patch)
      setStep(s => s + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
    }
    setBusy(false)
  }

  // Step 5 "Go to dashboard" + every "Skip setup" link. Hits the dedicated
  // API route (service role) to persist onboarding_completed = true so the
  // dashboard gate stops routing them here. Best-effort: if the flag write
  // fails (e.g. column not live yet) we still navigate — the gate defensively
  // treats an unreadable flag as "done", so there's no redirect loop.
  async function finish() {
    try { await fetch('/api/onboard/complete', { method: 'POST' }) } catch { /* best-effort */ }
    router.refresh()
    router.push('/for-dentists/dashboard')
  }

  async function uploadPhoto(file: File) {
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', 'profile')
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Upload failed.')
      // The upload route writes dentists.profile_photo server-side.
      setForm(f => ({ ...f, profile_photo: data.url }))
      setStep(s => s + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    }
    setBusy(false)
  }

  async function saveMaps() {
    setBusy(true); setErr('')
    try {
      if (form.mapsName.trim()) {
        const res = await fetch('/api/dentist/maps-embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: '', name: form.mapsName, clinic_name: form.clinic_name }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Could not process the map.')
        await save({ maps_embed: data.maps_embed || '' })
      }
      setStep(5)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your location.')
    }
    setBusy(false)
  }

  // ---- styles (inline only, navy/teal brand) ----
  const btn: React.CSSProperties = {
    minHeight: 56, width: '100%', border: 'none', borderRadius: 14,
    background: TEAL, color: '#fff', fontWeight: 700, fontSize: 16,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
    fontFamily: 'var(--font-body)',
  }
  const btnNavy: React.CSSProperties = {
    ...btn, background: NAVY, display: 'flex', alignItems: 'center',
    justifyContent: 'center', textDecoration: 'none', marginBottom: 12,
  }
  const skipLink: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'center', marginTop: 16,
    color: '#64748B', background: 'none', border: 'none', fontSize: 14,
    cursor: 'pointer', fontFamily: 'var(--font-body)',
  }
  const input: React.CSSProperties = {
    width: '100%', minHeight: 52, padding: '0 16px', borderRadius: 12,
    border: '1.5px solid #CBD5E1', fontSize: 16, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'var(--font-body)', background: '#fff',
  }
  const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: NAVY }
  const h1: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: NAVY, lineHeight: 1.2 }
  const sub: React.CSSProperties = { color: '#64748B', fontSize: 15, lineHeight: 1.5 }

  return (
    <div style={{ minHeight: '100svh', background: '#fff', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '20px 20px 40px', display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, background: NAVY, borderRadius: 8, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>D</div>
          <span style={{ fontWeight: 700, color: NAVY, fontFamily: 'var(--font-heading)' }}>DentistIn</span>
        </div>

        {/* Progress */}
        <div style={{ fontSize: 12, fontWeight: 600, color: TEAL, marginBottom: 6 }}>Step {step} of {TOTAL}</div>
        <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(step / TOTAL) * 100}%`, background: TEAL, borderRadius: 99, transition: 'width 0.3s' }} />
        </div>

        {loading ? (
          <p style={{ color: '#64748B' }}>Loading…</p>
        ) : (
          <>
            {err && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>⚠️ {err}</div>
            )}

            {/* STEP 1 — Confirm basics */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h1 style={h1}>Confirm your basics</h1>
                <div>
                  <label style={fieldLabel}>Your name</label>
                  <input style={{ ...input, marginTop: 6 }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={fieldLabel}>Clinic name</label>
                  <input style={{ ...input, marginTop: 6 }} value={form.clinic_name} onChange={e => setForm(f => ({ ...f, clinic_name: e.target.value }))} />
                </div>
                <div>
                  <label style={fieldLabel}>City</label>
                  <select style={{ ...input, marginTop: 6, cursor: 'pointer' }} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value as CitySlug }))}>
                    {Object.values(CITY_CONFIGS).map(c => <option key={c.citySlug} value={c.citySlug}>{c.cityName}</option>)}
                  </select>
                </div>
                <button style={{ ...btn, marginTop: 12 }} disabled={busy}
                  onClick={() => next({ name: form.name.trim(), clinic_name: form.clinic_name.trim(), city: form.city })}>
                  {busy ? 'Saving…' : 'Confirm & Continue →'}
                </button>
              </div>
            )}

            {/* STEP 2 — Photo */}
            {step === 2 && (
              <div>
                <h1 style={{ ...h1, marginBottom: 8 }}>Add your photo</h1>
                <p style={{ ...sub, marginBottom: 24 }}>Dentists with photos get 3x more bookings</p>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: 220, border: `2px dashed ${TEAL}`, borderRadius: 16, cursor: 'pointer', marginBottom: 8,
                  background: form.profile_photo ? `center/cover no-repeat url(${form.profile_photo})` : '#F0FDFA',
                }}>
                  {!form.profile_photo && <span style={{ color: TEAL, fontWeight: 600 }}>{busy ? 'Uploading…' : '📷 Tap to upload'}</span>}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const file = e.target.files?.[0]; if (file) uploadPhoto(file) }} />
                </label>
                {form.profile_photo && (
                  <button style={{ ...btn, marginTop: 8 }} disabled={busy} onClick={() => setStep(3)}>Looks good, Continue →</button>
                )}
                <button style={skipLink} onClick={() => setStep(3)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 3 — Fee */}
            {step === 3 && (
              <div>
                <h1 style={{ ...h1, marginBottom: 8 }}>What&apos;s your consultation fee?</h1>
                <p style={{ ...sub, marginBottom: 24 }}>You can change this anytime</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: NAVY }}>₹</span>
                  <input style={input} inputMode="numeric" placeholder="500" value={form.consultation_fee}
                    onChange={e => setForm(f => ({ ...f, consultation_fee: e.target.value.replace(/\D/g, '') }))} />
                </div>
                <button style={btn} disabled={busy}
                  onClick={() => next(form.consultation_fee ? { consultation_fee: Number(form.consultation_fee) } : {})}>
                  {busy ? 'Saving…' : 'Continue →'}
                </button>
                <button style={skipLink} onClick={() => setStep(4)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 4 — Location */}
            {step === 4 && (
              <div>
                <h1 style={{ ...h1, marginBottom: 8 }}>Help patients find you</h1>
                <p style={{ ...sub, marginBottom: 24 }}>Your clinic name on Google Maps</p>
                <input style={{ ...input, marginBottom: 28 }} placeholder="e.g. Sambhav Dental Clinic, Wakad"
                  value={form.mapsName} onChange={e => setForm(f => ({ ...f, mapsName: e.target.value }))} />
                <button style={btn} disabled={busy} onClick={saveMaps}>{busy ? 'Saving…' : 'Continue →'}</button>
                <button style={skipLink} onClick={() => setStep(5)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 5 — Done */}
            {step === 5 && (
              <div>
                <div style={{ textAlign: 'center', marginTop: 12, marginBottom: 28 }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
                  <h1 style={{ ...h1, marginBottom: 12 }}>Your profile is live on DentistIn!</h1>
                  {slug && (
                    <a href={`${siteBase}/professional/${slug}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-block', color: TEAL, fontWeight: 600, wordBreak: 'break-all', fontSize: 14 }}>
                      {`${siteBase}/professional/${slug}`}
                    </a>
                  )}
                </div>
                {slug && (
                  <a href={`${siteBase}/professional/${slug}`} target="_blank" rel="noopener noreferrer" style={btnNavy}>View my profile</a>
                )}
                <button style={btn} onClick={finish}>Go to dashboard →</button>
              </div>
            )}

            {/* Global "skip setup" — steps 1–4 only; sets the flag so the gate
                won't route them back here. */}
            {step < 5 && (
              <button style={{ ...skipLink, marginTop: 24, fontSize: 13 }} onClick={finish}>
                Skip setup, take me to the dashboard
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
