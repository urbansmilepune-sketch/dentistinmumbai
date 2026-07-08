'use client'

// First-run onboarding wizard. Mobile-first, full-screen, 7 steps, NO sidebar
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
const TOTAL = 7

// Qualification options for the credentials step.
const QUALIFICATIONS = ['BDS', 'MDS', 'BDS + MDS', 'BDS + Fellowship', 'BDS + PG Diploma', 'Other']

// The treatments offered in the wizard's quick-pick grid. `slug` maps each
// tile to a row in the global `treatments` lookup (verified live via
// PostgREST); `label` is the wizard-facing display name (a few differ from the
// catalogue name, e.g. "Scaling & Cleaning" → teeth-cleaning). Insert order is
// left→right, top→bottom in the 2-column grid.
const WIZARD_TREATMENTS: { slug: string; label: string }[] = [
  { slug: 'root-canal', label: 'Root Canal' },
  { slug: 'dental-implants', label: 'Dental Implants' },
  { slug: 'braces-aligners', label: 'Braces & Aligners' },
  { slug: 'teeth-whitening', label: 'Teeth Whitening' },
  { slug: 'tooth-extraction', label: 'Tooth Extraction' },
  { slug: 'dental-crowns', label: 'Dental Crown' },
  { slug: 'teeth-cleaning', label: 'Scaling & Cleaning' },
  { slug: 'veneers', label: 'Veneers' },
  { slug: 'smile-makeover', label: 'Smile Makeover' },
  { slug: 'kids-dentistry', label: 'Pediatric Dentistry' },
]

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
  const [area, setArea] = useState('')
  const [form, setForm] = useState({
    name: '',
    clinic_name: '',
    city: 'mumbai' as CitySlug,
    consultation_fee: '',
    mapsName: '',
    profile_photo: '' as string | null,
    maps_embed: '',
    qualification: '',
    experience_years: '',
    gender: '',
  })

  // Treatments step: the global lookup (slug → id), the set of treatment_ids
  // the dentist already has (so we don't re-insert on a return visit), and the
  // currently-ticked slugs. Pre-selected from existing links in load().
  const [treatmentIdBySlug, setTreatmentIdBySlug] = useState<Record<string, string>>({})
  const [existingTreatmentIds, setExistingTreatmentIds] = useState<Set<string>>(new Set())
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      // Deliberately NOT selecting onboarding_completed here — that column is
      // added out-of-band and may not exist yet; selecting it would 400.
      const { data: d } = await supabase
        .from('dentists')
        .select('id, slug, name, clinic_name, city, consultation_fee, profile_photo, maps_embed, sub_area, qualifications, experience_years, gender')
        .eq('email', user.email)
        .single()
      if (cancelled) return
      if (!d) { router.push('/for-dentists/register'); return }
      setDentistId(d.id)

      // Treatments step data: the global lookup (to resolve slug → id on save)
      // and this dentist's existing links (to pre-tick + avoid re-inserting).
      const [{ data: txCatalogue }, { data: myLinks }] = await Promise.all([
        supabase.from('treatments').select('id, slug'),
        supabase.from('dentist_treatments').select('treatment_id').eq('dentist_id', d.id),
      ])
      if (cancelled) return
      const idBySlug: Record<string, string> = {}
      for (const t of txCatalogue ?? []) idBySlug[(t as any).slug] = (t as any).id
      const have = new Set((myLinks ?? []).map(r => (r as any).treatment_id as string))
      setTreatmentIdBySlug(idBySlug)
      setExistingTreatmentIds(have)
      // Pre-select any wizard treatments the dentist already offers.
      setSelectedSlugs(new Set(
        WIZARD_TREATMENTS.filter(w => idBySlug[w.slug] && have.has(idBySlug[w.slug])).map(w => w.slug),
      ))
      setSlug(d.slug || '')
      setSiteBase(`https://${getCityBySlug(d.city).domain}`)
      // Area label for the "patients searching in <area>" copy. sub_area is
      // free-text on the dentist row; fall back to the city name when it's
      // blank (common) so the sentence always reads naturally.
      setArea((d as any).sub_area || getCityBySlug(d.city).cityName)
      setForm(f => ({
        ...f,
        name: d.name || '',
        clinic_name: d.clinic_name || '',
        city: (d.city || 'mumbai') as CitySlug,
        consultation_fee: d.consultation_fee ? String(d.consultation_fee) : '',
        profile_photo: d.profile_photo || '',
        maps_embed: (d as any).maps_embed || '',
        qualification: (d as any).qualifications || '',
        experience_years: (d as any).experience_years ? String((d as any).experience_years) : '',
        gender: (d as any).gender || '',
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
    // Guard Vercel's ~4.5MB request-body limit: a larger file is rejected with a
    // plain-text 413 before our route runs, so res.json() below would throw an
    // opaque parse error. Block it up front with an actionable tip — most
    // dentists' phone photos are 4-8MB, and WhatsApp compresses to ~200KB.
    if (file.size > 4 * 1024 * 1024) {
      setErr('Photo too large. Please use a photo under 4MB. Tip: use WhatsApp to send the photo to yourself first — it compresses it automatically.')
      return
    }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', 'profile')
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: fd })
      // Read as text first: an over-limit upload returns plain text, so
      // res.json() would throw "Unexpected token 'R'..." instead of surfacing it.
      const text = await res.text()
      let data: { success?: boolean; url?: string; error?: string }
      try { data = JSON.parse(text) }
      catch { throw new Error('Upload failed — photo may be too large') }
      if (!data.success) throw new Error(data.error || 'Upload failed.')
      // The upload route writes dentists.profile_photo server-side.
      setForm(f => ({ ...f, profile_photo: data.url || '' }))
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
        setForm(f => ({ ...f, maps_embed: data.maps_embed || '' }))
      }
      setStep(7)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your location.')
    }
    setBusy(false)
  }

  // Step 2 — Credentials. Only patch fields the dentist actually filled, so a
  // partial answer (or Skip) never nulls out an existing value. Reuses the
  // same RLS-scoped save()/next() path as the other steps.
  function saveCredentials() {
    const patch: Record<string, unknown> = {}
    if (form.qualification) patch.qualifications = form.qualification
    if (form.experience_years !== '') patch.experience_years = Number(form.experience_years)
    if (form.gender) patch.gender = form.gender
    next(patch) // next() no-ops the save when patch is empty, then advances 2→3
  }

  // Step 5 — Treatments. Insert only the ticked treatments the dentist doesn't
  // already have, mirroring src/lib/seedTreatments.ts (link by treatment_id,
  // fee_from/fee_to null). Idempotent, so returning to the wizard is safe.
  async function saveTreatments() {
    setBusy(true); setErr('')
    try {
      const toInsert = [...selectedSlugs]
        .map(slug => treatmentIdBySlug[slug])
        .filter((id): id is string => !!id && !existingTreatmentIds.has(id))
        .map(treatment_id => ({ dentist_id: dentistId, treatment_id, fee_from: null, fee_to: null }))
      if (toInsert.length) {
        const { data, error } = await supabase
          .from('dentist_treatments').insert(toInsert).select('treatment_id')
        if (error) throw new Error(error.message)
        setExistingTreatmentIds(prev => {
          const n = new Set(prev)
          for (const r of data ?? []) n.add((r as any).treatment_id as string)
          return n
        })
      }
      setStep(6)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your treatments.')
    }
    setBusy(false)
  }

  function toggleSlug(slug: string) {
    setSelectedSlugs(prev => {
      const n = new Set(prev)
      if (n.has(slug)) n.delete(slug); else n.add(slug)
      return n
    })
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

  // Step-5 completion mirrors the wizard's three key fields (photo, fee, map).
  const doneChecks = [
    !!form.profile_photo,
    !!form.consultation_fee && Number(form.consultation_fee) > 0,
    !!form.maps_embed,
  ]
  const donePct = Math.round((doneChecks.filter(Boolean).length / doneChecks.length) * 100)
  const missingLabel = !form.profile_photo
    ? 'a profile photo'
    : (!form.consultation_fee || Number(form.consultation_fee) <= 0)
    ? 'your consultation fee'
    : !form.maps_embed
    ? 'your clinic location'
    : ''
  const areaLabel = area || getCityBySlug(form.city).cityName

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

            {/* STEP 2 — Credentials */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <h1 style={{ ...h1, marginBottom: 8 }}>Your Credentials</h1>
                  <p style={sub}>Patients choose dentists based on qualifications and experience</p>
                </div>
                <div>
                  <label style={fieldLabel}>Qualification</label>
                  <select style={{ ...input, marginTop: 6, cursor: 'pointer' }} value={form.qualification}
                    onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))}>
                    <option value="">Select qualification…</option>
                    {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Years of experience</label>
                  <input style={{ ...input, marginTop: 6 }} inputMode="numeric" min={0} max={60} placeholder="e.g. 8"
                    value={form.experience_years}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '')
                      setForm(f => ({ ...f, experience_years: v === '' ? '' : String(Math.min(60, Number(v))) }))
                    }} />
                </div>
                <div>
                  <label style={fieldLabel}>Gender</label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    {['Male', 'Female', 'Other'].map(g => {
                      const active = form.gender === g
                      return (
                        <button key={g} type="button" onClick={() => setForm(f => ({ ...f, gender: g }))}
                          style={{
                            flex: 1, minHeight: 52, borderRadius: 12, fontSize: 15, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'var(--font-body)',
                            background: active ? TEAL : '#fff',
                            color: active ? '#fff' : NAVY,
                            border: `1.5px solid ${active ? TEAL : NAVY}`,
                          }}>
                          {g}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <button style={{ ...btn, marginTop: 8 }} disabled={busy} onClick={saveCredentials}>
                  {busy ? 'Saving…' : 'Continue →'}
                </button>
                <button style={skipLink} onClick={() => setStep(3)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 3 — Photo */}
            {step === 3 && (
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
                  <button style={{ ...btn, marginTop: 8 }} disabled={busy} onClick={() => setStep(4)}>Looks good, Continue →</button>
                )}
                <button style={skipLink} onClick={() => setStep(4)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 4 — Fee */}
            {step === 4 && (
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
                <button style={skipLink} onClick={() => setStep(5)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 5 — Treatments */}
            {step === 5 && (
              <div>
                <h1 style={{ ...h1, marginBottom: 8 }}>Treatments you offer</h1>
                <p style={{ ...sub, marginBottom: 24 }}>Patients search by treatment — select all that apply</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                  {WIZARD_TREATMENTS.map(t => {
                    const selected = selectedSlugs.has(t.slug)
                    return (
                      <button key={t.slug} type="button" onClick={() => toggleSlug(t.slug)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                          minHeight: 52, padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                          color: NAVY,
                          background: selected ? '#F0FDFA' : '#fff',
                          border: `1.5px solid ${selected ? TEAL : '#CBD5E1'}`,
                        }}>
                        <span style={{
                          flexShrink: 0, width: 20, height: 20, borderRadius: 6,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: selected ? TEAL : 'transparent',
                          border: `1.5px solid ${selected ? TEAL : '#CBD5E1'}`,
                          color: '#fff', fontSize: 13, fontWeight: 800,
                        }}>{selected ? '✓' : ''}</span>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                <button style={btn} disabled={busy} onClick={saveTreatments}>{busy ? 'Saving…' : 'Continue →'}</button>
                <button style={skipLink} onClick={() => setStep(6)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 6 — Location */}
            {step === 6 && (
              <div>
                <h1 style={{ ...h1, marginBottom: 8 }}>Help patients find you</h1>
                <p style={{ ...sub, marginBottom: 24 }}>Your clinic name on Google Maps</p>
                <input style={{ ...input, marginBottom: 28 }} placeholder="e.g. Sambhav Dental Clinic, Wakad"
                  value={form.mapsName} onChange={e => setForm(f => ({ ...f, mapsName: e.target.value }))} />
                <button style={btn} disabled={busy} onClick={saveMaps}>{busy ? 'Saving…' : 'Continue →'}</button>
                <button style={skipLink} onClick={() => setStep(7)}>Skip for now →</button>
              </div>
            )}

            {/* STEP 7 — Done: value-revelation moment */}
            {step === 7 && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <h1 style={{ ...h1, marginBottom: 8 }}>You&apos;re live on DentistIn! 🎉</h1>
                  <p style={sub}>Here&apos;s what you get — completely free, for life:</p>
                </div>

                {/* Value cards — teal left border on navy */}
                {[
                  { icon: '🦷', title: 'Complete Practice Management', body: 'Appointments, patient records, prescriptions, treatment plans, billing and invoicing — everything to run your clinic digitally.' },
                  { icon: '👥', title: 'Patient Referrals', body: `Patients searching for dentists in ${areaLabel} will find your profile. Complete profiles get 3x more bookings. Yours is now complete.` },
                  { icon: '🆓', title: 'Free Forever', body: 'No subscription. No commission on bookings. No credit card ever. Founding member pricing — locked in for life.' },
                ].map(card => (
                  <div key={card.title} style={{ background: NAVY, borderLeft: `4px solid ${TEAL}`, borderRadius: 12, padding: '16px 18px', marginBottom: 12, color: '#fff' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{card.icon} {card.title}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)' }}>{card.body}</div>
                  </div>
                ))}

                {/* Actual profile completion (photo / fee / map) */}
                <div style={{ marginTop: 20, marginBottom: 24 }}>
                  <div style={{ height: 8, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${donePct}%`, background: TEAL, borderRadius: 99, transition: 'width 0.4s' }} />
                  </div>
                  {donePct === 100 ? (
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F766E' }}>✅ Profile 100% complete — you&apos;re getting maximum visibility</div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#64748B' }}>
                      Your profile is {donePct}% complete.{' '}
                      <a href="/for-dentists/dashboard/profile" style={{ color: TEAL, fontWeight: 600, textDecoration: 'none' }}>
                        Add {missingLabel} to get more bookings →
                      </a>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {slug && (
                  <a href={`${siteBase}/professional/${slug}`} target="_blank" rel="noopener noreferrer" style={btnNavy}>
                    View my live profile →
                  </a>
                )}
                <button style={btn} onClick={finish}>Go to dashboard →</button>
              </div>
            )}

            {/* Global "skip setup" — steps 1–6 only; sets the flag so the gate
                won't route them back here. */}
            {step < 7 && (
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
