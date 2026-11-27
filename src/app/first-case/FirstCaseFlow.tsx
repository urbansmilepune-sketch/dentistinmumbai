'use client'

// Quick 3-step case for new dentists (approved 27 Nov 2026,
// /mnt/project-files/first-case/mockup.html):
//   1. Photos first: 1 to 4 photos, labelled Before / After / X-ray.
//   2. One line: "What did you do?" plus an optional question for colleagues.
//   3. Check and post: the AI case helper fills title, specialty, diagnosis
//      and plan (still required, the dentist fixes what is wrong), blurs
//      faces and covers names printed on X-rays. Consent is never ticked
//      for them.
// Then a "posted" screen: who sees it first, and a WhatsApp invite.
// Posts through the same /api/cases as the full form.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'
import { blurFacesUrl, coverBox, type Result as AiResult } from '@/app/cases/new/AiHelper'
import { takeHandedOffPhotos } from '@/lib/firstCaseHandoff'

type Kind = 'before' | 'after' | 'xray_before' | 'xray_after'
interface Photo { id: number; url: string | null; preview: string; kind: Kind; userKind: boolean; err: string }

const KINDS: Kind[] = ['before', 'after', 'xray_before', 'xray_after']
const KIND_LABEL: Record<Kind, string> = { before: 'Before', after: 'After', xray_before: 'X-ray before', xray_after: 'X-ray after' }
const MAX = 4

interface Props {
  first: boolean
  cityName: string | null
  inviteLink: string | null
  whatsappAlerts: boolean
}

const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, padding: '0 18px', borderRadius: 12, border: 'none', background: '#1D4ED8', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none', width: '100%' }
const ghost: React.CSSProperties = { ...btn, background: '#fff', color: '#0F1923', border: '1px solid #CBD5E1' }
const label: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#0F1923', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', minHeight: 46, padding: '10px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15, fontFamily: 'var(--font-body)', boxSizing: 'border-box', background: '#fff', color: '#0F1923' }
const aiTag = <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#F3E8FF', color: '#6B21A8' }}>AI draft</span>

let nextId = 1

export default function FirstCaseFlow({ first, cityName, inviteLink, whatsappAlerts }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [line, setLine] = useState('')
  const [ask, setAsk] = useState(false)
  const [question, setQuestion] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const [aiKeys, setAiKeys] = useState<Record<string, boolean>>({})
  const [title, setTitle] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [plan, setPlan] = useState('')
  const [summary, setSummary] = useState('')
  const [extra, setExtra] = useState<{ complexity: number | null; chief: string; age: number | null; gender: string }>({ complexity: null, chief: '', age: null, gender: '' })
  const [consent, setConsent] = useState(false)
  const [err, setErr] = useState('')
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState<{ id: string; status: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const draftedFor = useRef('')

  const uploading = photos.some(p => !p.url && !p.err)
  const ready = photos.filter(p => p.url)

  // Photos dropped on the home card arrive here.
  useEffect(() => {
    const files = takeHandedOffPhotos()
    if (files.length) addFiles(files)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function guessKind(index: number): Kind {
    return index === 1 ? 'after' : 'before'
  }

  async function upload(photo: Photo, file: File) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', photo.kind)
      const res = await fetch('/api/cases/upload-photo', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed')
      setPhotos(ps => ps.map(p => (p.id === photo.id ? { ...p, url: data.url } : p)))
    } catch (e) {
      setPhotos(ps => ps.map(p => (p.id === photo.id ? { ...p, err: e instanceof Error ? e.message : 'Upload failed' } : p)))
    }
  }

  function addFiles(list: FileList | File[]) {
    setErr('')
    const files = Array.from(list).filter(f => f.type.startsWith('image/'))
    const room = MAX - photos.length
    if (room <= 0) { setErr(`Up to ${MAX} photos. Remove one first.`); return }
    const added: Photo[] = files.slice(0, room).map((f, i) => ({
      id: nextId++, url: null, preview: URL.createObjectURL(f), kind: guessKind(photos.length + i), userKind: false, err: '',
    }))
    if (files.length > room) setErr(`Only the first ${room} photo${room === 1 ? '' : 's'} were added. Up to ${MAX} in total.`)
    setPhotos(ps => [...ps, ...added])
    added.forEach((p, i) => { void upload(p, files[i]) })
  }

  function cycleKind(id: number) {
    setPhotos(ps => ps.map(p => (p.id === id ? { ...p, kind: KINDS[(KINDS.indexOf(p.kind) + 1) % KINDS.length], userKind: true } : p)))
  }

  function remove(id: number) {
    setPhotos(ps => ps.filter(p => p.id !== id))
  }

  // Step 2 → 3: one AI call fills the write-up and checks the photos.
  async function draft() {
    setErr('')
    if (line.trim().length < 4) { setErr('Write one line about what you did.'); return }
    const key = JSON.stringify([ready.map(p => p.url), line, ask ? question : ''])
    if (draftedFor.current === key) { setStep(3); return }
    setDrafting(true); setAiNote('')
    const notes = [line.trim(), ask && question.trim() ? `Question for colleagues: ${question.trim()}` : ''].filter(Boolean).join('\n')
    let result: AiResult | null = null
    try {
      const res = await fetch('/api/cases/ai-assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: ready.map(p => ({ url: p.url, kind: p.kind })), notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || 'The AI helper could not run')
      result = data.result as AiResult
    } catch (e) {
      setAiNote(`We could not fill this in automatically (${e instanceof Error ? e.message : 'error'}). Please fill it in yourself, and check that no face or name shows in the photos.`)
    }

    if (result) {
      const r = result
      // Labels, face blur and name cover, photo by photo.
      const updated = await Promise.all(ready.map(async (p, i) => {
        const check = r.photos?.[i]
        if (!check) return p
        let kind = p.kind
        if (!p.userKind) {
          if (check.looks_like === 'xray' && !kind.startsWith('xray')) kind = kind === 'after' ? 'xray_after' : 'xray_before'
          if (check.looks_like === 'photo' && kind.startsWith('xray')) kind = kind === 'xray_after' ? 'after' : 'before'
        }
        let url = p.url as string
        if (check.face_visible) url = blurFacesUrl(url)
        if (check.identifying_text && check.text_box) {
          try {
            const blob = await coverBox(url, check.text_box)
            const fd = new FormData()
            fd.append('file', new File([blob], 'covered.jpg', { type: 'image/jpeg' }))
            fd.append('kind', kind)
            const res = await fetch('/api/cases/upload-photo', { method: 'POST', body: fd })
            const data = await res.json().catch(() => ({}))
            if (res.ok && data?.url) url = data.url
            else throw new Error('upload')
          } catch {
            setAiNote('A photo seems to show a patient name we could not cover. Please crop it out, or remove that photo, before posting.')
          }
        }
        return { ...p, kind, url }
      }))
      setPhotos(ps => ps.map(p => updated.find(u => u.id === p.id) || p))

      const keys: Record<string, boolean> = {}
      const fill = (k: string, v: string | undefined, set: (v: string) => void) => { if (v) { set(v); keys[k] = true } }
      fill('title', r.title, setTitle)
      fill('specialty', r.specialty, setSpecialty)
      fill('diagnosis', r.diagnosis, setDiagnosis)
      fill('plan', r.treatment_plan, setPlan)
      setSummary(r.summary || '')
      if (ask && !question.trim() && r.question) { setQuestion(r.question); keys.question = true }
      setExtra({ complexity: r.complexity ?? null, chief: r.chief_complaint || '', age: r.patient_age ?? null, gender: r.patient_gender || '' })
      setAiKeys(keys)
      draftedFor.current = key
    }
    setDrafting(false)
    setStep(3)
  }

  async function post() {
    setErr('')
    if (!title.trim()) return setErr('Add a case title.')
    if (!specialty) return setErr('Pick a specialty.')
    if (!diagnosis.trim()) return setErr('Add a diagnosis.')
    if (!plan.trim()) return setErr('Add the treatment plan.')
    if (!ready.length) return setErr('Add at least one photo.')
    if (!consent) return setErr('Tick the patient consent box before posting.')
    setPosting(true)
    try {
      const res = await fetch('/api/cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), specialty, complexity: extra.complexity ?? 1,
          question: ask && question.trim() ? question.trim() : null,
          patient_consent: true,
          description: summary.trim() || line.trim(),
          clinical_notes: line.trim(),
          is_private_notes: false,
          discussion_enabled: true,
          materials: [],
          chief_complaint: extra.chief || null,
          patient_age: extra.age, patient_gender: extra.gender || null,
          diagnosis: diagnosis.trim(),
          treatment_plan_detail: plan.trim(),
          photos: ready.map((p, i) => ({ url: p.url, kind: p.kind, caption: null, display_order: i })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setErr(data?.error || 'Could not post right now. Please try again.'); setPosting(false); return }
      setPosted({ id: data.case_id, status: data.status })
      setStep(4)
      window.scrollTo({ top: 0 })
    } catch {
      setErr('Network error. Please try again.')
    }
    setPosting(false)
  }

  const heading = first ? 'Your first case' : 'Post a case'
  const progress = (
    <div style={{ display: 'flex', gap: 6 }} aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map(n => <span key={n} style={{ flex: 1, height: 5, borderRadius: 99, background: n <= step ? '#1D4ED8' : '#E2E8F0' }} />)}
    </div>
  )
  const top = (back: (() => void) | null) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {back
        ? <button type="button" onClick={back} style={{ border: 'none', background: 'none', fontSize: 15, fontWeight: 700, color: '#1D4ED8', cursor: 'pointer', padding: '8px 0', fontFamily: 'var(--font-body)' }}>‹ Back</button>
        : <Link href="/" style={{ fontSize: 15, fontWeight: 700, color: '#475569', textDecoration: 'none', padding: '8px 0' }}>✕ Close</Link>}
      <h1 style={{ flex: 1, margin: 0, textAlign: 'center', fontFamily: 'var(--font-heading)', fontSize: 18, color: '#0F1923' }}>{heading}</h1>
      <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>{Math.min(step, 3)}/3</span>
    </div>
  )
  const errBox = err && <div role="alert" style={{ color: '#B91C1C', fontSize: 14, fontWeight: 600 }}>{err}</div>

  // ── Step 4: posted ──────────────────────────────────────────────────
  if (step === 4 && posted) {
    const spec = getSpecialty(specialty)
    const live = posted.status === 'approved'
    const share = inviteLink
      ? `https://wa.me/?text=${encodeURIComponent(`I just posted ${first ? 'my first case' : 'a case'} on DentistIn India: "${title.trim()}". Would love your view on it. Join free here: ${inviteLink}`)}`
      : null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, color: '#0F766E' }}>{first ? 'Your first case is live' : 'Your case is live'}</h1>
          <p style={{ margin: 0, fontSize: 14.5, color: '#115E59', lineHeight: 1.55 }}>
            {live
              ? 'Dentists can see it now, and it shows on your public profile.'
              : 'Dentists can see it now. It shows on your public profile and on Google once our team checks it, usually the same day.'}
          </p>
        </section>
        <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Who sees it first</div>
          {cityName && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#334155' }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#ECFDF5', color: '#0F766E' }}>{cityName}</span>
              {first ? 'Dentists in your city, top of their feed for 2 days' : 'Dentists in your city'}
            </div>
          )}
          {spec && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#334155' }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: spec.bg, color: spec.color }}>{spec.label}</span>
              Dentists who post {spec.label.toLowerCase()} cases
            </div>
          )}
          <div style={{ fontSize: 13.5, color: '#64748B' }}>
            {whatsappAlerts && first ? 'We will send you a WhatsApp when the first reply comes in.' : 'Replies show in your alerts (the bell at the top).'}
          </div>
        </section>
        {share && (
          <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Know a colleague who would reply?</div>
            <div style={{ fontSize: 13.5, color: '#64748B' }}>Send them your case. They join free from the link.</div>
            <a href={share} target="_blank" rel="noopener" style={{ ...btn, background: '#25D366' }}>Send to a colleague on WhatsApp</a>
          </section>
        )}
        <Link href={`/cases/${posted.id}`} style={ghost}>See my case</Link>
        <Link href="/" style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none', padding: 8 }}>Back to home</Link>
      </div>
    )
  }

  // ── Step 1: photos ──────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {top(null)}
        {progress}
        <div style={{ fontWeight: 800, fontSize: 17 }}>Add 1 to 4 photos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {photos.map(p => (
            <div key={p.id} style={{ position: 'relative', aspectRatio: '1 / 1', maxWidth: '100%', borderRadius: 12, overflow: 'hidden', background: '#1E293B' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: p.url ? 1 : 0.55 }} />
              {!p.url && !p.err && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>Uploading…</span>}
              {p.err && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, textAlign: 'center', background: 'rgba(127,29,29,.8)', color: '#fff', fontWeight: 700, fontSize: 12.5 }}>{p.err}</span>}
              <button type="button" onClick={() => cycleKind(p.id)} aria-label={`Label: ${KIND_LABEL[p.kind]}. Tap to change.`}
                style={{ position: 'absolute', left: 8, bottom: 8, minHeight: 32, padding: '0 10px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.95)', color: '#0F1923', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {KIND_LABEL[p.kind]} ▾
              </button>
              <button type="button" onClick={() => remove(p.id)} aria-label="Remove photo"
                style={{ position: 'absolute', right: 8, top: 8, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(15,25,35,.7)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
            </div>
          ))}
          {photos.length < MAX && (
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ aspectRatio: '1 / 1', maxWidth: '100%', borderRadius: 12, border: '1.5px dashed #94A3B8', background: '#fff', color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>{photos.length ? 'Add photo' : 'Choose photos'}
            </button>
          )}
        </div>
        <input ref={fileRef} id="first-case-photos" type="file" accept="image/*" multiple hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748B', lineHeight: 1.55 }}>
          Tap a label to change it. On the last step, faces get blurred and names printed on X-rays get covered before anyone sees them.
        </p>
        {errBox}
        <button type="button" style={{ ...btn, opacity: ready.length && !uploading ? 1 : 0.5 }} disabled={!ready.length || uploading}
          onClick={() => { setErr(''); setStep(2) }}>
          {uploading ? 'Uploading…' : 'Next'}
        </button>
      </div>
    )
  }

  // ── Step 2: one line ────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {top(() => setStep(1))}
        {progress}
        <label htmlFor="first-case-line" style={{ fontWeight: 800, fontSize: 17 }}>What did you do? One line is enough.</label>
        <textarea id="first-case-line" value={line} onChange={e => setLine(e.target.value)} maxLength={600} rows={3}
          placeholder="e.g. Broken 46 after old filling, RCT and zirconia crown, 2 visits"
          style={{ ...input, minHeight: 92, resize: 'vertical' }} />
        <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>Short forms are fine. You can also use the mic on your keyboard.</p>
        <label htmlFor="first-case-ask" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 14.5 }}>
          <input id="first-case-ask" type="checkbox" checked={ask} onChange={e => setAsk(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span>Ask colleagues something about this case</span>
        </label>
        {ask ? (
          <input id="first-case-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={300}
            placeholder="e.g. Would you have saved this tooth?" aria-label="Your question for colleagues" style={input} />
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>Cases with a question get more replies.</p>
        )}
        {errBox}
        <button type="button" style={{ ...btn, opacity: drafting ? 0.7 : 1, cursor: drafting ? 'wait' : 'pointer' }} disabled={drafting} onClick={draft}>
          {drafting ? 'Filling in the details…' : 'Next'}
        </button>
        {drafting && <p style={{ margin: 0, fontSize: 13, color: '#64748B', textAlign: 'center' }}>Checking your photos and writing the details. About 10 seconds.</p>}
      </div>
    )
  }

  // ── Step 3: check and post ──────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {top(() => setStep(2))}
      {progress}
      {aiNote && <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 12, padding: '10px 12px', fontSize: 13.5, fontWeight: 600 }}>{aiNote}</div>}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {ready.map(p => (
          <div key={p.id} style={{ position: 'relative', width: 72, height: 72, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: '#1E293B' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url as string} alt={KIND_LABEL[p.kind]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,255,255,.95)', color: '#0F1923' }}>{KIND_LABEL[p.kind]}</span>
          </div>
        ))}
      </div>
      <div>
        <label htmlFor="fc-title" style={label}>Title {aiKeys.title && aiTag}</label>
        <input id="fc-title" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="e.g. Saving a broken lower molar: RCT and crown" style={input} />
      </div>
      <div>
        <label htmlFor="fc-specialty" style={label}>Specialty {aiKeys.specialty && aiTag}</label>
        <select id="fc-specialty" value={specialty} onChange={e => setSpecialty(e.target.value)} style={input}>
          <option value="">Pick one</option>
          {SPECIALTIES.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="fc-diagnosis" style={label}>Diagnosis {aiKeys.diagnosis && aiTag}</label>
        <textarea id="fc-diagnosis" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={2} placeholder="e.g. Fractured 46 with irreversible pulpitis" style={{ ...input, resize: 'vertical' }} />
      </div>
      <div>
        <label htmlFor="fc-plan" style={label}>Treatment plan {aiKeys.plan && aiTag}</label>
        <textarea id="fc-plan" value={plan} onChange={e => setPlan(e.target.value)} rows={2} placeholder="e.g. RCT in 2 visits, zirconia crown" style={{ ...input, resize: 'vertical' }} />
      </div>
      {ask && (
        <div>
          <label htmlFor="fc-question" style={label}>Your question {aiKeys.question && aiTag}</label>
          <input id="fc-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={300} style={input} />
        </div>
      )}
      <label htmlFor="fc-consent" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 14, lineHeight: 1.5, cursor: 'pointer' }}>
        <input id="fc-consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
        <span>The patient agreed to share these photos. No face, name or phone number shows.</span>
      </label>
      {errBox}
      <button type="button" style={{ ...btn, opacity: posting ? 0.7 : 1, cursor: posting ? 'wait' : 'pointer' }} disabled={posting} onClick={post}>
        {posting ? 'Posting…' : first ? 'Post my first case' : 'Post my case'}
      </button>
      <Link href="/cases/new" style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>Add more detail on the full form instead</Link>
    </div>
  )
}
