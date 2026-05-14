'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface PhotoPair {
  id: string
  treatment_label: string | null
  before_url: string
  before_date: string | null
  after_url: string
  after_date: string | null
  created_at: string
}

function todayLocalIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PatientPhotosPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dentistId, setDentistId] = useState('')
  const [patientName, setPatientName] = useState('')
  const [pairs, setPairs] = useState<PhotoPair[]>([])

  // Upload form state
  const [treatmentLabel, setTreatmentLabel] = useState('')
  const [beforeUrl, setBeforeUrl] = useState('')
  const [beforeDate, setBeforeDate] = useState(todayLocalIso())
  const [afterUrl, setAfterUrl] = useState('')
  const [afterDate, setAfterDate] = useState(todayLocalIso())
  const [uploading, setUploading] = useState<'before' | 'after' | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) { router.push('/for-dentists/login'); return }
      setDentistId(dentist.id)

      const [{ data: p }, { data: ph }] = await Promise.all([
        supabase.from('patients').select('id, name').eq('id', patientId).eq('dentist_id', dentist.id).single(),
        supabase.from('patient_photos').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id).order('created_at', { ascending: false }),
      ])
      if (!p) { router.push('/for-dentists/dashboard/patients'); return }
      setPatientName(p.name)
      setPairs((ph as PhotoPair[]) || [])
      setLoading(false)
    }
    load()
  }, [patientId, router])

  async function handleUpload(slot: 'before' | 'after', file: File) {
    setUploading(slot)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', 'patient_photo')
    try {
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success || !data?.url) {
        setError(data?.error || 'Upload failed. Try again.')
        setUploading(null); return
      }
      if (slot === 'before') setBeforeUrl(data.url)
      else setAfterUrl(data.url)
    } catch {
      setError('Network error during upload.')
    }
    setUploading(null)
  }

  async function savePair() {
    setError(null)
    if (!beforeUrl || !afterUrl) { setError('Upload both Before and After photos before saving.'); return }
    setSaving(true)
    const supabase = createClient()
    const { data, error: insertErr } = await supabase
      .from('patient_photos')
      .insert({
        dentist_id: dentistId,
        patient_id: patientId,
        treatment_label: treatmentLabel.trim() || null,
        before_url: beforeUrl,
        before_date: beforeDate || null,
        after_url: afterUrl,
        after_date: afterDate || null,
      })
      .select('*')
      .single()
    setSaving(false)
    if (insertErr || !data) { setError(insertErr?.message || 'Could not save photo pair.'); return }
    setPairs(prev => [data as PhotoPair, ...prev])
    setTreatmentLabel('')
    setBeforeUrl(''); setAfterUrl('')
    setBeforeDate(todayLocalIso()); setAfterDate(todayLocalIso())
  }

  async function deletePair(id: string) {
    if (!confirm('Delete this before/after pair?')) return
    const supabase = createClient()
    const { error: e } = await supabase.from('patient_photos').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setPairs(prev => prev.filter(p => p.id !== id))
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading photos…</p>
    </div>
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href={`/for-dentists/dashboard/patients/${patientId}`}
          style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← {patientName}</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>Before & After Photos</h1>
      </div>

      {/* Upload form */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Add a new pair</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Treatment label</label>
          <input value={treatmentLabel} onChange={e => setTreatmentLabel(e.target.value)}
            placeholder="e.g. Smile makeover with veneers, Teeth whitening, Aligner case"
            style={{ width: '100%', padding: '11px 14px', minHeight: 44, borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="upload-grid">
          <PhotoUploadSlot
            label="Before"
            url={beforeUrl}
            date={beforeDate}
            onDateChange={setBeforeDate}
            uploading={uploading === 'before'}
            onPick={(file) => handleUpload('before', file)}
            onClear={() => setBeforeUrl('')}
          />
          <PhotoUploadSlot
            label="After"
            url={afterUrl}
            date={afterDate}
            onDateChange={setAfterDate}
            uploading={uploading === 'after'}
            onPick={(file) => handleUpload('after', file)}
            onClear={() => setAfterUrl('')}
          />
        </div>

        {beforeUrl && afterUrl && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Preview</div>
            <BeforeAfterSlider beforeUrl={beforeUrl} afterUrl={afterUrl} />
          </div>
        )}

        {error && (
          <div style={{ marginTop: 14, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={savePair} disabled={saving || !beforeUrl || !afterUrl}
            style={{ padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: (saving || !beforeUrl || !afterUrl) ? 'not-allowed' : 'pointer', opacity: (saving || !beforeUrl || !afterUrl) ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
            {saving ? 'Saving…' : '✓ Save pair'}
          </button>
        </div>
      </div>

      {/* Gallery */}
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Gallery</h2>
      {pairs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>🖼️</div>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>No before/after pairs yet. Upload a pair above to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pairs.map(p => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>
                    {p.treatment_label || 'Before / After'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Before {fmtDate(p.before_date)} → After {fmtDate(p.after_date)}
                  </div>
                </div>
                <button onClick={() => deletePair(p.id)}
                  style={{ padding: '6px 12px', minHeight: 36, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Delete
                </button>
              </div>
              <BeforeAfterSlider beforeUrl={p.before_url} afterUrl={p.after_url} />
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 600px) {
          .upload-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function PhotoUploadSlot({ label, url, date, onDateChange, uploading, onPick, onClear }: {
  label: string
  url: string
  date: string
  onDateChange: (v: string) => void
  uploading: boolean
  onPick: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: 'var(--bg)', border: '1.5px dashed var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {url ? (
          <>
            <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={onClear} aria-label={`Remove ${label} photo`}
              style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              ✕ Remove
            </button>
          </>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{ position: 'absolute', inset: 0, background: 'none', border: 'none', cursor: uploading ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
            <span style={{ fontSize: 32 }}>{uploading ? '⏳' : '📷'}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{uploading ? 'Uploading…' : `Upload ${label.toLowerCase()} photo`}</span>
            <span style={{ fontSize: 11 }}>JPG, PNG · up to 10 MB</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
      </div>
      <label style={{ display: 'block', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Date taken</span>
        <input type="date" value={date} onChange={e => onDateChange(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
      </label>
    </div>
  )
}

function BeforeAfterSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(50)
  const dragging = useRef(false)

  function update(clientX: number) {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    setPos((x / rect.width) * 100)
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    dragging.current = true
    wrapRef.current?.setPointerCapture(e.pointerId)
    update(e.clientX)
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    update(e.clientX)
  }
  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging.current) wrapRef.current?.releasePointerCapture(e.pointerId)
    dragging.current = false
  }

  return (
    <div ref={wrapRef}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{
        position: 'relative', width: '100%', aspectRatio: '4/3',
        background: '#000', borderRadius: 12, overflow: 'hidden',
        cursor: 'ew-resize', userSelect: 'none', touchAction: 'none',
      }}>
      <img src={beforeUrl} alt="Before" draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={afterUrl} alt="After" draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
      </div>
      <div style={{ position: 'absolute', top: 8, left: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>BEFORE</div>
      <div style={{ position: 'absolute', top: 8, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>AFTER</div>
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, bottom: 0, left: `${pos}%`,
        width: 2, background: '#fff', boxShadow: '0 0 6px rgba(0,0,0,0.6)', transform: 'translateX(-1px)',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 40, height: 40, borderRadius: '50%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)', fontSize: 14, color: '#0F1923', fontWeight: 700,
        }}>⇆</div>
      </div>
    </div>
  )
}
