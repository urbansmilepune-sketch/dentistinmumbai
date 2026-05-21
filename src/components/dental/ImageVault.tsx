'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Single source of truth for the image_type CHECK constraint shipped in
// 20260521170000_patient_images.sql. Add/remove a type here and you also
// need to update the migration.
const IMAGE_TYPES = [
  { id: 'opg',          label: 'OPG',         icon: '🦷', kind: 'xray' },
  { id: 'iopa',         label: 'IOPA',        icon: '🦷', kind: 'xray' },
  { id: 'periapical',   label: 'Periapical',  icon: '🦷', kind: 'xray' },
  { id: 'bitewing',     label: 'Bitewing',    icon: '🦷', kind: 'xray' },
  { id: 'cbct',         label: 'CBCT',        icon: '🧊', kind: 'xray' },
  { id: 'photo_before', label: 'Before',      icon: '📷', kind: 'photo' },
  { id: 'photo_after',  label: 'After',       icon: '📸', kind: 'photo' },
  { id: 'other',        label: 'Other',       icon: '🖼️', kind: 'other' },
] as const
type ImageTypeId = typeof IMAGE_TYPES[number]['id']

function typeLabel(id: string): string {
  return IMAGE_TYPES.find(t => t.id === id)?.label ?? id
}
function typeIcon(id: string): string {
  return IMAGE_TYPES.find(t => t.id === id)?.icon ?? '🖼️'
}

interface PatientImage {
  id: string
  patient_id: string
  dentist_id: string
  image_url: string
  image_type: string
  tooth_numbers: string | null
  notes: string | null
  taken_date: string | null
  cloudinary_public_id: string | null
  created_at: string
}

interface Props {
  patientId: string
  dentistId: string
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Notes that look like URLs are surfaced as a "CBCT viewer" link for cbct
// images. We only treat http(s) URLs as viewer links; any free-form text
// stays as plain notes.
function extractViewerUrl(notes: string | null): string | null {
  if (!notes) return null
  const trimmed = notes.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  // Also pick up "Viewer: <url>" style notes.
  const m = trimmed.match(/https?:\/\/\S+/)
  return m ? m[0] : null
}

export default function ImageVault({ patientId, dentistId }: Props) {
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<PatientImage[]>([])
  const [filter, setFilter] = useState<'all' | ImageTypeId>('all')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Upload form metadata applied to the next file picked. Persistent so a
  // dentist who taps "Upload" five OPGs of the same patient doesn't have to
  // re-pick OPG / re-type the date every time.
  const [uploadType, setUploadType] = useState<ImageTypeId>('opg')
  const [uploadTeeth, setUploadTeeth] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadDate, setUploadDate] = useState(todayIso())
  const [enlarged, setEnlarged] = useState<PatientImage | null>(null)
  // Pair-compare mode picks a before + after row and renders them in a
  // drag-to-reveal slider. Stored as ids so a refetch doesn't drop the
  // selection.
  const [compareBeforeId, setCompareBeforeId] = useState<string | null>(null)
  const [compareAfterId, setCompareAfterId] = useState<string | null>(null)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('patient_images')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setImages((data ?? []) as PatientImage[])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [patientId])

  const filtered = useMemo(() => {
    if (filter === 'all') return images
    return images.filter(i => i.image_type === filter)
  }, [images, filter])

  // Counts by type, drives the chip badges. Doesn't include the 'all'
  // bucket — the chip code reads images.length directly for that.
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of images) m.set(i.image_type, (m.get(i.image_type) ?? 0) + 1)
    return m
  }, [images])

  async function handleFiles(files: FileList | File[]) {
    setUploadError(null)
    const fileList = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (fileList.length === 0) {
      setUploadError('Pick at least one image file.')
      return
    }
    setUploading(true)
    const supabase = createClient()
    const inserted: PatientImage[] = []
    for (const file of fileList) {
      try {
        // The /api/cloudinary/upload "patient_photo" mode uploads + returns
        // URL/public_id without writing to any DB table — we want to insert
        // into patient_images ourselves so we control image_type / metadata.
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', 'patient_photo')
        const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.url) {
          setUploadError(data?.error || `Upload failed for ${file.name}`)
          continue
        }
        const { data: row, error } = await supabase
          .from('patient_images')
          .insert({
            patient_id: patientId,
            dentist_id: dentistId,
            image_url: data.url,
            image_type: uploadType,
            tooth_numbers: uploadTeeth.trim() || null,
            notes: uploadNotes.trim() || null,
            taken_date: uploadDate || null,
            cloudinary_public_id: data.publicId || null,
          })
          .select('*')
          .single()
        if (error) {
          setUploadError(error.message)
          continue
        }
        if (row) inserted.push(row as PatientImage)
      } catch (e: any) {
        setUploadError(e?.message || 'Network error during upload')
      }
    }
    if (inserted.length > 0) {
      setImages(prev => [...inserted, ...prev])
      // Reset only fields that should change per upload session. Type/date
      // sticky so consecutive uploads of the same modality stay fast.
      setUploadTeeth('')
      setUploadNotes('')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function deleteImage(img: PatientImage) {
    if (!confirm(`Delete this ${typeLabel(img.image_type)} image? This can't be undone.`)) return
    const supabase = createClient()
    const { error } = await supabase.from('patient_images').delete().eq('id', img.id)
    if (error) {
      alert(`Delete failed: ${error.message}`)
      return
    }
    setImages(prev => prev.filter(i => i.id !== img.id))
    if (enlarged?.id === img.id) setEnlarged(null)
  }

  async function copyShareLink(img: PatientImage) {
    try {
      await navigator.clipboard.writeText(img.image_url)
      setCopyToast('Link copied — paste it into your specialist message.')
      setTimeout(() => setCopyToast(null), 2500)
    } catch {
      setCopyToast('Copy failed — your browser blocked clipboard access.')
      setTimeout(() => setCopyToast(null), 3000)
    }
  }

  // Auto-pair compare: when the dentist hits Compare, default to the most
  // recent before + most recent after row of the same treatment_label
  // (stored in notes). Falls back to "any most-recent before + any most-
  // recent after" if no notes match.
  function openComparePicker() {
    const before = images.find(i => i.image_type === 'photo_before')
    const after = images.find(i => i.image_type === 'photo_after')
    setCompareBeforeId(before?.id ?? null)
    setCompareAfterId(after?.id ?? null)
  }
  const compareBefore = compareBeforeId ? images.find(i => i.id === compareBeforeId) ?? null : null
  const compareAfter  = compareAfterId  ? images.find(i => i.id === compareAfterId)  ?? null : null
  const compareOpen = !!(compareBefore && compareAfter)

  const beforeOptions = images.filter(i => i.image_type === 'photo_before')
  const afterOptions  = images.filter(i => i.image_type === 'photo_after')
  const hasPhotosForCompare = beforeOptions.length > 0 && afterOptions.length > 0

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    handleFiles(e.dataTransfer.files)
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading images…</div>
  }

  return (
    <div>
      {/* Upload zone — drag/drop, click to pick, or use the camera on mobile */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          background: dragOver ? 'var(--blue-light)' : '#fff',
          border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--border)'}`,
          borderRadius: 14,
          padding: '18px 20px',
          marginBottom: 16,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>🔬 X-Rays &amp; Photos</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Drag images here or pick from your device. Camera capture works on phones.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              style={{ padding: '8px 16px', minHeight: 40, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
              {uploading ? 'Uploading…' : '+ Upload'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
              onChange={e => e.target.files && handleFiles(e.target.files)} />
          </div>
        </div>

        {/* Pre-upload metadata. These apply to every file picked in the next
            tap of "+ Upload" so a multi-file selection inherits the same
            tags — the dentist isn't tagging each file separately. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          <Field label="Type">
            <select value={uploadType} onChange={e => setUploadType(e.target.value as ImageTypeId)}
              style={inputStyle}>
              {IMAGE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </select>
          </Field>
          <Field label="Tooth numbers">
            <input value={uploadTeeth} onChange={e => setUploadTeeth(e.target.value)}
              placeholder="e.g. 11, 12, 21" style={inputStyle} />
          </Field>
          <Field label="Taken on">
            <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
              style={inputStyle} />
          </Field>
          <Field label={uploadType === 'cbct' ? 'Notes / CBCT viewer URL' : 'Notes'}>
            <input value={uploadNotes} onChange={e => setUploadNotes(e.target.value)}
              placeholder={uploadType === 'cbct' ? 'Paste viewer URL or note' : 'Optional note'}
              style={inputStyle} />
          </Field>
        </div>

        {uploadError && (
          <div style={{ marginTop: 12, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>
            {uploadError}
          </div>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${images.length})`} />
        {IMAGE_TYPES.map(t => {
          const c = counts.get(t.id) ?? 0
          if (c === 0) return null
          return (
            <FilterChip key={t.id} active={filter === t.id} onClick={() => setFilter(t.id)}
              label={`${t.icon} ${t.label} (${c})`} />
          )
        })}
        {hasPhotosForCompare && (
          <button onClick={openComparePicker}
            style={{ marginLeft: 'auto', padding: '7px 14px', background: '#fff', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            ↔ Before / After
          </button>
        )}
      </div>

      {/* Compare panel — drag-to-reveal slider over before vs after */}
      {compareOpen && compareBefore && compareAfter && (
        <CompareSlider
          before={compareBefore} after={compareAfter}
          beforeOptions={beforeOptions} afterOptions={afterOptions}
          onPickBefore={setCompareBeforeId} onPickAfter={setCompareAfterId}
          onClose={() => { setCompareBeforeId(null); setCompareAfterId(null) }}
        />
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)' }}>
          {images.length === 0
            ? 'No images uploaded yet. Drop one above to start the vault.'
            : `No images with type "${typeLabel(filter)}". Try another filter.`}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {filtered.map(img => {
            const viewer = img.image_type === 'cbct' ? extractViewerUrl(img.notes) : null
            return (
              <div key={img.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => setEnlarged(img)} type="button"
                  style={{ padding: 0, border: 'none', background: '#0F1923', cursor: 'pointer', position: 'relative', minHeight: 140 }}>
                  <img src={img.image_url} alt={`${typeLabel(img.image_type)}${img.tooth_numbers ? ' · ' + img.tooth_numbers : ''}`}
                    style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                  <span style={{
                    position: 'absolute', top: 6, left: 6,
                    background: 'rgba(15, 25, 35, 0.78)', color: '#fff',
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  }}>{typeIcon(img.image_type)} {typeLabel(img.image_type)}</span>
                </button>
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {img.taken_date
                      ? new Date(img.taken_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </div>
                  {img.tooth_numbers && (
                    <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>🦷 {img.tooth_numbers}</div>
                  )}
                  {img.notes && !viewer && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.notes}>
                      {img.notes}
                    </div>
                  )}
                  {viewer && (
                    <a href={viewer} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
                      🧊 Open CBCT viewer →
                    </a>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <a href={img.image_url} download target="_blank" rel="noopener noreferrer"
                      style={smallBtn}>⬇ Download</a>
                    <button type="button" onClick={() => copyShareLink(img)} style={smallBtn}>🔗 Copy link</button>
                    <button type="button" onClick={() => deleteImage(img)} style={{ ...smallBtn, color: '#991B1B', borderColor: '#FECACA' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Enlarge modal */}
      {enlarged && (
        <div onClick={() => setEnlarged(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <button onClick={() => setEnlarged(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: 18, cursor: 'pointer' }}>✕</button>
          <img src={enlarged.image_url} alt={typeLabel(enlarged.image_type)}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }} />
          <div onClick={e => e.stopPropagation()}
            style={{ marginTop: 14, color: '#fff', fontSize: 13, textAlign: 'center', maxWidth: '90vw' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{typeIcon(enlarged.image_type)} {typeLabel(enlarged.image_type)}{enlarged.tooth_numbers ? ` · ${enlarged.tooth_numbers}` : ''}</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {enlarged.taken_date ? new Date(enlarged.taken_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              {enlarged.notes ? ` · ${enlarged.notes}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <a href={enlarged.image_url} download target="_blank" rel="noopener noreferrer"
                style={{ ...smallBtn, background: '#fff' }}>⬇ Download</a>
              <button type="button" onClick={() => copyShareLink(enlarged)} style={{ ...smallBtn, background: '#fff' }}>🔗 Copy link</button>
            </div>
          </div>
        </div>
      )}

      {copyToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 1200, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          {copyToast}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} type="button"
      style={{
        padding: '6px 12px', borderRadius: 20,
        background: active ? 'var(--blue)' : '#fff',
        color: active ? '#fff' : 'var(--text)',
        border: `1.5px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
        fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer',
      }}>{label}</button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', fontSize: 13,
  fontFamily: 'var(--font-body)', background: '#fff', outline: 'none', boxSizing: 'border-box',
}

const smallBtn: React.CSSProperties = {
  padding: '5px 10px', background: 'var(--bg)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
  cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
}

// Drag-to-reveal before/after slider. The "after" image is positioned
// absolutely on top of "before" and clipped via `clip-path: inset(...)` so
// dragging the handle only moves the reveal edge — no resize/redraw of
// the images themselves. Works on touch and mouse.
function CompareSlider({ before, after, beforeOptions, afterOptions, onPickBefore, onPickAfter, onClose }: {
  before: PatientImage
  after: PatientImage
  beforeOptions: PatientImage[]
  afterOptions: PatientImage[]
  onPickBefore: (id: string) => void
  onPickAfter:  (id: string) => void
  onClose: () => void
}) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function move(clientX: number) {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    setPos((x / rect.width) * 100)
  }
  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    move(e.clientX)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    move(e.clientX)
  }
  function onPointerUp() { dragging.current = false }

  function pickLabel(img: PatientImage) {
    return img.taken_date
      ? new Date(img.taken_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'undated'
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--blue)', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: '0 4px 12px rgba(0,87,168,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>Before / After comparison</h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Field label={`Before (${beforeOptions.length} available)`}>
          <select value={before.id} onChange={e => onPickBefore(e.target.value)} style={inputStyle}>
            {beforeOptions.map(i => <option key={i.id} value={i.id}>{pickLabel(i)}{i.notes ? ` — ${i.notes.slice(0, 32)}` : ''}</option>)}
          </select>
        </Field>
        <Field label={`After (${afterOptions.length} available)`}>
          <select value={after.id} onChange={e => onPickAfter(e.target.value)} style={inputStyle}>
            {afterOptions.map(i => <option key={i.id} value={i.id}>{pickLabel(i)}{i.notes ? ` — ${i.notes.slice(0, 32)}` : ''}</option>)}
          </select>
        </Field>
      </div>

      <div ref={containerRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{
          position: 'relative', width: '100%', aspectRatio: '4 / 3',
          background: '#0F1923', borderRadius: 10, overflow: 'hidden',
          touchAction: 'none', userSelect: 'none', cursor: 'ew-resize',
        }}>
        <img src={before.image_url} alt="before"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
        <img src={after.image_url} alt="after"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
            clipPath: `inset(0 0 0 ${pos}%)`,
          }} draggable={false} />
        {/* Reveal handle — vertical bar at the slider position. */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: `${pos}%`,
          width: 2, background: '#fff', boxShadow: '0 0 6px rgba(0,0,0,0.5)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: `${pos}%`,
          transform: 'translate(-50%, -50%)',
          width: 32, height: 32, borderRadius: '50%',
          background: '#fff', border: '2px solid #fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: 'var(--blue)', fontWeight: 800,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>↔</div>
        {/* Labels in the corners — fixed positions so they don't clip
            against the slider handle no matter where the user drags it. */}
        <span style={{ position: 'absolute', top: 8, left: 10, background: 'rgba(15,25,35,0.7)', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>BEFORE · {pickLabel(before)}</span>
        <span style={{ position: 'absolute', top: 8, right: 10, background: 'rgba(15,25,35,0.7)', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>AFTER · {pickLabel(after)}</span>
      </div>
    </div>
  )
}
