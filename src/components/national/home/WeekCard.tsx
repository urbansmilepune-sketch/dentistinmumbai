'use client'

// "Your week on DentistIn" card at the top of the dentist home feed
// (approved 27 Nov 2026, weekly-activity/mockup.html).
//
// Good week: dark card with the four numbers, who viewed the best case,
// and Invite a colleague (opens a sheet with a message that starts with
// their own best number; it goes from their own WhatsApp).
// Quiet week: light card nudging them to post a case or follow people.
// New dentist (first 7 days): welcome version with the same nudges.
// Closing it hides it until next Monday.

import { useState } from 'react'
import Link from 'next/link'
import type { WeekData } from '@/lib/weeklyActivity'
import Avatar from './Avatar'

interface Props {
  week: WeekData
  dentistId: string
  /** Full invite link, or null when invite codes are not set up yet. */
  inviteLink: string | null
  inviteMessage: string
  joined: number
  /** On /week itself: no close button and no "see everyone" link. */
  onWeekPage?: boolean
}

const POST_BY_WHATSAPP = 'https://wa.me/917719013232?text=' + encodeURIComponent('Hi, I want to post a case')

function delta(now: number, prev: number): { text: string; up: boolean } {
  if (now === prev) return { text: prev === 0 ? '–' : 'same', up: false }
  const d = now - prev
  return { text: d > 0 ? `+${d}` : String(d), up: d > 0 }
}

export default function WeekCard({ week, dentistId, inviteLink, inviteMessage, joined, onWeekPage }: Props) {
  const [hidden, setHidden] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [msg, setMsg] = useState(inviteMessage)
  const [copied, setCopied] = useState(false)
  if (hidden) return null

  const good = week.good && !week.isNew
  const dark = good
  const ink = dark ? '#fff' : '#0F1923'
  const soft = dark ? '#B9C8E3' : '#64748B'

  function close() {
    setHidden(true)
    fetch('/api/week-card/hide', { method: 'POST' }).catch(() => {})
  }
  function track() {
    fetch('/api/analytics/track', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'invite_share' }),
    }).catch(() => {})
  }
  async function copy() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true); track()
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  const tiles: Array<{ n: number; p: number; l: string }> = [
    { n: week.now.views, p: week.prev.views, l: 'Case views' },
    { n: week.now.followers, p: week.prev.followers, l: 'New followers' },
    { n: week.now.likes, p: week.prev.likes, l: 'Likes' },
    { n: week.now.replies, p: week.prev.replies, l: 'Replies' },
  ]
  const subtitle = week.isNew ? 'Welcome to DentistIn India'
    : good ? (week.total > week.prevTotal ? 'better than last week' : 'a good week')
    : 'a quiet week'

  const tc = week.topCase
  const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }

  return (
    <section aria-label="Your week on DentistIn" style={{
      borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, color: ink,
      background: dark ? 'linear-gradient(165deg, #0B1B33 0%, #13325E 100%)' : '#fff',
      border: dark ? 'none' : '1px solid #E2E8F0',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: ink }}>Your week on DentistIn</h2>
          <div style={{ fontSize: 12.5, color: soft }}>{week.label} · {subtitle}</div>
        </div>
        {!onWeekPage && <button type="button" onClick={close} aria-label="Hide until next week"
          style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: soft, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        {tiles.map(t => {
          const d = delta(t.n, t.p)
          return (
            <div key={t.l} style={{ background: dark ? 'rgba(255,255,255,0.09)' : '#F8FAFC', border: dark ? 'none' : '1px solid #E2E8F0', borderRadius: 10, padding: '8px 4px', textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{t.n}</div>
              <div style={{ fontSize: 11, color: soft, lineHeight: 1.25 }}>{t.l}</div>
              {!week.isNew && <div style={{ fontSize: 10.5, fontWeight: d.up ? 700 : 600, color: d.up ? (dark ? '#6EE7B7' : '#047857') : soft }}>{d.text}</div>}
            </div>
          )
        })}
      </div>

      {good && tc && tc.viewers > 0 && (
        <Link href="/week?tab=viewed" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '9px 10px', fontSize: 13, color: '#E2E8F0', textDecoration: 'none' }}>
          {week.viewers.length > 0 && (
            <span style={{ display: 'flex', flex: 'none' }}>
              {week.viewers.slice(0, 3).map((v, i) => (
                <span key={v.id} style={{ marginLeft: i ? -8 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px #13325E', display: 'inline-flex' }}><Avatar name={v.name} photo={v.photo} size={26} /></span>
              ))}
            </span>
          )}
          <span style={{ minWidth: 0 }}>
            <b style={{ color: '#fff' }}>{tc.names.length ? (tc.viewers > 1 ? `${tc.names[0]} and ${tc.viewers - 1} other${tc.viewers === 2 ? '' : 's'}` : tc.names[0]) : `${tc.viewers} dentist${tc.viewers === 1 ? '' : 's'}`}</b>
            {' '}viewed your case <b style={{ color: '#fff' }}>&ldquo;{tc.title}&rdquo;</b>
          </span>
        </Link>
      )}

      {good ? (
        <div style={{ background: '#fff', color: '#0F1923', borderRadius: 11, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Great week. Know a dentist who should see this?</div>
          {inviteLink && (
            <button type="button" onClick={() => setSheet(true)} style={{ ...btn, background: '#15803D', color: '#fff' }}>Invite a colleague</button>
          )}
          {joined > 0 && <div style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>{joined} colleague{joined === 1 ? '' : 's'} joined from your link</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {week.isNew ? "Here's how to get noticed: dentists who post cases get the most views and followers." : 'Dentists who post cases get the most views and followers. Post one this week?'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Link href="/cases/new" style={{ ...btn, background: '#1D4ED8', color: '#fff' }}>Post a case</Link>
            <a href={POST_BY_WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: '#fff', color: '#0F1923', border: '1px solid #CBD5E1' }}>Post by WhatsApp</a>
          </div>
          <Link href="/experts" style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', textAlign: 'center', textDecoration: 'none' }}>Or follow 3 dentists in your city →</Link>
        </div>
      )}

      {!onWeekPage && !week.isNew && week.total > 0 && (
        <Link href="/week" style={{ fontSize: 13, fontWeight: 600, color: dark ? '#B9C8E3' : '#1D4ED8', textAlign: 'center', textDecoration: 'none' }}>
          See everyone who viewed and followed →
        </Link>
      )}

      {sheet && inviteLink && (
        <div role="dialog" aria-modal="true" aria-label="Invite a colleague"
          onClick={e => { if (e.target === e.currentTarget) setSheet(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(11,27,51,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', color: '#0F1923', borderRadius: '20px 20px 0 0', padding: '12px 16px calc(18px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ flex: 1, margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Invite a colleague</h3>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close" style={{ width: 36, height: 36, border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#64748B' }}>✕</button>
            </div>
            <label htmlFor="week-invite-msg" style={{ fontSize: 12.5, color: '#64748B' }}>You can edit the message. It goes from your own WhatsApp.</label>
            <textarea id="week-invite-msg" value={msg} onChange={e => setMsg(e.target.value)} rows={5}
              style={{ width: '100%', border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 10, padding: 10, fontSize: 14, lineHeight: 1.45, fontFamily: 'var(--font-body)', color: '#0F1923', resize: 'vertical' }} />
            <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" onClick={track}
              style={{ ...btn, background: '#15803D', color: '#fff', minHeight: 48 }}>Send on WhatsApp</a>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(inviteLink)}`} target="_blank" rel="noopener noreferrer" onClick={track}
                style={{ ...btn, background: '#fff', color: '#0A66C2', border: '1px solid #CBD5E1', fontSize: 13 }}>LinkedIn</a>
              <button type="button" onClick={copy} style={{ ...btn, background: copied ? '#DCFCE7' : '#fff', color: copied ? '#166534' : '#0F1923', border: '1px solid #CBD5E1', fontSize: 13 }}>{copied ? 'Copied' : 'Copy link'}</button>
              <a href={inviteLink.replace('/invite/', '/api/og/invite/') + '?format=story'} target="_blank" rel="noopener noreferrer" onClick={track}
                style={{ ...btn, background: '#fff', color: '#0F1923', border: '1px solid #CBD5E1', fontSize: 13 }}>Story card</a>
            </div>
            {joined > 0 && (
              <div style={{ background: '#ECFDF5', color: '#0F766E', borderRadius: 10, padding: '9px 12px', fontSize: 13 }}>
                <b>{joined} colleague{joined === 1 ? '' : 's'} joined</b> from your link so far
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
