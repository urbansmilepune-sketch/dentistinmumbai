'use client'

// Client form for /cases/new. Self-contained: handles text fields,
// photo uploads (sequential POSTs to /api/cases/upload-photo), and a
// single final POST to /api/cases that creates the case + photo rows
// transactionally on the server.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SPECIALTIES } from '@/lib/dentalSpecialties'
import { MATERIAL_GROUPS } from '@/lib/dentalMaterials'

type Kind = 'before' | 'after' | 'xray_before' | 'xray_after'

interface UploadedPhoto {
  url: string
  kind: Kind
  caption: string
}

const KIND_LABEL: Record<Kind, string> = {
  before: 'Before — clinical photos',
  after: 'After — clinical photos',
  xray_before: 'X-ray (before)',
  xray_after: 'X-ray (after)',
}

const KIND_HINT: Record<Kind, string> = {
  before: 'Pre-treatment intra-oral / facial views.',
  after: 'Post-treatment intra-oral / facial views.',
  xray_before: 'Pre-op periapical, OPG, or CBCT slice.',
  xray_after: 'Post-op imaging used for documentation.',
}

const MAX_PER_KIND = 4

export default function CaseForm({ dentistName, isVerified }: { dentistName: string; isVerified: boolean }) {
  const router = useRouter()

  const [title, setTitle]                       = useState('')
  const [specialty, setSpecialty]               = useState('')
  const [complexity, setComplexity]             = useState(3)
  const [description, setDescription]           = useState('')
  const [materials, setMaterials]               = useState<Set<string>>(new Set())
  const [costMin, setCostMin]                   = useState('')
  const [costMax, setCostMax]                   = useState('')
  const [durationWeeks, setDurationWeeks]       = useState('')
  const [clinicalNotes, setClinicalNotes]       = useState('')
  const [isPrivateNotes, setIsPrivateNotes]     = useState(false)
  const [discussionEnabled, setDiscussionEnabled] = useState(true)

  const [photos, setPhotos]                     = useState<UploadedPhoto[]>([])
  const [uploadErr, setUploadErr]               = useState('')
  const [uploading, setUploading]               = useState<Kind | null>(null)

  const [submitting, setSubmitting]             = useState(false)
  const [submitErr, setSubmitErr]               = useState('')

  function toggleMaterial(m: string) {
    setMaterials(prev => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m); else next.add(m)
      return next
    })
  }

  async function handleFile(file: File, kind: Kind) {
    setUploadErr('')
    if (photos.filter(p => p.kind === kind).length >= MAX_PER_KIND) {
      setUploadErr(`Max ${MAX_PER_KIND} ${KIND_LABEL[kind].toLowerCase()} reached`)
      return
    }
    setUploading(kind)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      const res = await fetch('/api/cases/upload-photo', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        setUploadErr(data?.error || 'Upload failed')
      } else {
        setPhotos(prev => [...prev, { url: data.url as string, kind, caption: '' }])
      }
    } catch {
      setUploadErr('Network error — please try again.')
    }
    setUploading(null)
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitErr('')
    if (!title.trim())     return setSubmitErr('Add a case title')
    if (!specialty)        return setSubmitErr('Pick a specialty')
    if (photos.length === 0) return setSubmitErr('Upload at least one photo')

    setSubmitting(true)
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, specialty, complexity,
          description, clinical_notes: clinicalNotes,
          is_private_notes: isPrivateNotes,
          discussion_enabled: discussionEnabled,
          materials: Array.from(materials),
          cost_min: costMin ? Number(costMin) : null,
          cost_max: costMax ? Number(costMax) : null,
          duration_weeks: durationWeeks ? Number(durationWeeks) : null,
          photos: photos.map((p, i) => ({ url: p.url, kind: p.kind, caption: p.caption, display_order: i })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        setSubmitErr(data?.error || 'Could not save right now')
        setSubmitting(false)
        return
      }
      if (data.status === 'approved') {
        router.push(`/cases/${data.case_id}`)
      } else {
        router.push('/cases/new/pending')
      }
    } catch {
      setSubmitErr('Network error — please try again.')
      setSubmitting(false)
    }
  }

  const sectionStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '20px 22px', marginBottom: 18,
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', minHeight: 44, fontSize: 14,
    borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', color: '#0F1923',
    fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <form onSubmit={submit}>
      {!isVerified && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 12, padding: '14px 18px', marginBottom: 18, fontSize: 13 }}>
          You can submit cases now, but they'll wait in moderation until your dentist profile is MCI-verified. Posting as <strong>{dentistName}</strong>.
        </div>
      )}

      {/* Basics */}
      <section style={sectionStyle}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="case-title">Case title</label>
          <input id="case-title" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Full-mouth rehabilitation with All-on-4 implants" style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle} htmlFor="case-specialty">Specialty</label>
            <select id="case-specialty" required value={specialty} onChange={e => setSpecialty(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {SPECIALTIES.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="case-complexity">Complexity (1 simple — 5 complex)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n} type="button" onClick={() => setComplexity(n)}
                  aria-label={`${n} of 5 complexity`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 24, lineHeight: 1, color: n <= complexity ? '#F59E0B' : '#CBD5E1', padding: 0 }}
                >★</button>
              ))}
              <span style={{ marginLeft: 8, fontSize: 13, color: '#64748B' }}>{complexity} / 5</span>
            </div>
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="case-desc">Treatment description</label>
          <textarea id="case-desc" rows={5} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Walk through the chief complaint, diagnosis, the plan you chose, and how the treatment unfolded."
            style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} />
        </div>
      </section>

      {/* Photos — one block per kind */}
      <section style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, marginBottom: 12, color: '#0F1923' }}>Photos</h2>
        {(Object.keys(KIND_LABEL) as Kind[]).map(kind => {
          const here = photos.filter(p => p.kind === kind)
          return (
            <div key={kind} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <label style={labelStyle}>{KIND_LABEL[kind]}</label>
                  <p style={{ fontSize: 11, color: '#94A3B8' }}>{KIND_HINT[kind]} · max {MAX_PER_KIND}</p>
                </div>
                <PhotoPicker kind={kind} disabled={uploading !== null || here.length >= MAX_PER_KIND} uploading={uploading === kind} onFile={handleFile} />
              </div>
              {here.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {here.map((p, i) => {
                    const globalIdx = photos.indexOf(p)
                    return (
                      <div key={globalIdx} style={{ position: 'relative', width: 110, height: 110, borderRadius: 8, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                        <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button type="button" onClick={() => removePhoto(globalIdx)}
                          style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(15,25,35,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
                          aria-label="Remove photo">✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {uploadErr && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 6, fontWeight: 600 }}>{uploadErr}</div>}
      </section>

      {/* Materials */}
      <section style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, marginBottom: 12, color: '#0F1923' }}>Materials used</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Tap any that apply. Selected: {materials.size}</p>
        {MATERIAL_GROUPS.map(g => (
          <div key={g.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>{g.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.items.map(item => {
                const active = materials.has(item)
                return (
                  <button key={item} type="button" onClick={() => toggleMaterial(item)}
                    style={{ padding: '6px 12px', minHeight: 32, borderRadius: 999, fontSize: 12, fontWeight: 600, background: active ? '#1D4ED8' : '#fff', color: active ? '#fff' : '#475569', border: `1px solid ${active ? '#1D4ED8' : '#E2E8F0'}`, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    {item}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Logistics */}
      <section style={sectionStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <div>
            <label style={labelStyle} htmlFor="cost-min">Cost range (₹)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input id="cost-min" inputMode="numeric" placeholder="Min" value={costMin} onChange={e => setCostMin(e.target.value.replace(/\D/g, ''))} style={inputStyle} />
              <span style={{ color: '#94A3B8' }}>–</span>
              <input inputMode="numeric" placeholder="Max" value={costMax} onChange={e => setCostMax(e.target.value.replace(/\D/g, ''))} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle} htmlFor="duration">Duration (weeks)</label>
            <input id="duration" inputMode="numeric" placeholder="e.g. 16" value={durationWeeks} onChange={e => setDurationWeeks(e.target.value.replace(/\D/g, ''))} style={inputStyle} />
          </div>
        </div>
      </section>

      {/* Clinical notes */}
      <section style={sectionStyle}>
        <label style={labelStyle} htmlFor="notes">Clinical notes</label>
        <textarea id="notes" rows={4} value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)}
          placeholder="Technical details for peers — torque values, occlusal scheme, complications, etc."
          style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: '#475569' }}>
          <input type="checkbox" checked={isPrivateNotes} onChange={e => setIsPrivateNotes(e.target.checked)} />
          Keep clinical notes private (only I can see them)
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13, color: '#475569', marginLeft: 18 }}>
          <input type="checkbox" checked={discussionEnabled} onChange={e => setDiscussionEnabled(e.target.checked)} />
          Allow other verified dentists to comment (coming soon)
        </label>
      </section>

      {submitErr && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{submitErr}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="submit" disabled={submitting}
          style={{ padding: '13px 22px', minHeight: 48, background: submitting ? '#93C5FD' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer' }}>
          {submitting ? 'Submitting…' : 'Submit case'}
        </button>
      </div>
    </form>
  )
}

function PhotoPicker({ kind, disabled, uploading, onFile }: { kind: Kind; disabled: boolean; uploading: boolean; onFile: (file: File, kind: Kind) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()}
        style={{ padding: '7px 12px', minHeight: 34, borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {uploading ? 'Uploading…' : '+ Upload'}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onFile(f, kind)
          if (ref.current) ref.current.value = ''
        }}
      />
    </>
  )
}
