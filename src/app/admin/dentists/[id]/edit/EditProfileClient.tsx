'use client'

import { useMemo, useRef, useState } from 'react'
import { cityOrigin, getCityBySlug } from '@/config/cities'

// ---------------------------------------------------------------------------
// Admin dentist-profile editor (client).
//
// Column fields save in one POST to /api/admin/dentists (the widened
// allowlist route, which also normalises maps_embed + validates working_hours
// server-side). Photos upload to /api/admin/dentists/[id]/upload as they're
// picked. Treatments reconcile against /api/admin/dentists/[id]/treatments on
// save by diffing the checkbox grid vs. the loaded selection.
// ---------------------------------------------------------------------------

const DAYS = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' }, { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

const TIME_SLOTS = Array.from({ length: 33 }, (_, i) => {
  const totalMins = 6 * 60 + i * 30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const label = `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return { label, value }
})

const DEFAULT_HOURS: Record<string, any> = {
  mon: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  tue: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  wed: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  thu: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  fri: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  sat: { is_open: true, open_time: '09:00', close_time: '14:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  sun: { is_open: false, open_time: '09:00', close_time: '14:00', has_break: false, break_start: '13:00', break_end: '14:00' },
}

interface Props {
  dentist: any
  areas: { id: string; name: string; zone: string | null; city: string | null }[]
  allTreatments: { id: string; name: string; slug: string; icon: string | null }[]
  dentistTreatments: { id: string; treatment_id: string; fee_from: number | null; fee_to: number | null; duration_mins: number | null }[]
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff',
  color: 'var(--text)', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

function Section({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,25,35,0.05)', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          <span style={{ color: '#94A3B8', marginRight: 8 }}>{n}</span>{title}
        </h2>
        {subtitle && <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{subtitle}</p>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 2 ? 260 : 180}px, 1fr))`, gap: 16 }}>{children}</div>
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <span style={{ position: 'relative', display: 'inline-block', width: 42, height: 24, flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: 'absolute', inset: 0, background: checked ? 'var(--blue, #1D4ED8)' : '#CBD5E1', borderRadius: 24, transition: '0.2s' }}>
          <span style={{ position: 'absolute', height: 18, width: 18, left: checked ? 21 : 3, top: 3, background: '#fff', borderRadius: '50%', transition: '0.2s' }} />
        </span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
    </label>
  )
}

// text[] column ↔ comma-separated input helpers.
const arrToStr = (a: unknown): string => Array.isArray(a) ? a.join(', ') : ''
const strToArr = (s: string): string[] => s.split(',').map(x => x.trim()).filter(Boolean)
const numOrNull = (s: string): number | null => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }

export default function EditProfileClient({ dentist, areas, allTreatments, dentistTreatments }: Props) {
  const id = dentist.id as string

  const [form, setForm] = useState({
    name: dentist.name || '',
    clinic_name: dentist.clinic_name || '',
    is_active: dentist.is_active ?? true,
    tier: dentist.tier || 'free',
    bio: dentist.bio || '',
    qualifications: dentist.qualifications || '',
    specialties: arrToStr(dentist.specialties),
    registration_number: dentist.registration_number || '',
    experience_years: dentist.experience_years?.toString() ?? '',
    gender: dentist.gender || '',
    area_id: dentist.area_id || '',
    phone: dentist.phone || '',
    whatsapp: dentist.whatsapp || '',
    address: dentist.address || '',
    maps_embed: dentist.maps_embed || '',
    lat: dentist.lat?.toString() ?? '',
    lng: dentist.lng?.toString() ?? '',
    website: dentist.website || '',
    linkedin_url: dentist.linkedin_url || '',
    languages: arrToStr(dentist.languages),
    consultation_fee: dentist.consultation_fee?.toString() ?? '',
  })
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const [profilePhoto, setProfilePhoto] = useState<string | null>(dentist.profile_photo || null)
  const [coverPhoto, setCoverPhoto] = useState<string | null>(dentist.cover_photo || null)
  const [uploading, setUploading] = useState<'profile' | 'cover' | null>(null)
  const profileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const [hours, setHours] = useState<Record<string, any>>({ ...DEFAULT_HOURS, ...(dentist.working_hours || {}) })
  const updateDay = (day: string, field: string, value: any) => setHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }))

  // Treatment grid state keyed by treatment_id. duration_mins is carried
  // through invisibly so a fee edit doesn't wipe an existing duration.
  type TxRow = { checked: boolean; fee_from: string; fee_to: string; duration_mins: string }
  const buildTx = (): Record<string, TxRow> => {
    const byTid = new Map(dentistTreatments.map(dt => [dt.treatment_id, dt]))
    const out: Record<string, TxRow> = {}
    for (const t of allTreatments) {
      const dt = byTid.get(t.id)
      out[t.id] = {
        checked: !!dt,
        fee_from: dt?.fee_from?.toString() ?? '',
        fee_to: dt?.fee_to?.toString() ?? '',
        duration_mins: dt?.duration_mins?.toString() ?? '',
      }
    }
    return out
  }
  const [tx, setTx] = useState<Record<string, TxRow>>(buildTx)
  const [txOriginal, setTxOriginal] = useState<Record<string, TxRow>>(() => JSON.parse(JSON.stringify(buildTx())))
  const setTxField = (tid: string, field: keyof TxRow, value: any) => setTx(prev => ({ ...prev, [tid]: { ...prev[tid], [field]: value } }))

  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  // Live completion — same five checks as the shared scorer, recomputed from
  // current form state so the badge tracks edits before save.
  const completion = useMemo(() => {
    const checks = [!!profilePhoto, !!coverPhoto, !!(form.bio && form.bio.length >= 50), !!form.whatsapp.trim(), !!form.maps_embed.trim()]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [profilePhoto, coverPhoto, form.bio, form.whatsapp, form.maps_embed])

  const publicUrl = `${cityOrigin(getCityBySlug(dentist.city))}/dentist/${dentist.slug}`

  async function uploadPhoto(kind: 'profile' | 'cover', file: File) {
    setUploading(kind); setBanner(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', kind)
      const res = await fetch(`/api/admin/dentists/${id}/upload`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setBanner({ kind: 'error', msg: data.error || 'Upload failed.' }); return }
      if (kind === 'profile') setProfilePhoto(data.url)
      else setCoverPhoto(data.url)
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Upload failed.' })
    } finally {
      setUploading(null)
    }
  }

  async function handleSave() {
    setSaving(true); setBanner(null)
    try {
      // 1) Column fields in one request. profile_photo/cover_photo are included
      //    so a just-uploaded image is persisted even though the upload route
      //    already wrote it (idempotent, keeps the row authoritative on save).
      const payload: Record<string, unknown> = {
        id,
        name: form.name.trim(),
        clinic_name: form.clinic_name.trim(),
        is_active: form.is_active,
        tier: form.tier,
        bio: form.bio,
        qualifications: form.qualifications.trim(),
        specialties: strToArr(form.specialties),
        registration_number: form.registration_number.trim() || null,
        experience_years: numOrNull(form.experience_years),
        gender: form.gender || null,
        area_id: form.area_id || null,
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim(),
        address: form.address.trim(),
        maps_embed: form.maps_embed,
        lat: numOrNull(form.lat),
        lng: numOrNull(form.lng),
        website: form.website.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        languages: strToArr(form.languages),
        consultation_fee: numOrNull(form.consultation_fee),
        working_hours: hours,
        profile_photo: profilePhoto,
        cover_photo: coverPhoto,
      }
      const res = await fetch('/api/admin/dentists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setBanner({ kind: 'error', msg: data.error || 'Save failed.' }); return }

      // 2) Reconcile treatments against the loaded snapshot.
      const ops: Promise<Response>[] = []
      for (const t of allTreatments) {
        const now = tx[t.id], was = txOriginal[t.id]
        if (now.checked && (!was.checked || now.fee_from !== was.fee_from || now.fee_to !== was.fee_to)) {
          ops.push(fetch(`/api/admin/dentists/${id}/treatments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ treatment_id: t.id, fee_from: now.fee_from, fee_to: now.fee_to, duration_mins: now.duration_mins }),
          }))
        } else if (!now.checked && was.checked) {
          ops.push(fetch(`/api/admin/dentists/${id}/treatments`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ treatment_id: t.id }),
          }))
        }
      }
      const results = await Promise.all(ops)
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) {
        setBanner({ kind: 'error', msg: `Profile saved, but ${failed} treatment change(s) failed. Re-save to retry.` })
        return
      }

      setTxOriginal(JSON.parse(JSON.stringify(tx)))
      setBanner({ kind: 'success', msg: 'Profile saved.' })
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  const completionColor = completion >= 80 ? '#15803D' : completion >= 60 ? '#B45309' : '#B91C1C'
  const completionBg = completion >= 80 ? '#F0FDF4' : completion >= 60 ? '#FFFBEB' : '#FEF2F2'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 80px', fontFamily: 'var(--font-body)' }}>
      {/* Sticky top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', borderBottom: '1px solid #E2E8F0', padding: '14px 0', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {form.clinic_name || form.name || 'Dentist'}
          </div>
          <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.name}</div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: completionBg, color: completionColor, border: `1px solid ${completionColor}33` }}>
          {completion}% complete
        </span>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>View public profile →</a>
        <a href="/admin" style={{ fontSize: 13, color: '#64748B', fontWeight: 600, textDecoration: 'none' }}>← Back to admin</a>
        <button onClick={handleSave} disabled={saving || uploading !== null}
          style={{ padding: '10px 22px', background: saving ? '#94A3B8' : 'var(--blue, #1D4ED8)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving || uploading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {banner && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: banner.kind === 'success' ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${banner.kind === 'success' ? '#BBF7D0' : '#FECACA'}`,
          color: banner.kind === 'success' ? '#15803D' : '#B91C1C',
          display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{banner.msg}</span>
          <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* 1 — Basic info */}
      <Section n={1} title="Basic Info">
        <Grid>
          <Field label="Clinic name"><input value={form.clinic_name} onChange={e => set('clinic_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Doctor name"><input value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Slug (read-only)" hint="Changing the slug would break existing links; edit via a redirect migration instead.">
            <input value={dentist.slug || ''} readOnly disabled style={{ ...inputStyle, background: '#F1F5F9', color: '#94A3B8', cursor: 'not-allowed' }} />
          </Field>
          <Field label="Tier">
            <select value={form.tier} onChange={e => set('tier', e.target.value)} style={selectStyle}>
              {['free', 'silver', 'gold', 'featured'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </Grid>
        <div style={{ marginTop: 16 }}>
          <Toggle checked={form.is_active} onChange={v => set('is_active', v)} label={form.is_active ? 'Active (listed publicly)' : 'Inactive (hidden)'} />
        </div>
      </Section>

      {/* 2 — Bio & credentials */}
      <Section n={2} title="Bio & Credentials">
        <Field label="Bio" hint={`${form.bio.length} chars · 50+ needed to count toward completion`}>
          <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        <div style={{ marginTop: 16 }}>
          <Grid>
            <Field label="Qualification(s)"><input value={form.qualifications} onChange={e => set('qualifications', e.target.value)} placeholder="BDS, MDS" style={inputStyle} /></Field>
            <Field label="Specialties" hint="Comma-separated"><input value={form.specialties} onChange={e => set('specialties', e.target.value)} placeholder="Orthodontics, Implantology" style={inputStyle} /></Field>
            <Field label="Registration number"><input value={form.registration_number} onChange={e => set('registration_number', e.target.value)} style={inputStyle} /></Field>
            <Field label="Experience (years)"><input type="number" min={0} value={form.experience_years} onChange={e => set('experience_years', e.target.value)} style={inputStyle} /></Field>
            <Field label="Gender">
              <select value={form.gender} onChange={e => set('gender', e.target.value)} style={selectStyle}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Languages" hint="Comma-separated"><input value={form.languages} onChange={e => set('languages', e.target.value)} placeholder="English, Hindi, Marathi" style={inputStyle} /></Field>
          </Grid>
        </div>
      </Section>

      {/* 3 — Contact & location */}
      <Section n={3} title="Contact & Location">
        <Grid>
          <Field label="Area">
            <select value={form.area_id} onChange={e => set('area_id', e.target.value)} style={selectStyle}>
              <option value="">—</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}{a.zone ? ` · ${a.zone}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Phone"><input value={form.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} /></Field>
          <Field label="WhatsApp"><input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="10-digit number" style={inputStyle} /></Field>
          <Field label="Email (read-only)" hint="Linked to the login account; edit via account tools.">
            <input value={dentist.email || ''} readOnly disabled style={{ ...inputStyle, background: '#F1F5F9', color: '#94A3B8', cursor: 'not-allowed' }} />
          </Field>
        </Grid>
        <div style={{ marginTop: 16 }}>
          <Field label="Address"><textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <Field label="Google Maps link or embed" hint="Paste a Google Maps link, a Search URL, or a full <iframe> embed. Normalised automatically on save.">
            <textarea value={form.maps_embed} onChange={e => set('maps_embed', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <Grid cols={3}>
            <Field label="Latitude" hint="Auto-filled from Maps link when possible"><input value={form.lat} onChange={e => set('lat', e.target.value)} style={inputStyle} /></Field>
            <Field label="Longitude"><input value={form.lng} onChange={e => set('lng', e.target.value)} style={inputStyle} /></Field>
          </Grid>
        </div>
      </Section>

      {/* 4 — Photos */}
      <Section n={4} title="Photos">
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <label style={labelStyle}>Profile photo</label>
            <div style={{ width: 120, height: 120, borderRadius: '50%', overflow: 'hidden', background: '#F1F5F9', border: '1px solid #E2E8F0', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {profilePhoto ? <img src={profilePhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 30 }}>👤</span>}
            </div>
            <input ref={profileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto('profile', f); e.target.value = '' }} />
            <button onClick={() => profileInputRef.current?.click()} disabled={uploading !== null} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
              {uploading === 'profile' ? 'Uploading…' : 'Upload new'}
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={labelStyle}>Cover photo</label>
            <div style={{ width: '100%', height: 120, borderRadius: 10, overflow: 'hidden', background: '#F1F5F9', border: '1px solid #E2E8F0', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {coverPhoto ? <img src={coverPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 30 }}>🖼️</span>}
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto('cover', f); e.target.value = '' }} />
            <button onClick={() => coverInputRef.current?.click()} disabled={uploading !== null} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
              {uploading === 'cover' ? 'Uploading…' : 'Upload new'}
            </button>
          </div>
        </div>
      </Section>

      {/* 5 — Online presence */}
      <Section n={5} title="Online Presence" subtitle="Only Website and LinkedIn exist as columns on this schema; Instagram/Facebook/YouTube are not stored.">
        <Grid>
          <Field label="Website"><input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://…" style={inputStyle} /></Field>
          <Field label="LinkedIn URL"><input value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" style={inputStyle} /></Field>
        </Grid>
      </Section>

      {/* 6 — Working hours */}
      <Section n={6} title="Working Hours">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DAYS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: 150 }}>
                <Toggle checked={!!hours[key]?.is_open} onChange={v => updateDay(key, 'is_open', v)} label={label} />
              </div>
              {hours[key]?.is_open ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select value={hours[key]?.open_time || '09:00'} onChange={e => updateDay(key, 'open_time', e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
                    {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span style={{ fontSize: 13, color: '#64748B' }}>to</span>
                  <select value={hours[key]?.close_time || '19:00'} onChange={e => updateDay(key, 'close_time', e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
                    {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>Closed</span>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* 7 — Treatments & fees */}
      <Section n={7} title="Treatments & Fees" subtitle="Check a treatment to list it; set the fee range patients see.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allTreatments.map(t => {
            const row = tx[t.id]
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 240, cursor: 'pointer' }}>
                  <input type="checkbox" checked={row.checked} onChange={e => setTxField(t.id, 'checked', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--blue, #1D4ED8)' }} />
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                </label>
                {row.checked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#64748B' }}>₹</span>
                    <input type="number" min={0} value={row.fee_from} onChange={e => setTxField(t.id, 'fee_from', e.target.value)} placeholder="From" style={{ ...inputStyle, width: 100 }} />
                    <span style={{ fontSize: 12, color: '#64748B' }}>–</span>
                    <input type="number" min={0} value={row.fee_to} onChange={e => setTxField(t.id, 'fee_to', e.target.value)} placeholder="To" style={{ ...inputStyle, width: 100 }} />
                  </div>
                )}
              </div>
            )
          })}
          {allTreatments.length === 0 && <div style={{ color: '#94A3B8', fontSize: 13 }}>No treatments defined in the catalogue.</div>}
        </div>
      </Section>

      {/* 8 — Admin controls */}
      <Section n={8} title="Admin Controls" subtitle="No is_featured or internal_notes columns exist on this schema — “featured” is handled via the Tier field above.">
        <Grid>
          <Field label="Consultation fee (₹)"><input type="number" min={0} value={form.consultation_fee} onChange={e => set('consultation_fee', e.target.value)} style={inputStyle} /></Field>
        </Grid>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} disabled={saving || uploading !== null}
          style={{ padding: '11px 28px', background: saving ? '#94A3B8' : 'var(--blue, #1D4ED8)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving || uploading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
