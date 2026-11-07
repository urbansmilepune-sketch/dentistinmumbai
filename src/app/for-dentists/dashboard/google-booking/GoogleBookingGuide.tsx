'use client'

// "Add Book button on Google" guide: the dentist's booking link with a Copy
// button, three steps with small drawings of Google's edit screens, an
// "I've added it" tick, and a WhatsApp button to send the steps to whoever
// manages their Google listing.

import { useState } from 'react'
import Link from 'next/link'
import { NAVY, TEAL, TEAL_DARK, TEAL_SOFT } from '@/app/dentist/[slug]/profileTheme'
import { WhatsAppIcon, CheckIcon } from '../dashIcons'
import ClinicFinder, { type GooglePlace } from './ClinicFinder'

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }
const shotRow = (highlight: boolean): React.CSSProperties => ({
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  background: '#fff', border: highlight ? `2px solid ${TEAL}` : '1px solid var(--border)',
  borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: highlight ? 700 : 500,
})
const shotBox: React.CSSProperties = { marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, background: '#F8FAFC', padding: 10, display: 'grid', gap: 6 }
const caption: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textAlign: 'center' }

export default function GoogleBookingGuide({
  link, stepsMessage, initiallyAdded, monthVisits, placesKey, initialPlaceId, clinicQuery, lat, lng,
}: {
  link: string
  stepsMessage: string
  initiallyAdded: boolean
  monthVisits: number
  placesKey: string
  initialPlaceId: string | null
  clinicQuery: string
  lat: number
  lng: number
}) {
  const [linkedPlace, setLinkedPlace] = useState<GooglePlace | null>(null)
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(initiallyAdded)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCopy() {
    const ok = await copyText(link)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  async function toggleAdded() {
    const next = !added
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/dentist/google-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ added: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not save. Please try again.')
      setAdded(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const displayLink = link.replace(/^https:\/\//, '')
  const waHref = `https://wa.me/?text=${encodeURIComponent(stepsMessage)}`
  const createListingWaHref = `https://wa.me/?text=${encodeURIComponent('Create a free Google listing for the clinic here, then add the DentistIn booking link to it:\n\nhttps://business.google.com/create\n\nBooking link: ' + link)}`

  const step = (n: number, title: string, text: string, shot: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10 }}>
      <span style={{ width: 28, height: 28, borderRadius: '50%', background: NAVY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 14 }}>{title}</b>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>{text}</p>
        {shot}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/for-dentists/dashboard" aria-label="Back to dashboard" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--text)', background: '#fff', fontSize: 16 }}>←</Link>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800 }}>Add Book button on Google</h1>
      </div>

      {added && (
        <div style={{ ...card, background: '#F0FDF4', borderColor: '#BBF7D0' }}>
          <b style={{ fontSize: 15, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}><CheckIcon /> Your Book button is on Google</b>
          <div style={{ fontSize: 13, color: '#334155' }}>
            <b style={{ fontFamily: 'var(--font-heading)', fontSize: 20, display: 'block', fontVariantNumeric: 'tabular-nums' }}>{monthVisits.toLocaleString('en-IN')}</b>
            patients opened your booking page from Google this month
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Google can take a few hours to show a new link. Counting started when this feature went live.</p>
        </div>
      )}

      {placesKey && (
        <ClinicFinder
          apiKey={placesKey}
          initialPlaceId={initialPlaceId}
          defaultQuery={clinicQuery}
          lat={lat}
          lng={lng}
          whatsAppHref={createListingWaHref}
          onPlaceChange={setLinkedPlace}
        />
      )}

      <div style={card}>
        <b style={{ fontSize: 14 }}>Your booking link</b>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#F8FAFC', border: `1px dashed ${TEAL}`, borderRadius: 12, padding: '8px 8px 8px 12px' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{displayLink}</span>
          <button type="button" onClick={handleCopy} style={{ height: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: copied ? '#16A34A' : TEAL, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Patients who tap Book on Google land on this page and pick a time.</p>
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gap: 16 }}>
          {step(1, 'Open your clinic on Google', linkedPlace
            ? 'Tap "Open my Google listing" below while signed in to the Google account that manages the clinic. Your listing shows an edit panel on top.'
            : 'Search your clinic name on Google while signed in to the Google account that manages it. Your listing shows an edit panel on top.', (
            <div style={shotBox}>
              <div style={shotRow(true)}><span>Edit profile</span><span>›</span></div>
              <div style={shotRow(false)}><span>Read reviews</span><span>›</span></div>
              <div style={caption}>Tap Edit profile</div>
            </div>
          ))}
          {step(2, 'Go to Contact, then Appointment links', 'Find "Appointment links" (sometimes called "Bookings") and tap the pencil.', (
            <div style={shotBox}>
              <div style={shotRow(false)}><span>Phone number</span><span>✎</span></div>
              <div style={shotRow(false)}><span>Website</span><span>✎</span></div>
              <div style={shotRow(true)}><span>Appointment links</span><span>✎</span></div>
              <div style={caption}>Not Website. Use Appointment links.</div>
            </div>
          ))}
          {step(3, 'Paste the link and Save', 'Paste your DentistIn link and tap Save. Google may take a few hours to show it.', (
            <div style={shotBox}>
              <div style={shotRow(true)}><span style={{ overflowWrap: 'anywhere' }}>{displayLink}</span></div>
              <div style={caption}>Paste, then Save</div>
            </div>
          ))}
        </div>
        {linkedPlace ? (
          <a href={linkedPlace.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ height: 46, borderRadius: 12, background: NAVY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Open my Google listing ↗
          </a>
        ) : (
          <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer" style={{ height: 46, borderRadius: 12, border: `1.5px solid ${NAVY}`, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Open Google Business Profile
          </a>
        )}
      </div>

      <div style={card}>
        <button type="button" onClick={toggleAdded} disabled={saving} aria-pressed={added} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: saving ? 'wait' : 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, border: added ? `2px solid ${TEAL}` : '2px solid var(--border)', background: added ? TEAL : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {added && <CheckIcon size={14} />}
          </span>
          I&apos;ve added it on Google
        </button>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Tick this so we can show you patients coming from Google.</p>
        {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B91C1C' }}>{error}</p>}
      </div>

      <a href={waHref} target="_blank" rel="noopener noreferrer" style={{ height: 46, borderRadius: 12, background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
        <WhatsAppIcon /> Send these steps on WhatsApp
      </a>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>For when your staff or an agency manages your Google listing.</p>

      <div style={{ ...card, background: TEAL_SOFT, borderColor: 'transparent' }}>
        <b style={{ fontSize: 13, color: TEAL_DARK }}>No Google listing yet?</b>
        <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>Create one free at Google Business Profile. Google sends a code to verify the clinic, which can take a few days. Come back here after.</p>
      </div>
    </div>
  )
}
