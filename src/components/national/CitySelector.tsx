'use client'

// City selector for the national /for-dentists page. Dentists pick the
// city they practise in and we route them to that city's registration
// form (https://dentistin[city].in/for-dentists/register). Coming-soon
// cities aren't shown — only live domains can accept a new registration.

import { useState } from 'react'
import { CITY_CONFIGS } from '@/config/cities'

const ORDERED_CITY_SLUGS = [
  'mumbai', 'pune', 'thane', 'navimumbai', 'nashik', 'nagpur',
  'kolhapur', 'sambhajinagar', 'ahmedabad', 'surat', 'rajkot',
  'jamnagar', 'goa',
] as const

export default function CitySelector() {
  const [slug, setSlug] = useState<string>('')
  const cfg = slug ? (CITY_CONFIGS as any)[slug] : null

  function go() {
    if (!cfg) return
    window.location.href = `https://${cfg.domain}/for-dentists/register`
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '20px 22px', maxWidth: 520, margin: '0 auto', boxShadow: '0 4px 12px rgba(15, 25, 35, 0.05)' }}>
      <label htmlFor="ndsel" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Where do you practise?
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select
          id="ndsel"
          value={slug}
          onChange={e => setSlug(e.target.value)}
          style={{
            flex: 1, minWidth: 200,
            padding: '11px 14px', minHeight: 44,
            borderRadius: 8, border: '1.5px solid #E2E8F0',
            fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
            background: '#fff', color: '#0F1923',
          }}
        >
          <option value="">Select your city…</option>
          {ORDERED_CITY_SLUGS.map(s => {
            const c = (CITY_CONFIGS as any)[s]
            return <option key={s} value={s}>{c.cityName} — {c.domain}</option>
          })}
        </select>
        <button
          type="button"
          onClick={go}
          disabled={!slug}
          style={{
            padding: '11px 20px', minHeight: 44,
            background: slug ? '#1D4ED8' : '#CBD5E1',
            color: '#fff', border: 'none', borderRadius: 8,
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700,
            cursor: slug ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          Register →
        </button>
      </div>
      {cfg && (
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 12, lineHeight: 1.5 }}>
          You'll be taken to <strong style={{ color: '#0F1923' }}>{cfg.domain}/for-dentists/register</strong> to complete signup.
        </p>
      )}
      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 14, lineHeight: 1.5 }}>
        Don't see your city? It's coming soon — visit the <a href="/cities" style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>Cities</a> page to get notified when we launch there.
      </p>
    </div>
  )
}
