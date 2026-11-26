'use client'

// AI case helper on /cases/new (v2 network, Nov 2026). One tap checks the
// uploaded photos and drafts the write-up:
//   - blurs faces (Cloudinary e_blur_faces on the photo URL)
//   - covers a patient name / ID printed on an X-ray with a black box
//     (drawn in the browser, re-uploaded through /api/cases/upload-photo)
//   - suggests title, summary, specialty, question; each needs a tap to use
// Nothing changes without the dentist tapping, and consent stays theirs.

import { useEffect, useRef, useState } from 'react'
import { getSpecialty } from '@/lib/dentalSpecialties'

type Kind = 'before' | 'after' | 'xray_before' | 'xray_after'
interface Photo { url: string; kind: Kind }
interface PhotoCheck { face_visible: boolean; identifying_text: boolean; text_box: { x: number; y: number; w: number; h: number } | null; looks_like: 'xray' | 'photo' }
export interface Result {
  photos: PhotoCheck[]; title: string; summary: string; specialty: string; question: string; tags: string[]
  chief_complaint?: string; diagnosis?: string; treatment_plan?: string
  patient_age?: number | null; patient_gender?: string; complexity?: number | null
}

interface Props {
  photos: Photo[]
  notes: string
  onReplaceUrl: (index: number, url: string) => void
  onUseTitle: (v: string) => void
  onUseSummary: (v: string) => void
  onUseSpecialty: (v: string) => void
  onUseQuestion: (v: string) => void
  /** WhatsApp cases: run the check once on open and hand the draft to the form. */
  autoRun?: boolean
  /** Returns the suggestion keys it applied (title, specialty, question, summary). */
  onAutoFill?: (r: Result) => string[]
}

export function blurFacesUrl(url: string): string {
  if (url.includes('e_blur_faces')) return url
  return url.replace('/image/upload/', '/image/upload/e_blur_faces:1200/')
}

async function coverBox(url: string, box: { x: number; y: number; w: number; h: number }): Promise<Blob> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  ctx.drawImage(img, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(box.x * c.width, box.y * c.height, box.w * c.width, box.h * c.height)
  return await new Promise<Blob>((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not save image'))), 'image/jpeg', 0.92))
}

export default function AiHelper({ photos, notes, onReplaceUrl, onUseTitle, onUseSummary, onUseSpecialty, onUseQuestion, autoRun = false, onAutoFill }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [checkedUrls, setCheckedUrls] = useState<string[]>([])
  const [fixing, setFixing] = useState<number | null>(null)
  const [used, setUsed] = useState<Record<string, boolean>>({})

  const autoRan = useRef(false)
  const markUsed = (keys?: string[]) => { if (keys?.length) setUsed(u => ({ ...u, ...Object.fromEntries(keys.map(k => [k, true])) })) }

  // One automatic run for WhatsApp photos. The draft is cached for this tab
  // so a reload doesn't spend another AI call on the same photos.
  useEffect(() => {
    if (!autoRun || autoRan.current || !photos.length) return
    autoRan.current = true
    const key = `case-ai:${photos.map(p => p.url).join('|')}`
    let cached: Result | null = null
    try { cached = JSON.parse(sessionStorage.getItem(key) || 'null') } catch {}
    if (cached?.photos?.length === photos.length) {
      setResult(cached); setCheckedUrls(photos.map(p => p.url)); markUsed(onAutoFill?.(cached))
      return
    }
    run(true).then(r => {
      if (!r) return
      try { sessionStorage.setItem(key, JSON.stringify(r)) } catch {}
      markUsed(onAutoFill?.(r))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun])

  async function run(auto = false): Promise<Result | null> {
    setErr(''); setBusy(true); setResult(null); setUsed({})
    let out: Result | null = null
    try {
      const res = await fetch('/api/cases/ai-assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photos.map(p => ({ url: p.url, kind: p.kind })), notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || 'The AI helper could not run')
      setResult(data.result)
      setCheckedUrls(photos.map(p => p.url))
      out = data.result
    } catch (e: any) {
      const m = e?.message || 'The AI helper could not run'
      setErr(auto ? `We could not draft the details automatically (${m}). Tap Check my photos to try again, or fill the form yourself.` : m)
    }
    setBusy(false)
    return out
  }

  async function blur(i: number) {
    onReplaceUrl(i, blurFacesUrl(photos[i].url))
    setUsed(u => ({ ...u, [`face${i}`]: true }))
  }

  async function cover(i: number, box: NonNullable<PhotoCheck['text_box']>) {
    setFixing(i); setErr('')
    try {
      const blob = await coverBox(photos[i].url, box)
      const fd = new FormData()
      fd.append('file', new File([blob], 'covered.jpg', { type: 'image/jpeg' }))
      fd.append('kind', photos[i].kind)
      const res = await fetch('/api/cases/upload-photo', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed')
      onReplaceUrl(i, data.url)
      setUsed(u => ({ ...u, [`text${i}`]: true }))
    } catch (e: any) {
      setErr(`Could not cover the name automatically (${e?.message || 'error'}). Please crop it out and upload the photo again.`)
    }
    setFixing(null)
  }

  const box: React.CSSProperties = { background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 14, padding: '16px 18px', marginBottom: 18 }
  const btn: React.CSSProperties = { minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #6D28D9', background: '#fff', color: '#6D28D9', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }
  const usedBtn: React.CSSProperties = { ...btn, borderColor: '#047857', color: '#047857', cursor: 'default' }
  const stale = result && checkedUrls.length !== photos.length

  return (
    <section style={box} aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#4C1D95' }}>AI case helper</div>
          <div style={{ fontSize: 13, color: '#5B21B6' }}>Checks photos for faces and patient names, and drafts the write-up. You decide what to use.</div>
        </div>
        <button type="button" onClick={() => run()} disabled={busy || photos.length === 0}
          style={{ ...btn, minHeight: 44, background: busy || !photos.length ? '#C4B5FD' : '#6D28D9', color: '#fff', borderColor: 'transparent', cursor: busy ? 'wait' : photos.length ? 'pointer' : 'not-allowed' }}>
          {busy ? (autoRun && !result ? 'Drafting from your photos…' : 'Checking…') : result ? 'Check again' : 'Check my photos'}
        </button>
      </div>
      {photos.length === 0 && <div style={{ fontSize: 12, color: '#6D28D9', marginTop: 8 }}>Upload photos below first.</div>}
      {err && <div style={{ fontSize: 13, color: '#B91C1C', fontWeight: 600, marginTop: 10 }}>{err}</div>}
      {stale && <div style={{ fontSize: 12, color: '#92400E', marginTop: 10 }}>You changed the photos since the check. Tap Check again.</div>}

      {result && !stale && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {result.photos.map((p, i) => {
            if (!p.face_visible && !p.identifying_text) return null
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', borderRadius: 10, padding: 10, flexWrap: 'wrap' }}>
                <img src={photos[i]?.url} alt="" style={{ width: 56, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                <div style={{ flex: 1, minWidth: 160, fontSize: 13, color: '#0F1923' }}>
                  Photo {i + 1}: {[p.face_visible && 'a face is visible', p.identifying_text && 'a patient name or ID may be printed on it'].filter(Boolean).join(', and ')}.
                </div>
                {p.face_visible && (used[`face${i}`]
                  ? <span style={usedBtn}>Face blurred ✓</span>
                  : <button type="button" style={btn} onClick={() => blur(i)}>Blur face</button>)}
                {p.identifying_text && p.text_box && (used[`text${i}`]
                  ? <span style={usedBtn}>Name covered ✓</span>
                  : <button type="button" style={btn} disabled={fixing === i} onClick={() => cover(i, p.text_box!)}>{fixing === i ? 'Covering…' : 'Cover name'}</button>)}
                {p.identifying_text && !p.text_box && <span style={{ fontSize: 12, color: '#92400E' }}>Crop it out and upload again.</span>}
              </div>
            )
          })}
          {result.photos.every(p => !p.face_visible && !p.identifying_text) && (
            <div style={{ fontSize: 13, color: '#047857', fontWeight: 700 }}>No faces or patient names found in the photos. Please still check them yourself.</div>
          )}
          {result.photos.some((p, i) => p.looks_like === 'xray' && photos[i] && !photos[i].kind.startsWith('xray')) && (
            <div style={{ fontSize: 12, color: '#92400E' }}>Some X-rays are in a clinical photo section. Remove and re-add them under X-Ray / OPG if that is a mistake.</div>
          )}

          {[
            { key: 'title', label: 'Title', value: result.title, use: onUseTitle },
            { key: 'specialty', label: 'Specialty', value: result.specialty, show: getSpecialty(result.specialty)?.label, use: onUseSpecialty },
            { key: 'question', label: 'Question to other dentists', value: result.question, use: onUseQuestion },
            { key: 'summary', label: 'Summary', value: result.summary, use: onUseSummary },
          ].filter(s => s.value).map(s => (
            <div key={s.key} style={{ background: '#fff', borderRadius: 10, padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                <div style={{ fontSize: 14, color: '#0F1923', lineHeight: 1.5 }}>{s.show || s.value}</div>
              </div>
              {used[s.key]
                ? <span style={usedBtn}>Used ✓</span>
                : <button type="button" style={btn} onClick={() => { s.use(s.value); setUsed(u => ({ ...u, [s.key]: true })) }}>Use</button>}
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#5B21B6' }}>AI can miss things. Look at every photo before you tick patient consent.</div>
        </div>
      )}
    </section>
  )
}
