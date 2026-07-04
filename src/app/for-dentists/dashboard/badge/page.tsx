'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCityBySlug, cityOrigin, cityBrandName, cityBrandTld } from '@/config/cities'

const NAVY = '#0F172A'
const TEAL = '#14B8A6'

type DentistRow = { slug: string; name: string | null; is_verified: boolean | null; city: string | null }

export default function BadgePage() {
  const [loading, setLoading] = useState(true)
  const [dentist, setDentist] = useState<DentistRow | null>(null)
  const [size, setSize] = useState<'large' | 'small'>('large')
  const [copied, setCopied] = useState<'embed' | 'link' | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('dentists')
        .select('slug, name, is_verified, city')
        .eq('email', user.email)
        .single()
      if (data) setDentist(data as DentistRow)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading your badge…</p>
  }
  if (!dentist) {
    return <p style={{ color: 'var(--muted)', fontSize: 14 }}>Couldn&apos;t load your profile — please sign in again.</p>
  }

  const city = getCityBySlug(dentist.city)
  const origin = cityOrigin(city)
  const brand = `${cityBrandName(city)}${cityBrandTld(city)}`
  const profileUrl = `${origin}/dentist/${dentist.slug}`
  const badgeUrl = `${origin}/api/badge/${dentist.slug}${size === 'small' ? '?size=small' : ''}`
  const dims = size === 'small' ? { w: 120, h: 40 } : { w: 200, h: 60 }

  const embedCode =
    `<a href="${profileUrl}">\n` +
    `  <img src="${badgeUrl}"\n` +
    `       alt="Featured on ${brand}" width="${dims.w}" height="${dims.h}" />\n` +
    `</a>`

  const waText = `I'm listed on ${brand} — book an appointment here: ${profileUrl}`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waText)}`

  async function copy(text: string, which: 'embed' | 'link') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard blocked — the textarea is selectable as a fallback */ }
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 20,
  }
  const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', minHeight: 44,
    background: TEAL, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14,
    cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none',
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: NAVY, marginBottom: 4 }}>
        Get your badge
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>
        Show patients you&apos;re verified on {brand}. Add the badge to your clinic website, or share your
        listing link directly.
      </p>

      {/* Size toggle + preview */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: NAVY }}>Preview</h2>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['large', 'small'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                style={{
                  padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none', fontFamily: 'var(--font-body)',
                  background: size === s ? NAVY : '#fff',
                  color: size === s ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {s === 'large' ? 'Large (200×60)' : 'Small (120×40)'}
              </button>
            ))}
          </div>
        </div>
        {/* Rendered from the live endpoint, so the preview is exactly what
            patients will see embedded. */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 16px', background: '#F8FAFC', border: '1px dashed var(--border)', borderRadius: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeUrl} alt={`Featured on ${brand}`} width={dims.w} height={dims.h} />
        </div>
      </div>

      {/* Embed code */}
      <div style={card}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 6 }}>
          Add it to your website
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
          Paste this HTML anywhere on your clinic site — footer, homepage, or contact page.
        </p>
        <textarea
          readOnly
          value={embedCode}
          rows={4}
          onFocus={e => e.currentTarget.select()}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
            fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)',
            background: 'var(--bg)', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => copy(embedCode, 'embed')} style={btnPrimary}>
            {copied === 'embed' ? '✓ Copied!' : '📋 Copy embed code'}
          </button>
        </div>
      </div>

      {/* Plain link + WhatsApp — for dentists without a website */}
      <div style={card}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 6 }}>
          No website? Share your link
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
          Send patients straight to your listing — on WhatsApp, Instagram bio, or Google Business.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14, flexWrap: 'wrap',
        }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profileUrl}
          </span>
          <button
            type="button"
            onClick={() => copy(profileUrl, 'link')}
            style={{
              padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
              background: '#fff', color: NAVY, border: '1px solid var(--border)', borderRadius: 8,
            }}
          >
            {copied === 'link' ? '✓ Copied' : 'Copy link'}
          </button>
        </div>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, background: '#25D366' }}>
          💬 Share on WhatsApp
        </a>
      </div>
    </div>
  )
}
