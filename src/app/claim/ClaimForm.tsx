'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FIRST_CASE_IDEAS, POST_BY_WHATSAPP_URL } from '@/lib/firstCaseShared'

interface Props {
  slug: string
  options: string[]
  initialSkills: string[]
  initialLine: string
  alreadyClaimed: boolean
  founding: boolean
  /** Cases live or in review. 0 = the success screen asks for the first case. */
  caseCount: number
}

export default function ClaimForm({ slug, options, initialSkills, initialLine, alreadyClaimed, founding, caseCount }: Props) {
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
    const first = caseCount === 0
    const big: React.CSSProperties = { minHeight: 50, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, fontWeight: 800, fontSize: 15.5, textDecoration: 'none' }
    // Approved 27 Nov 2026 (first-case/mockup.html): posting a case is the
    // main next step; sharing the profile is a small link underneath.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 800 }}>Your profile is live across India</div>
            <div style={{ fontSize: 13, color: '#475569' }}>Best at: {skills.join(', ')}. Free forever.</div>
          </div>
          {founding && <span style={{ padding: '5px 12px', borderRadius: 999, background: '#FDE68A', color: '#78350F', fontSize: 12, fontWeight: 800 }}>Founding Dentist</span>}
        </section>
        <section style={{ background: 'linear-gradient(160deg, #0B1B33 0%, #13325E 100%)', color: '#fff', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 21, fontWeight: 800, lineHeight: 1.25 }}>{first ? 'Next: post one case. It takes 2 minutes.' : 'Next: post a case'}</div>
          <div style={{ fontSize: 14, color: '#B9C8E3', lineHeight: 1.5 }}>Dentists across India see it today. Your cases also show on your profile as proof of your work.</div>
          <Link href="/first-case" style={{ ...big, background: '#1D4ED8', color: '#fff' }}>Pick photos from my phone</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#B9C8E3' }}>
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.18)' }} />or<span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.18)' }} />
          </div>
          <a href={POST_BY_WHATSAPP_URL} target="_blank" rel="noopener" style={{ ...big, background: '#25D366', color: '#fff' }}>Send photos on WhatsApp</a>
          <div style={{ fontSize: 13, color: '#E2E8F0' }}>A simple case is fine:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FIRST_CASE_IDEAS.map(i => <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.1)', color: '#E2E8F0' }}>{i}</span>)}
          </div>
        </section>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', fontSize: 14, fontWeight: 700 }}>
          <a href={share} target="_blank" rel="noopener" style={{ color: '#1D4ED8', textDecoration: 'none', padding: '8px 0' }}>Share my profile</a>
          <Link href={`/professional/${slug}`} style={{ color: '#1D4ED8', textDecoration: 'none', padding: '8px 0' }}>See my profile</Link>
          <Link href="/" style={{ color: '#64748B', textDecoration: 'none', padding: '8px 0', fontWeight: 600 }}>Later</Link>
        </div>
      </div>
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
