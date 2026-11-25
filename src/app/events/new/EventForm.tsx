'use client'

import { useState } from 'react'

interface Props {
  cities: Array<{ slug: string; name: string }>
  topics: Array<{ slug: string; label: string }>
  defaultEmail: string
  defaultCity: string
}

const KINDS = [
  { v: 'exhibition', l: 'Exhibition' },
  { v: 'course', l: 'Hands-on course' },
  { v: 'seminar', l: 'Seminar' },
  { v: 'study_club', l: 'Study club' },
  { v: 'conference', l: 'Conference' },
]

export default function EventForm({ cities, topics, defaultEmail, defaultCity }: Props) {
  const [f, setF] = useState({
    title: '', kind: 'seminar', topic: '', starts_on: '', ends_on: '', is_online: false, city: defaultCity,
    organiser: '', fee_text: '', link: '', description: '', gives_certificate: false, email: defaultEmail, website: '',
  })
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string | boolean) => setF(prev => ({ ...prev, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setState('saving')
    try {
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, ends_on: f.ends_on || null, topic: f.topic || null }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setErr(data?.error || 'Could not submit'); setState('idle'); return }
      setState('done')
    } catch { setErr('Network error, please try again.'); setState('idle') }
  }

  if (state === 'done') {
    return (
      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 14, padding: 20, color: '#065F46' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Thanks, we got it</div>
        <div style={{ fontSize: 14 }}>We&apos;ll check the details and it will appear on the events page once approved.</div>
        <a href="/events" style={{ display: 'inline-block', marginTop: 12, fontWeight: 700, color: '#065F46' }}>Back to events →</a>
      </div>
    )
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: '#0F1923', marginBottom: 6 }
  const input: React.CSSProperties = { width: '100%', minHeight: 46, padding: '0 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15, fontFamily: 'var(--font-body)', boxSizing: 'border-box', background: '#fff', color: '#0F1923' }
  const row: React.CSSProperties = { marginBottom: 14 }

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
      <div style={row}>
        <label style={label} htmlFor="ev-title">Event name</label>
        <input id="ev-title" required value={f.title} onChange={e => set('title', e.target.value)} style={input} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, ...row }}>
        <div>
          <label style={label} htmlFor="ev-kind">Type</label>
          <select id="ev-kind" value={f.kind} onChange={e => set('kind', e.target.value)} style={input}>
            {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="ev-topic">Topic</label>
          <select id="ev-topic" value={f.topic} onChange={e => set('topic', e.target.value)} style={input}>
            <option value="">General</option>
            {topics.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, ...row }}>
        <div>
          <label style={label} htmlFor="ev-start">Start date</label>
          <input id="ev-start" type="date" required value={f.starts_on} onChange={e => set('starts_on', e.target.value)} style={input} />
        </div>
        <div>
          <label style={label} htmlFor="ev-end">End date (optional)</label>
          <input id="ev-end" type="date" value={f.ends_on} onChange={e => set('ends_on', e.target.value)} style={input} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 14, minHeight: 32 }}>
        <input type="checkbox" checked={f.is_online} onChange={e => set('is_online', e.target.checked)} style={{ width: 20, height: 20 }} />
        It&apos;s online
      </label>
      {!f.is_online && (
        <div style={row}>
          <label style={label} htmlFor="ev-city">City</label>
          <select id="ev-city" value={f.city} onChange={e => set('city', e.target.value)} style={input}>
            <option value="">Select a city</option>
            {cities.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, ...row }}>
        <div>
          <label style={label} htmlFor="ev-org">Organiser</label>
          <input id="ev-org" value={f.organiser} onChange={e => set('organiser', e.target.value)} placeholder="e.g. IDA Pune branch" style={input} />
        </div>
        <div>
          <label style={label} htmlFor="ev-fee">Fee</label>
          <input id="ev-fee" value={f.fee_text} onChange={e => set('fee_text', e.target.value)} placeholder="e.g. Free, or ₹4,000" style={input} />
        </div>
      </div>
      <div style={row}>
        <label style={label} htmlFor="ev-link">Link for details or registration</label>
        <input id="ev-link" type="url" value={f.link} onChange={e => set('link', e.target.value)} placeholder="https://" style={input} />
      </div>
      <div style={row}>
        <label style={label} htmlFor="ev-desc">Short description</label>
        <textarea id="ev-desc" rows={3} maxLength={600} value={f.description} onChange={e => set('description', e.target.value)} style={{ ...input, padding: 12, minHeight: 90, resize: 'vertical' }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 14, minHeight: 32 }}>
        <input type="checkbox" checked={f.gives_certificate} onChange={e => set('gives_certificate', e.target.checked)} style={{ width: 20, height: 20 }} />
        Attendees get a certificate
      </label>
      <div style={row}>
        <label style={label} htmlFor="ev-email">Your email (not shown publicly)</label>
        <input id="ev-email" type="email" required value={f.email} onChange={e => set('email', e.target.value)} style={input} />
      </div>
      <div style={{ position: 'absolute', left: -9999 }} aria-hidden="true">
        <label htmlFor="ev-website">Website</label>
        <input id="ev-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} />
      </div>
      {err && <div style={{ color: '#B91C1C', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
      <button type="submit" disabled={state === 'saving'} style={{ width: '100%', minHeight: 50, borderRadius: 12, border: 'none', background: state === 'saving' ? '#93C5FD' : '#1D4ED8', color: '#fff', fontSize: 16, fontWeight: 700, cursor: state === 'saving' ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {state === 'saving' ? 'Sending…' : 'Submit for approval'}
      </button>
    </form>
  )
}
