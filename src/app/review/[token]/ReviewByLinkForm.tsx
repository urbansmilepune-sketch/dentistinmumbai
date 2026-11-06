'use client'

import { useState } from 'react'
import { NAVY, TEAL } from '@/app/dentist/[slug]/profileTheme'

interface Props {
  token: string
  patientFirstName: string
  drName: string
  goodTags: string[]
  badTags: string[]
  profileHref: string
}

const LABELS = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent']
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z'

export default function ReviewByLinkForm({ token, patientFirstName, drName, goodTags, badTags, profileHref }: Props) {
  const [rating, setRating] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const good = rating > 3
  const tags = rating > 0 && !good ? badTags : goodTags

  function pickStar(n: number) {
    // Switching between good and bad stars swaps the tag list, so clear picks.
    if ((n > 3) !== good) setPicked([])
    setRating(n)
    setError('')
  }

  function toggle(tag: string) {
    setPicked(p => p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag])
  }

  async function submit() {
    if (!rating || busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/reviews/verified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, tags: picked, text: text.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) setDone(true)
      else setError(data.error || 'Could not save your review. Please try again.')
    } catch {
      setError('No internet connection. Please try again.')
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 8px', display: 'grid', gap: 14, justifyItems: 'center' }}>
        <span style={{ width: 76, height: 76, borderRadius: '50%', background: '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800 }}>Thank you, {patientFirstName}</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#475569' }}>
          Your review will show on {drName}&apos;s profile after a quick check, usually within a day.
        </p>
        <a href={profileHref} style={{ marginTop: 6, minHeight: 46, padding: '0 20px', display: 'inline-flex', alignItems: 'center', borderRadius: 12, border: '1.5px solid #CBD5E1', background: '#fff', color: NAVY, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          See the profile
        </a>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20, paddingTop: 20, paddingBottom: 110 }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800 }}>How was your visit?</h1>
        <div role="radiogroup" aria-label="Your rating" style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
              onClick={() => pickStar(n)}
              style={{ width: 56, height: 56, border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="46" height="46" viewBox="0 0 24 24" aria-hidden="true">
                <path d={STAR_PATH} fill={n <= rating ? '#F59E0B' : '#FFFFFF'} stroke={n <= rating ? '#F59E0B' : '#94A3B8'} strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#475569', minHeight: 20 }}>{rating ? LABELS[rating] : 'Tap a star'}</span>
      </div>

      {rating > 0 && (
        <>
          <div style={{ display: 'grid', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {good ? 'What went well?' : 'What could be better?'} <span style={{ fontWeight: 400, color: '#64748B' }}>(tap any)</span>
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tags.map(t => {
                const on = picked.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(t)}
                    style={{
                      minHeight: 42, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      background: on ? NAVY : '#fff', color: on ? '#fff' : NAVY,
                      border: `1.5px solid ${on ? NAVY : '#CBD5E1'}`,
                    }}
                  >{t}</button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label htmlFor="rv-text" style={{ fontSize: 14, fontWeight: 700 }}>
              Anything to add? <span style={{ fontWeight: 400, color: '#64748B' }}>(optional)</span>
            </label>
            <textarea
              id="rv-text"
              rows={3}
              maxLength={1000}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={good ? 'e.g. Doctor explained everything and it did not hurt at all.' : 'What happened? The clinic will see this.'}
              style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1.5px solid #CBD5E1', borderRadius: 12, fontSize: 16, resize: 'none', background: '#fff', color: NAVY, fontFamily: 'var(--font-body)' }}
            />
            <span style={{ fontSize: 12, color: '#64748B' }}>Shown with your first name and last initial. Your phone number is never shown.</span>
          </div>
        </>
      )}

      {error && <div role="alert" style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: 10, fontSize: 14, color: '#991B1B' }}>{error}</div>}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '12px 18px 18px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <button
            type="button"
            onClick={submit}
            disabled={!rating || busy}
            style={{
              width: '100%', minHeight: 52, border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700,
              fontFamily: 'var(--font-body)',
              background: rating ? TEAL : '#E2E8F0', color: rating ? '#04211D' : '#64748B',
              cursor: rating && !busy ? 'pointer' : 'not-allowed', opacity: busy ? 0.7 : 1,
            }}
          >{busy ? 'Saving…' : 'Submit review'}</button>
        </div>
      </div>
    </div>
  )
}
