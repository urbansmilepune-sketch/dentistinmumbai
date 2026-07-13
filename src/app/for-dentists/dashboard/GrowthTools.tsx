'use client'

// Client island for the dashboard "Grow Your Practice" section. Two self-serve
// tools — a copy-paste website verified badge and a Google Business Profile
// booking link — each with a copy button that flips to "✓ Copied!" for 2s.
// All content (badge HTML, profile URL, city name) is pre-computed server-side
// and passed in as props; this component only handles the clipboard + preview.

import { useState } from 'react'

const NAVY = '#0F172A'

// Prefer the async Clipboard API; fall back to a hidden-textarea execCommand
// for clinics on http / older browsers where navigator.clipboard is absent.
async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  } catch {
    /* clipboard unavailable — the code/URL is still visible to copy manually */
  }
}

export default function GrowthTools({
  badgeHtml,
  profileUrl,
  cityName,
}: {
  badgeHtml: string
  profileUrl: string
  cityName: string
}) {
  const [copiedBadge, setCopiedBadge] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  async function handleCopy(text: string, which: 'badge' | 'link') {
    await copyText(text)
    if (which === 'badge') {
      setCopiedBadge(true)
      setTimeout(() => setCopiedBadge(false), 2000)
    } else {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
  }
  const copyBtnStyle = (copied: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 700,
    background: copied ? '#00A878' : NAVY,
    color: '#fff',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>
        Grow Your Practice
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>
        Free self-serve tools to bring more patients to your DentistIn profile.
      </p>

      {/* auto-fit grid stacks to one column under ~320px without a media query */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* ── TOOL 1: Website verified badge ───────────────────────────── */}
        <div style={cardStyle}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>
            🏅 Add a Verified Badge to Your Website
          </h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 14 }}>
            Patients trust clinics that display their DentistIn verification. Paste this code anywhere on your website.
          </p>

          <pre
            style={{
              background: '#0F172A',
              color: '#E2E8F0',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 11.5,
              lineHeight: 1.5,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {badgeHtml}
          </pre>

          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => handleCopy(badgeHtml, 'badge')} style={copyBtnStyle(copiedBadge)}>
              {copiedBadge ? '✓ Copied!' : 'Copy Code'}
            </button>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', margin: '16px 0 8px' }}>
            Preview
          </div>
          {/* Live preview — renders the exact HTML the dentist will paste. */}
          <div dangerouslySetInnerHTML={{ __html: badgeHtml }} />
        </div>

        {/* ── TOOL 2: Google Business Profile booking link ─────────────── */}
        <div style={cardStyle}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>
            📍 Add Booking Link to Google Profile
          </h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 14 }}>
            Patients searching on Google Maps can book directly from your listing.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              readOnly
              value={profileUrl}
              onFocus={e => e.currentTarget.select()}
              style={{
                flex: 1,
                minWidth: 180,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                fontSize: 13,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'var(--text)',
                background: 'var(--bg)',
              }}
            />
            <button type="button" onClick={() => handleCopy(profileUrl, 'link')} style={copyBtnStyle(copiedLink)}>
              {copiedLink ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0' }}>
            {[
              { icon: '🔍', text: 'Open Google Business Profile (business.google.com)' },
              { icon: '✏️', text: 'Go to Edit Profile → Contact → Appointment links' },
              { icon: '📋', text: 'Paste the link above and Save' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text)' }}>
                <span style={{ flexShrink: 0 }} aria-hidden="true">{s.icon}</span>
                <span style={{ lineHeight: 1.5 }}><strong style={{ fontWeight: 700 }}>{i + 1}.</strong> {s.text}</span>
              </div>
            ))}
          </div>

          <a
            href="https://business.google.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              alignSelf: 'flex-start',
              padding: '10px 16px',
              borderRadius: 10,
              background: '#fff',
              color: NAVY,
              border: `1.5px solid ${NAVY}`,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open Google Business Profile →
          </a>
        </div>
      </div>
    </div>
  )
}
