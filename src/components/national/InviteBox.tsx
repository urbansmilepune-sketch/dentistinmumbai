'use client'

// "Invite a colleague" box on the dentist's own profile (only they see it).
// The WhatsApp button opens their own WhatsApp with a ready message and
// their personal link; nothing is sent by DentistIn, so no Meta template
// is needed. Each tap is logged as invite_share for the "invites sent" count.

import { useState } from 'react'
import { NATIONAL_ORIGIN } from '@/config/cities'

interface Props {
  dentistId: string
  code: string
  sent: number
  joined: number
  recent: Array<{ name: string; slug: string; when: string }>
}

export default function InviteBox({ dentistId, code, sent, joined, recent }: Props) {
  const [copied, setCopied] = useState(false)
  const [sentNow, setSentNow] = useState(sent)
  const link = `${NATIONAL_ORIGIN}/invite/${code}`
  const message = `Hi, I'm sharing my cases and getting second opinions from dentists across India on DentistIn. It's free, and you get your own profile patients can find. Join with my link:\n${link}`

  function track() {
    setSentNow(n => n + 1)
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'invite_share' }),
    }).catch(() => {})
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      track()
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  return (
    <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, margin: 0, color: '#0F1923' }}>Invite a colleague</h2>
      <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.5, margin: 0 }}>
        More dentists means faster answers on your cases. Send your personal link to a friend, batchmate or study group.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div style={{ background: '#EFF6FF', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E3A8A' }}>{sentNow}</div>
          <div style={{ fontSize: 12, color: '#334155' }}>invites sent</div>
        </div>
        <div style={{ background: '#ECFDF5', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#065F46' }}>{joined}</div>
          <div style={{ fontSize: 12, color: '#334155' }}>joined</div>
        </div>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={track}
        style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: '#15803D', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
      >
        Invite on WhatsApp
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px dashed #CBD5E1', borderRadius: 10, padding: '8px 10px 8px 12px' }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.replace(/^https:\/\//, '')}</div>
        <button type="button" onClick={copy} style={{ minHeight: 36, padding: '0 12px', border: '1px solid #E2E8F0', background: copied ? '#DCFCE7' : '#fff', color: copied ? '#166534' : '#0F1923', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Joined with your link</div>
          {recent.map(r => (
            <a key={r.slug} href={`/professional/${r.slug}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, color: '#0F1923', textDecoration: 'none' }}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span style={{ fontSize: 12, color: '#475569' }}>{r.when}</span>
            </a>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#475569' }}>Only you see these numbers.</div>
    </section>
  )
}
