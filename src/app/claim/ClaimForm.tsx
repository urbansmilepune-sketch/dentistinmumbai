'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  slug: string
  options: string[]
  initialSkills: string[]
  initialLine: string
  alreadyClaimed: boolean
  founding: boolean
}

export default function ClaimForm({ slug, options, initialSkills, initialLine, alreadyClaimed, founding }: Props) {
  const [skills, setSkills] = useState<string[]>(initialSkills.filter(s => options.includes(s)).slice(0, 3))
  const [line, setLine] = useState(initialLine)
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [err, setErr] = useState('')
  const profileUrl = `https://dentistinindia.in/professional/${slug}`

  function toggle(s: string) {
    setErr('')
    setSkills(prev => {
      if (prev.includes(s)) return prev.filter(x => x !== s)
      if (prev.length >= 3) { setErr('Pick up to 3. Tap one to remove it first.'); return prev }
      return [...prev, s]
    })
  }

  async function save() {
    setErr('')
    if (skills.length === 0) { setErr('Pick at least one thing you are best at.'); return }
    setState('saving')
    try {
      const res = await fetch('/api/professional/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ top_skills: skills, patient_line: line, ...(alreadyClaimed ? {} : { claim: true }) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setErr(data?.error || 'Could not save'); setState('idle'); return }
      setState('done')
    } catch { setErr('Network error, please try again.'); setState('idle') }
  }

  if (state === 'done') {
    const share = `https://wa.me/?text=${encodeURIComponent(`My profile on DentistIn India: ${profileUrl}`)}`
    return (
      <section style={{ background: '#0F1923', color: '#fff', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {founding && <span style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, background: '#FDE68A', color: '#78350F', fontSize: 12, fontWeight: 800 }}>Founding Dentist</span>}
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800 }}>Your profile is live across India</div>
        <div style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.5 }}>Best at: {skills.join(', ')}. Free forever.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/professional/${slug}`} style={{ flex: 1, minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: '#fff', color: '#0F1923', fontWeight: 700, textDecoration: 'none' }}>See my profile</Link>
          <a href={share} target="_blank" rel="noopener" style={{ flex: 1, minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid #475569', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Share on WhatsApp</a>
        </div>
        <Link href="/cases/new" style={{ minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: '#1D4ED8', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Post my first case</Link>
      </section>
    )
  }

  return (
    <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>What are you best at? Tap up to 3 ({skills.length}/3)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map(o => {
          const on = skills.includes(o)
          return (
            <button key={o} type="button" onClick={() => toggle(o)} aria-pressed={on}
              style={{ minHeight: 40, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font-body)', background: on ? '#1D4ED8' : '#fff', color: on ? '#fff' : '#0F1923', border: on ? '1px solid #1D4ED8' : '1px solid #CBD5E1' }}>
              {o}
            </button>
          )
        })}
      </div>
      <div>
        <label htmlFor="patient-line" style={{ display: 'block', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>One line patients will read</label>
        <input id="patient-line" value={line} maxLength={140} onChange={e => setLine(e.target.value)}
          placeholder="e.g. I help people get fixed teeth again, even with low bone."
          style={{ width: '100%', minHeight: 46, padding: '0 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15, fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{line.length}/140</div>
      </div>
      {err && <div style={{ color: '#B91C1C', fontSize: 14, fontWeight: 600 }}>{err}</div>}
      <button type="button" onClick={save} disabled={state === 'saving'}
        style={{ minHeight: 50, borderRadius: 12, border: 'none', background: state === 'saving' ? '#93C5FD' : '#1D4ED8', color: '#fff', fontSize: 16, fontWeight: 700, cursor: state === 'saving' ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {state === 'saving' ? 'Saving…' : alreadyClaimed ? 'Save changes' : 'Looks good, claim my profile'}
      </button>
      <Link href="/professional/me/edit" style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>Add a bio, courses, talks or publications</Link>
    </section>
  )
}
