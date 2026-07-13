'use client'

import { useState } from 'react'
import Link from 'next/link'

const NAVY = '#0F172A'
const TEAL = '#14B8A6'

interface Props {
  /** Dentist's city display name, e.g. "Mumbai" — fills the [City] slots. */
  cityName: string
  /** Public profile URL, e.g. https://host/dentist/<slug> (no trailing slash). */
  profileUrl: string
  /** Route to the full badge tool. */
  badgeHref?: string
}

/**
 * "Grow Your Practice" — dashboard marketing hub. A dual-visibility highlight
 * banner sits above two traffic-driving tools (verification badge, Google
 * Business Profile link). Copy emphasises that every listing is live on both
 * DentistIn <City> and DentistIn India.
 */
export default function GrowPracticeSection({ cityName, profileUrl, badgeHref = '/for-dentists/dashboard/badge' }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the field is selectable as a fallback */ }
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
    padding: '20px 22px', display: 'flex', flexDirection: 'column',
  }
  const toolTitle: React.CSSProperties = {
    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: 'var(--text)', marginBottom: 6,
  }
  const toolSub: React.CSSProperties = {
    fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16, flex: 1,
  }

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEAL, marginBottom: 4 }}>
          Marketing
        </div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>
          Grow Your Practice
        </h2>
      </div>

      {/* Dual-visibility highlight banner — teal/navy gradient, above both tools. */}
      <div style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #115E59 55%, ${TEAL} 100%)`,
        color: '#fff', borderRadius: 16, padding: '18px 22px', marginBottom: 16,
        boxShadow: '0 6px 20px rgba(15,23,42,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>🌐</span>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(16px, 2.4vw, 19px)', lineHeight: 1.2 }}>
            Your clinic is listed on TWO platforms
          </h3>
        </div>
        <div style={{ display: 'grid', gap: 4, fontSize: 14, lineHeight: 1.5 }}>
          <div><strong>DentistIn {cityName}</strong> — local patients find you</div>
          <div><strong>DentistIn India</strong> — patients across India find you</div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.88, marginTop: 8 }}>
          Use the tools below to drive more traffic to both.
        </div>
      </div>

      {/* Two tools, side by side (stack on mobile). */}
      <div className="grow-tools-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Tool 1 — Verification badge */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 26 }}>🏅</span>
            <div style={toolTitle}>Verification Badge</div>
          </div>
          <p style={toolSub}>
            Patients trust clinics that display their DentistIn verification. Your profile appears on
            both DentistIn {cityName} and DentistIn India — this badge links patients directly to your
            verified listing.
          </p>
          <Link href={badgeHref} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
            padding: '10px 18px', minHeight: 44, background: TEAL, color: '#fff', border: 'none',
            borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none',
          }}>
            Get your badge →
          </Link>
        </div>

        {/* Tool 2 — Google Business Profile link */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 26 }}>🗺️</span>
            <div style={toolTitle}>Add your link to Google Maps</div>
          </div>
          <p style={toolSub}>
            Patients searching on Google Maps can book directly from your listing. Your profile is live
            on DentistIn {cityName} and DentistIn India — one link covers both.
          </p>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, flexWrap: 'wrap',
          }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profileUrl}
            </span>
            <button
              type="button"
              onClick={copy}
              style={{
                padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                background: '#fff', color: NAVY, border: '1px solid var(--border)', borderRadius: 8,
              }}
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
          <a
            href="https://business.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
              padding: '10px 18px', minHeight: 44, background: '#fff', color: NAVY,
              border: '1px solid var(--border)', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}
          >
            Open Google Business Profile →
          </a>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .grow-tools-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
      `}</style>
    </section>
  )
}
