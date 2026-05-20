'use client'

// Per-case share dropdown. Always shares the national URL
// (https://dentistinindia.in/cases/<id>) regardless of which surface the
// button is rendered on, so the OG preview resolves on the canonical host.
//
// Variants:
//   - default ("↗ Share" pill) — used on /cases/[id] in the social-actions row
//   - compact (icon button)    — used in card corners alongside SaveButton
//
// Share triggers fire-and-forget POST to /api/analytics/track with
// event_type='case_share' attributed to the case author's dentist_id. The
// sharer themselves isn't tracked — privacy + we just want amplification
// signal for the author.

import { useEffect, useRef, useState } from 'react'
import { NATIONAL_ORIGIN } from '@/config/cities'

interface Props {
  caseId: string
  caseTitle: string
  dentistName: string
  /** Case author's dentist_id — analytics attribution lands here. */
  dentistId?: string | null
  compact?: boolean
}

export default function ShareButton({ caseId, caseTitle, dentistName, dentistId, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const url = `${NATIONAL_ORIGIN}/cases/${caseId}`
  const whatsappText = `Check out this clinical case by Dr. ${dentistName} on DentistIn India 🦷\n${caseTitle}\n${url}`
  const twitterText  = `Interesting dental case by Dr. ${dentistName} on DentistIn India`

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`
  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  const twitterHref  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(url)}`

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function trackShare() {
    if (!dentistId) return
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'case_share' }),
    }).catch(() => {})
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      trackShare()
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can be blocked by permissions or non-secure contexts;
      // fall through silently — the share dropdown still has the other
      // channels.
    }
  }

  function onChannel(href: string) {
    trackShare()
    window.open(href, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v) }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Share this case"
        style={compact ? compactBtn : fullBtn}
      >
        {compact ? '↗' : '↗ Share'}
      </button>

      {open && (
        <div
          role="menu"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
            boxShadow: '0 6px 18px rgba(15,25,35,0.12)',
            minWidth: 200, padding: 4, overflow: 'hidden',
          }}
        >
          <Item onClick={onCopy} icon="📋" label={copied ? 'Copied!' : 'Copy link'} highlight={copied} />
          <Item onClick={() => onChannel(whatsappHref)} icon="💚" label="WhatsApp" />
          <Item onClick={() => onChannel(linkedinHref)} icon="💼" label="LinkedIn" />
          <Item onClick={() => onChannel(twitterHref)}  icon="🐦" label="Twitter / X" />
        </div>
      )}
    </div>
  )
}

function Item({ onClick, icon, label, highlight }: { onClick: () => void; icon: string; label: string; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left',
        padding: '9px 12px', borderRadius: 7,
        background: highlight ? '#DCFCE7' : 'transparent',
        color: highlight ? '#166534' : '#0F1923',
        border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

const fullBtn: React.CSSProperties = {
  padding: '8px 14px', minHeight: 36,
  background: '#fff', color: '#0F1923',
  border: '1px solid #E2E8F0', borderRadius: 8,
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: 'inherit',
}
const compactBtn: React.CSSProperties = {
  width: 32, height: 32, padding: 0,
  background: 'rgba(255,255,255,0.94)', color: '#0F1923',
  border: '1px solid #E2E8F0', borderRadius: 8,
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}
