'use client'

// First-run setup wizard. Mobile-first, full-screen, NO dashboard chrome (this
// route lives outside dashboard/layout.tsx).
//
// 5 steps, 20% each (src/lib/setupSteps.ts):
//   1 Photo · 2 Registration number · 3 Clinic on Google Maps · 4 Fee + treatments
//   → live at 80% → 5 About you + hours (100%).
// A navy preview strip on top shows what patients will see as each step fills.
//
// Each step saves to the dentists row BEFORE advancing, via the RLS-scoped
// client (email = jwt email). Photo uses /api/cloudinary/upload (writes
// profile_photo / cover_photo server-side); the map step uses
// /api/dentist/maps-embed (clinic name or pasted Google link → embed).
//
// There is no "skip setup". "Finish later" saves progress, marks the wizard as
// seen and sets a 12-hour cookie so the dashboard lets them in for the day.
// The dashboard gate brings them back here until steps 1–4 are done.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCityBySlug, type CitySlug } from '@/config/cities'
import {
  setupSteps, setupPct, isSetupLive, firstMissingLiveStep, draftBio,
  DEFAULT_SETUP_HOURS, SETUP_LATER_COOKIE, SETUP_LATER_SECONDS, BIO_MIN,
} from '@/lib/setupSteps'

const NAVY = '#0F172A'
const TEAL = '#14B8A6'
const TEAL_DARK = '#0D9488'
const TINT = '#CCFBF1'
const MUTED = '#64748B'
const LINE = '#E2E8F0'

// Screens: 0 intro, 1–5 steps, 6 "you're live", 7 "100% done".
const INTRO = 0
const LIVE = 6
const DONE = 7

const QUALIFICATIONS = ['BDS', 'MDS', 'BDS + MDS', 'BDS + Fellowship', 'BDS + PG Diploma', 'Other']
const FEE_CHIPS = [300, 500, 700]

// Quick-pick treatments, keyed by their `treatments` table UUID.
// dentist_treatments links by treatment_id, so the id is inserted directly.
const TREATMENTS: { id: string; name: string }[] = [
  { id: '3e5cba66-a58e-468d-8525-3a59677ce879', name: 'Root Canal' },
  { id: '83d2b3b3-9d9f-46a7-b741-fb77336ddbf8', name: 'Dental Implants' },
  { id: '2a098ef9-da42-419e-8228-57ffd1770098', name: 'Braces & Aligners' },
  { id: '0650a275-7c18-4ad7-95fc-35a3162c5007', name: 'Teeth Whitening' },
  { id: '8a339148-50ad-4ac8-983d-0827a1afa23f', name: 'Tooth Extraction' },
  { id: '02c840e3-bbcd-4878-8bda-ed3f2f1dc48f', name: 'Dental Crowns' },
  { id: 'e8bdce57-d23f-4eb2-b64d-75f7929b5bf3', name: 'Teeth Cleaning' },
  { id: '02c6ff54-7acd-4cd1-9438-93738bf69589', name: 'Veneers' },
  { id: '08030963-8975-487a-9002-27599a6c1467', name: 'Smile Makeover' },
  { id: 'be059965-88d5-4f62-b0dd-15709aa23f44', name: 'Kids Dentistry' },
]

function initials(name: string): string {
  const clean = name.replace(/^dr\.?\s*/i, '').trim()
  const p = clean.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'Dr'
}

function setLaterCookie() {
  try {
    document.cookie = `${SETUP_LATER_COOKIE}=1; max-age=${SETUP_LATER_SECONDS}; path=/; samesite=lax`
  } catch { /* cookie blocked: the gate will just ask again */ }
}

export default function OnboardWizard() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(INTRO)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const [dentistId, setDentistId] = useState('')
  const [slug, setSlug] = useState('')
  const [siteBase, setSiteBase] = useState('https://dentistinmumbai.in')
  const [area, setArea] = useState('')
  const [cityName, setCityName] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const [hadHours, setHadHours] = useState(false)
  const [form, setForm] = useState({
    name: '',
    clinic_name: '',
    city: 'mumbai' as CitySlug,
    whatsapp: '',
    profile_photo: '',
    cover_photo: '',
    mci_number: '',
    qualification: '',
    experience_years: '',
    gender: '',
    maps_embed: '',
    consultation_fee: '',
    bio: '',
  })

  // Saved values (what's actually in the DB) drive the score + preview strip.
  const [saved, setSaved] = useState({ profile_photo: '', mci_number: '', maps_embed: '', consultation_fee: '', bio: '' })

  // Step 3: candidate map from the automatic search or a pasted link, shown
  // for the dentist to confirm before it's saved.
  const [mapCandidate, setMapCandidate] = useState('')
  const [mapQuery, setMapQuery] = useState('')
  const [mapLink, setMapLink] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  const [existingTreatmentIds, setExistingTreatmentIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      // onboarding_completed is NOT selected here (added out-of-band; selecting
      // it on an env without the column would 400).
      const { data: d } = await supabase
        .from('dentists')
        .select('id, slug, name, clinic_name, city, whatsapp, consultation_fee, profile_photo, cover_photo, maps_embed, sub_area, qualifications, experience_years, gender, mci_number, bio, working_hours, is_verified, areas(name)')
        .eq('email', user.email)
        .single()
      if (cancelled) return
      if (!d) { router.push('/for-dentists/register'); return }
      const row = d as any
      setDentistId(row.id)

      const { data: myLinks } = await supabase
        .from('dentist_treatments').select('treatment_id').eq('dentist_id', row.id)
      if (cancelled) return
      const have = new Set((myLinks ?? []).map(r => (r as any).treatment_id as string))
      setExistingTreatmentIds(have)
      setSelectedIds(new Set(TREATMENTS.filter(t => have.has(t.id)).map(t => t.id)))

      const city = getCityBySlug(row.city)
      setSlug(row.slug || '')
      setSiteBase(`https://${city.domain}`)
      setCityName(city.cityName)
      const areaName = (Array.isArray(row.areas) ? row.areas[0]?.name : row.areas?.name) || row.sub_area || ''
      setArea(areaName)
      setIsVerified(!!row.is_verified)
      setHadHours(!!row.working_hours)
      setMapQuery([row.clinic_name, areaName, city.cityName].filter(Boolean).join(', '))

      const f = {
        name: row.name || '',
        clinic_name: row.clinic_name || '',
        city: (row.city || 'mumbai') as CitySlug,
        whatsapp: row.whatsapp || '',
        profile_photo: row.profile_photo || '',
        cover_photo: row.cover_photo || '',
        mci_number: row.mci_number || '',
        qualification: row.qualifications || '',
        experience_years: row.experience_years ? String(row.experience_years) : '',
        gender: row.gender || '',
        maps_embed: row.maps_embed || '',
        consultation_fee: row.consultation_fee ? String(row.consultation_fee) : '',
        bio: row.bio || '',
      }
      setForm(f)
      setSaved({ profile_photo: f.profile_photo, mci_number: f.mci_number, maps_embed: f.maps_embed, consultation_fee: f.consultation_fee, bio: f.bio })

      // ?step=N deep link (dashboard gate + setup card). Without it, start on
      // the intro screen.
      const wanted = Number(new URLSearchParams(window.location.search).get('step'))
      if (wanted >= 1 && wanted <= 5) setStep(wanted)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Step 3: look the clinic up on Google Maps automatically on arrival.
  useEffect(() => {
    if (step === 3 && !form.maps_embed && !mapCandidate && mapQuery && !busy) findOnMaps('', mapQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Step 5: pre-fill the about text with a draft when it's empty.
  useEffect(() => {
    if (step === 5 && !form.bio.trim()) {
      setForm(f => ({
        ...f,
        bio: draftBio({
          name: f.name, qualifications: f.qualification, experience_years: f.experience_years,
          clinic_name: f.clinic_name, area, city: cityName, mci_number: f.mci_number,
          treatments: TREATMENTS.filter(t => selectedIds.has(t.id)).map(t => t.name.toLowerCase()),
        }),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function save(patch: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('dentists')
      .update(patch)
      .eq('id', dentistId)
      .select('id')
    if (error || !data || data.length === 0) {
      throw new Error(error?.message || 'Save failed. Please try again.')
    }
  }

  // Where to go after finishing step `from`. Steps 1–3 go forward. After the
  // last go-live step, show the "essentials done" screen, or send them to the
  // first go-live step still missing.
  function after(from: number, s = saved) {
    if (from < 4) return from + 1
    if (from === 4) {
      const missing = firstMissingLiveStep(s)
      return missing ?? LIVE
    }
    const missing = firstMissingLiveStep(s)
    return missing ?? DONE
  }

  function go(n: number) { setErr(''); setStep(n); window.scrollTo(0, 0) }

  async function finishLater() {
    setLaterCookie()
    try { await fetch('/api/onboard/complete', { method: 'POST' }) } catch { /* best-effort */ }
    router.refresh()
    router.push('/for-dentists/dashboard')
  }

  async function uploadPhoto(file: File, type: 'profile' | 'cover') {
    // Vercel rejects bodies over ~4.5MB before our route runs.
    if (file.size > 4 * 1024 * 1024) {
      setErr('Photo too large. Please use a photo under 4MB. Tip: send it to yourself on WhatsApp first, it compresses automatically.')
      return
    }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', type)
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: fd })
      const text = await res.text()
      let data: { success?: boolean; url?: string; error?: string }
      try { data = JSON.parse(text) } catch { throw new Error('Upload failed. The photo may be too large.') }
      if (!data.success) throw new Error(data.error || 'Upload failed.')
      const url = data.url || ''
      if (type === 'profile') {
        setForm(f => ({ ...f, profile_photo: url }))
        setSaved(s => ({ ...s, profile_photo: url }))
      } else {
        setForm(f => ({ ...f, cover_photo: url }))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    }
    setBusy(false)
  }

  // Step 2
  async function saveRegistration() {
    const reg = form.mci_number.trim()
    if (reg.length < 3) { setErr('Please enter your registration number.'); return }
    setBusy(true); setErr('')
    try {
      const patch: Record<string, unknown> = { mci_number: reg.slice(0, 60) }
      if (form.qualification) patch.qualifications = form.qualification
      if (form.experience_years !== '') patch.experience_years = Number(form.experience_years)
      if (form.gender) patch.gender = form.gender.toLowerCase()
      await save(patch)
      const s = { ...saved, mci_number: reg }
      setSaved(s)
      go(after(2, s))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.')
    }
    setBusy(false)
  }

  // Step 3: resolve a clinic name or pasted Google link into a map to confirm.
  async function findOnMaps(link: string, name: string) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/dentist/maps-embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: link, name, clinic_name: form.clinic_name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load the map.')
      if (!data.maps_embed) throw new Error("Couldn't find that on Google Maps. Check the name, or paste your Google Maps link.")
      setMapCandidate(data.maps_embed)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the map.')
    }
    setBusy(false)
  }

  async function confirmMap() {
    const embed = mapCandidate || form.maps_embed
    if (!embed) return
    setBusy(true); setErr('')
    try {
      await save({ maps_embed: embed })
      setForm(f => ({ ...f, maps_embed: embed }))
      const s = { ...saved, maps_embed: embed }
      setSaved(s)
      setMapCandidate('')
      go(after(3, s))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your location.')
    }
    setBusy(false)
  }

  // Step 4
  async function saveFeeAndTreatments() {
    const fee = Number(form.consultation_fee)
    if (!fee || fee <= 0) { setErr('Please set your consultation fee.'); return }
    setBusy(true); setErr('')
    try {
      await save({ consultation_fee: fee })
      const toInsert = [...selectedIds]
        .filter(id => !existingTreatmentIds.has(id))
        .map(treatment_id => ({ dentist_id: dentistId, treatment_id, fee_from: null, fee_to: null }))
      if (toInsert.length) {
        const { data, error } = await supabase.from('dentist_treatments').insert(toInsert).select('treatment_id')
        if (error) throw new Error(error.message)
        setExistingTreatmentIds(prev => {
          const n = new Set(prev)
          for (const r of data ?? []) n.add((r as any).treatment_id as string)
          return n
        })
      }
      const s = { ...saved, consultation_fee: String(fee) }
      setSaved(s)
      if (isSetupLive(s)) {
        // Reached 80%: mark the wizard as seen so the gate stops firing.
        try { await fetch('/api/onboard/complete', { method: 'POST' }) } catch { /* best-effort */ }
      }
      go(after(4, s))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.')
    }
    setBusy(false)
  }

  // Step 5
  async function saveAbout() {
    const bio = form.bio.trim()
    if (bio.length < BIO_MIN) { setErr(`Please write at least ${BIO_MIN} characters about yourself.`); return }
    setBusy(true); setErr('')
    try {
      const patch: Record<string, unknown> = { bio }
      if (!hadHours) patch.working_hours = DEFAULT_SETUP_HOURS
      await save(patch)
      if (!hadHours) setHadHours(true)
      const s = { ...saved, bio }
      setSaved(s)
      go(after(5, s))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.')
    }
    setBusy(false)
  }

  async function goDashboard() {
    try { await fetch('/api/onboard/complete', { method: 'POST' }) } catch { /* best-effort */ }
    router.refresh()
    router.push('/for-dentists/dashboard')
  }

  function toggleTreatment(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const profileUrl = slug ? `${siteBase}/dentist/${slug}` : ''
  const profileUrlShort = profileUrl.replace(/^https?:\/\//, '')
  async function copyLink() {
    try { await navigator.clipboard.writeText(profileUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  // ---- styles (inline only, navy/teal brand) ----
  const btn: React.CSSProperties = {
    minHeight: 54, width: '100%', border: 'none', borderRadius: 14,
    background: TEAL, color: '#fff', fontWeight: 700, fontSize: 16,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
    fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
  }
  const btnOff: React.CSSProperties = { ...btn, opacity: 0.5, cursor: 'not-allowed' }
  const btnGhost: React.CSSProperties = { ...btn, background: '#fff', color: NAVY, border: `1.5px solid ${LINE}` }
  const btnWa: React.CSSProperties = { ...btn, background: '#25D366' }
  const textLink: React.CSSProperties = {
    background: 'none', border: 'none', color: MUTED, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0,
  }
  const input: React.CSSProperties = {
    width: '100%', minHeight: 52, padding: '0 16px', borderRadius: 12,
    border: '1.5px solid #CBD5E1', fontSize: 16, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'var(--font-body)', background: '#fff', color: NAVY,
  }
  const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: NAVY, display: 'block', marginBottom: 6 }
  const h1: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: NAVY, lineHeight: 1.2, margin: 0, fontFamily: 'var(--font-heading)' }
  const sub: React.CSSProperties = { color: MUTED, fontSize: 15, lineHeight: 1.5, margin: 0 }
  const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 }
  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: 44, padding: '8px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-body)',
    background: on ? TINT : '#fff', color: on ? TEAL_DARK : NAVY,
    border: `1.5px solid ${on ? TEAL : '#CBD5E1'}`,
  })
  const timePill: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: TEAL_DARK, background: TINT, borderRadius: 99, padding: '2px 10px', whiteSpace: 'nowrap' }
  const badge = (on: boolean, blue = false): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '2px 8px',
    background: on ? (blue ? '#DBEAFE' : TINT) : '#F8FAFC',
    color: on ? (blue ? '#1D4ED8' : TEAL_DARK) : '#94A3B8',
    border: on ? '1px solid transparent' : '1px dashed #CBD5E1',
  })

  const steps = setupSteps(saved)
  const pct = setupPct(saved)
  const live = isSetupLive(saved)
  const feeValid = !!form.consultation_fee && Number(form.consultation_fee) > 0
  const where = area || cityName
  const subtitle = [form.qualification, form.experience_years ? `${form.experience_years} yrs` : '', where].filter(Boolean).join(' · ')

  const stepBars = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
      {steps.map(s => (
        <i key={s.step} style={{ display: 'block', height: 6, borderRadius: 99, background: s.done ? TEAL : (s.step === step ? '#99F6E4' : LINE) }} />
      ))}
    </div>
  )

  // Live preview: the result card a patient sees, filling in as steps save.
  const preview = (
    <div style={{ background: NAVY, color: '#fff', padding: '12px 16px 14px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#5EEAD4' }}>
        <span>Patients see</span>
        <span style={{ color: '#94A3B8', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>live preview</span>
      </div>
      <div style={{ background: '#fff', color: NAVY, borderRadius: 12, padding: 10, display: 'grid', gridTemplateColumns: '52px 1fr', gap: 10, alignItems: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: saved.profile_photo ? `center/cover no-repeat url(${saved.profile_photo})` : LINE,
          color: '#94A3B8', fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: 1.1,
        }}>
          {!saved.profile_photo && 'No photo'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.name || 'Your name'}</div>
          <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle || form.clinic_name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            <span style={badge(!!saved.mci_number, true)}>{saved.mci_number ? `Reg. ${saved.mci_number}` : 'Reg. no. missing'}</span>
            <span style={badge(!!saved.consultation_fee)}>{saved.consultation_fee ? `₹${saved.consultation_fee} consult` : 'Fee?'}</span>
            <span style={badge(!!saved.maps_embed)}>{saved.maps_embed ? 'Directions' : 'Map'}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#CBD5E1' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: TEAL, borderRadius: 99, transition: 'width 0.4s' }} />
        </div>
        <b style={{ color: '#fff' }}>{pct}%</b>
      </div>
    </div>
  )

  const isStep = step >= 1 && step <= 5

  return (
    <div style={{ minHeight: '100svh', background: '#F8FAFC', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px' }}>
          <div style={{ width: 32, height: 32, background: NAVY, borderRadius: 8, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>D</div>
          <span style={{ fontWeight: 700, color: NAVY, fontFamily: 'var(--font-heading)' }}>DentistIn</span>
        </div>

        {loading ? (
          <p style={{ color: MUTED, padding: '0 20px' }}>Loading…</p>
        ) : (
          <>
            {isStep && preview}
            {isStep && (
              <div style={{ padding: '12px 20px 10px', borderBottom: `1px solid ${LINE}`, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                  <span style={{ color: TEAL_DARK }}>Step {step} of 5</span>
                  <button type="button" style={textLink} onClick={finishLater}>Finish later</button>
                </div>
                {stepBars}
              </div>
            )}

            <div style={{ padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {err && (
                <div role="alert" style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 14 }}>{err}</div>
              )}

              {/* INTRO: what we already did for them */}
              {step === INTRO && (
                <div style={col}>
                  <div style={{ ...card, background: '#F0FDF4', borderColor: '#86EFAC' }}>
                    <h1 style={{ ...h1, fontSize: 20 }}>Your profile page is ready</h1>
                    {profileUrlShort && <div style={{ fontSize: 14, fontWeight: 700, color: TEAL_DARK, marginTop: 6, wordBreak: 'break-all' }}>{profileUrlShort}</div>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Done for you</div>
                  {[
                    form.whatsapp ? [`WhatsApp button set to ${form.whatsapp}`, 'Change it any time in your profile'] : null,
                    ['We\'ll find your clinic on Google Maps', 'You confirm it in step 3'],
                    ['Common treatments added', 'Add more in step 4'],
                    ['Clinic hours and "About you" text drafted', 'You check them in step 5'],
                  ].filter(Boolean).map(item => (
                    <div key={item![0]} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'start', fontSize: 14 }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>✓</span>
                      <span style={{ color: NAVY }}>{item![0]}<span style={{ display: 'block', color: MUTED, fontSize: 13 }}>{item![1]}</span></span>
                    </div>
                  ))}
                  <div style={{ ...card, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <b style={{ color: NAVY }}>{live ? 'Essentials done. One step to 100%' : '5 quick steps to complete your profile'}</b>
                      <span style={timePill}>{live ? '~1 min' : '~4 min'}</span>
                    </div>
                    {stepBars}
                    <p style={{ ...sub, fontSize: 13 }}>Steps 1 to 4 are the essentials patients look for (80%). Step 5 takes you to 100%.</p>
                  </div>
                  <button type="button" style={btn} onClick={() => go(steps.find(s => !s.done)?.step ?? DONE)}>
                    {(() => { const n = steps.find(s => !s.done)?.step; return n ? `Start step ${n} of 5` : 'See my profile' })()}
                  </button>
                  <button type="button" style={{ ...textLink, alignSelf: 'center' }} onClick={finishLater}>Finish later</button>
                </div>
              )}

              {/* STEP 1: Photo */}
              {step === 1 && (
                <div style={col}>
                  <h1 style={h1}>Add your photo</h1>
                  <p style={sub}>A clear photo of your face. Patients pick a dentist they can see.</p>
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: 200, border: `2px ${form.profile_photo ? 'solid' : 'dashed'} ${TEAL}`, borderRadius: 16, cursor: 'pointer',
                    background: form.profile_photo ? `center/cover no-repeat url(${form.profile_photo})` : '#F0FDFA',
                  }}>
                    {!form.profile_photo && <span style={{ color: TEAL_DARK, fontWeight: 700 }}>{busy ? 'Uploading…' : 'Tap to upload or take a photo'}</span>}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const file = e.target.files?.[0]; if (file) uploadPhoto(file, 'profile') }} />
                  </label>
                  {form.profile_photo && <p style={{ ...sub, fontSize: 13, textAlign: 'center' }}>Tap the photo to change it.</p>}
                  <p style={{ ...sub, fontSize: 13 }}>Tip: send the photo to yourself on WhatsApp first. It compresses automatically.</p>
                  <button type="button" style={form.profile_photo && !busy ? btn : btnOff} disabled={busy || !form.profile_photo}
                    onClick={() => go(after(1))}>
                    {form.profile_photo ? 'Next: registration number' : 'Upload a photo to continue'}
                  </button>
                </div>
              )}

              {/* STEP 2: Registration number (required, no skip) */}
              {step === 2 && (
                <div style={col}>
                  <h1 style={h1}>Your registration number</h1>
                  <div style={{ ...card, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E3A8A', display: 'grid', gap: 6 }}>
                    <b>Why we ask</b>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                      Patients check that a dentist is registered before they book. Your number shows on your profile, and once our team checks it you get the blue <b>Verified</b> badge. Verified dentists appear first in search.
                    </p>
                  </div>
                  <div>
                    <label style={fieldLabel} htmlFor="ob-reg">State Dental Council registration number</label>
                    <input id="ob-reg" style={input} placeholder="e.g. A-23817" value={form.mci_number} autoComplete="off"
                      onChange={e => setForm(f => ({ ...f, mci_number: e.target.value }))} />
                  </div>
                  <div>
                    <span style={fieldLabel}>Degree</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {QUALIFICATIONS.map(q => (
                        <button key={q} type="button" style={chip(form.qualification === q)} onClick={() => setForm(f => ({ ...f, qualification: q }))}>{q}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={fieldLabel} htmlFor="ob-exp">Years in practice</label>
                    <input id="ob-exp" style={input} inputMode="numeric" placeholder="e.g. 8" value={form.experience_years}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '')
                        setForm(f => ({ ...f, experience_years: v === '' ? '' : String(Math.min(60, Number(v))) }))
                      }} />
                  </div>
                  <div>
                    <span style={fieldLabel}>Gender <span style={{ color: MUTED, fontWeight: 500 }}>(some patients filter by this)</span></span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['Male', 'Female', 'Other'].map(g => (
                        <button key={g} type="button" style={{ ...chip(form.gender.toLowerCase() === g.toLowerCase()), flex: 1 }}
                          onClick={() => setForm(f => ({ ...f, gender: g }))}>{g}</button>
                      ))}
                    </div>
                  </div>
                  <button type="button" style={form.mci_number.trim().length >= 3 && !busy ? btn : btnOff}
                    disabled={busy || form.mci_number.trim().length < 3} onClick={saveRegistration}>
                    {busy ? 'Saving…' : 'Next: clinic location'}
                  </button>
                  <p style={{ ...sub, fontSize: 13, textAlign: 'center' }}>Needed for the Verified badge. &quot;Finish later&quot; saves your progress.</p>
                </div>
              )}

              {/* STEP 3: Clinic on Google Maps */}
              {step === 3 && (
                <div style={col}>
                  {form.maps_embed && !mapCandidate ? (
                    <>
                      <h1 style={h1}>Your clinic on Google Maps</h1>
                      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${LINE}` }} dangerouslySetInnerHTML={{ __html: form.maps_embed }} />
                      <button type="button" style={btn} onClick={() => go(after(3))}>Looks right, next</button>
                      <button type="button" style={btnGhost} onClick={() => setShowPaste(true)}>Change location</button>
                    </>
                  ) : (
                    <>
                      <h1 style={h1}>Is this your clinic?</h1>
                      <p style={sub}>We searched Google Maps for &quot;{mapQuery}&quot;.</p>
                      {mapCandidate ? (
                        <div style={{ borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${LINE}` }} dangerouslySetInnerHTML={{ __html: mapCandidate }} />
                      ) : (
                        <div style={{ ...card, minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
                          {busy ? 'Searching Google Maps…' : 'No map yet'}
                        </div>
                      )}
                      <button type="button" style={mapCandidate && !busy ? btn : btnOff} disabled={busy || !mapCandidate} onClick={confirmMap}>
                        {busy ? 'Saving…' : 'Yes, this is my clinic'}
                      </button>
                      {!showPaste && (
                        <button type="button" style={btnGhost} onClick={() => setShowPaste(true)}>Not right? Fix it</button>
                      )}
                    </>
                  )}
                  {showPaste && (
                    <div style={{ ...card, display: 'grid', gap: 10 }}>
                      <label style={{ ...fieldLabel, marginBottom: 0 }} htmlFor="ob-maplink">Paste your Google Maps or Google Business Profile link</label>
                      <input id="ob-maplink" style={input} placeholder="maps.app.goo.gl/…" value={mapLink}
                        onChange={e => setMapLink(e.target.value)} />
                      <p style={{ ...sub, fontSize: 13 }}>On Google Maps, open your clinic, tap Share, then Copy link.</p>
                      <div style={{ fontSize: 12, color: MUTED, textAlign: 'center' }}>or search a different name</div>
                      <input id="ob-mapname" style={input} placeholder="Clinic name, area" value={mapQuery}
                        onChange={e => setMapQuery(e.target.value)} />
                      <button type="button" style={(mapLink.trim() || mapQuery.trim()) && !busy ? { ...btn, background: NAVY } : { ...btnOff, background: NAVY }}
                        disabled={busy || !(mapLink.trim() || mapQuery.trim())}
                        onClick={() => findOnMaps(mapLink.trim(), mapQuery.trim())}>
                        {busy ? 'Finding…' : 'Show on map'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: Fee + treatments */}
              {step === 4 && (
                <div style={col}>
                  <h1 style={h1}>Consultation fee</h1>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {FEE_CHIPS.map(v => (
                      <button key={v} type="button" style={chip(form.consultation_fee === String(v))}
                        onClick={() => setForm(f => ({ ...f, consultation_fee: String(v) }))}>₹{v}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>₹</span>
                    <input id="ob-fee" style={input} inputMode="numeric" placeholder="Other amount" value={form.consultation_fee}
                      onChange={e => setForm(f => ({ ...f, consultation_fee: e.target.value.replace(/\D/g, '') }))} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>Treatments you offer</div>
                  <p style={{ ...sub, fontSize: 14 }}>Patients search by treatment. Tick all you offer.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {TREATMENTS.map(t => {
                      const on = selectedIds.has(t.id)
                      return (
                        <button key={t.id} type="button" style={chip(on)} onClick={() => toggleTreatment(t.id)}>
                          {on ? '✓ ' : '+ '}{t.name}
                        </button>
                      )
                    })}
                  </div>
                  <button type="button" style={feeValid && !busy ? btn : btnOff} disabled={busy || !feeValid} onClick={saveFeeAndTreatments}>
                    {busy ? 'Saving…' : isSetupLive({ ...saved, consultation_fee: form.consultation_fee }) ? 'Save, essentials done!' : 'Save and continue'}
                  </button>
                </div>
              )}

              {/* LIVE at 80% */}
              {step === LIVE && (
                <div style={col}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 44, color: TEAL_DARK, textAlign: 'center' }}>{pct}%</div>
                  <h1 style={{ ...h1, textAlign: 'center' }}>Your profile is ready for patients</h1>
                  <p style={{ ...sub, textAlign: 'center' }}>Patients searching for a dentist{where ? ` in ${where}` : ''} now see your photo, registration number, fee and location.</p>
                  {profileUrl && (
                    <div style={{ ...card, display: 'grid', gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEAL_DARK, wordBreak: 'break-all' }}>{profileUrlShort}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <a style={btnWa} target="_blank" rel="noopener noreferrer"
                          href={`https://wa.me/?text=${encodeURIComponent(`You can now book an appointment with me on DentistIn: ${profileUrl}`)}`}>Share on WhatsApp</a>
                        <button type="button" style={btnGhost} onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
                      </div>
                    </div>
                  )}
                  {!isVerified && (
                    <div style={{ ...card, background: '#FFFBEB', borderColor: '#FCD34D', color: '#92400E' }}>
                      <b>Verified badge: being checked</b>
                      <p style={{ margin: '4px 0 0', fontSize: 14 }}>Our team checks your registration number within 2 working days.</p>
                    </div>
                  )}
                  {pct < 100 && (
                    <div style={{ ...card, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <b style={{ color: NAVY }}>Last step: 100%</b><span style={timePill}>~1 min</span>
                      </div>
                      <p style={{ ...sub, fontSize: 14 }}>Check your about text and hours, and add a clinic photo. Complete profiles rank higher.</p>
                      <button type="button" style={btn} onClick={() => go(5)}>Finish step 5</button>
                    </div>
                  )}
                  {profileUrl && <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={btnGhost}>View my profile</a>}
                  <button type="button" style={btnGhost} onClick={goDashboard}>Go to dashboard</button>
                </div>
              )}

              {/* STEP 5: About + hours + cover */}
              {step === 5 && (
                <div style={col}>
                  <h1 style={h1}>Check your about text</h1>
                  <p style={sub}>We wrote this from your details. Edit anything.</p>
                  <textarea id="ob-bio" rows={6} value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    style={{ ...input, minHeight: 140, padding: 12, lineHeight: 1.5, resize: 'vertical' }} />
                  <div style={{ fontSize: 12, color: form.bio.trim().length >= BIO_MIN ? TEAL_DARK : MUTED }}>
                    {form.bio.trim().length} characters{form.bio.trim().length < BIO_MIN ? ` (at least ${BIO_MIN})` : ''}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clinic hours</div>
                  {hadHours ? (
                    <p style={{ ...sub, fontSize: 14 }}>Your hours are already set. <a href="/for-dentists/dashboard/hours" style={{ color: TEAL_DARK, fontWeight: 700 }}>Edit hours</a></p>
                  ) : (
                    <div style={{ ...card, display: 'grid', gap: 6, fontSize: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
                        <b>Mon–Sat</b><span>10:00–2:00 · 5:00–9:00</span>
                        <b>Sunday</b><span>Closed</span>
                      </div>
                      <p style={{ ...sub, fontSize: 13 }}>Saved with this step. Different hours? Change them any time from Dashboard → Hours.</p>
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clinic photo (optional)</div>
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100,
                    border: `2px ${form.cover_photo ? 'solid' : 'dashed'} ${TEAL}`, borderRadius: 14, cursor: 'pointer',
                    background: form.cover_photo ? `center/cover no-repeat url(${form.cover_photo})` : '#F0FDFA',
                  }}>
                    {!form.cover_photo && <span style={{ color: TEAL_DARK, fontWeight: 700 }}>{busy ? 'Uploading…' : '+ Add a photo of your clinic'}</span>}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const file = e.target.files?.[0]; if (file) uploadPhoto(file, 'cover') }} />
                  </label>
                  <button type="button" style={form.bio.trim().length >= BIO_MIN && !busy ? btn : btnOff}
                    disabled={busy || form.bio.trim().length < BIO_MIN} onClick={saveAbout}>
                    {busy ? 'Saving…' : 'Done'}
                  </button>
                </div>
              )}

              {/* DONE: 100% */}
              {step === DONE && (
                <div style={col}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 44, color: TEAL_DARK, textAlign: 'center' }}>{pct}%</div>
                  <h1 style={{ ...h1, textAlign: 'center' }}>{pct === 100 ? 'Your profile is complete' : 'Almost there'}</h1>
                  <p style={{ ...sub, textAlign: 'center' }}>
                    {pct === 100 ? 'Complete profiles rank higher and get more bookings.' : 'Finish the remaining steps so patients see your full details.'}
                  </p>
                  {steps.filter(s => !s.done).map(s => (
                    <button key={s.step} type="button" style={{ ...btnGhost, justifyContent: 'space-between', padding: '0 18px' }} onClick={() => go(s.step)}>
                      <span>{s.label}</span><span>→</span>
                    </button>
                  ))}
                  {profileUrl && <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={btnGhost}>View my profile</a>}
                  <button type="button" style={btn} onClick={goDashboard}>Go to dashboard</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
