'use client'

import { useMemo, useState } from 'react'
import { FEATURE_DAYS, quoteFeatured, rupees, type FeatureDays } from '@/lib/eventPricing'
import { COUNTRIES, INDIA } from '@/lib/eventCountries'

interface Props {
  cities: Array<{ slug: string; name: string }>
  coverageCities: Array<{ slug: string; name: string; dentists: number }>
  counts: Record<string, number>
  topics: Array<{ slug: string; label: string }>
  defaultEmail: string
  defaultCity: string
  defaultMode: 'event' | 'course'
  paymentsOn: boolean
}

const EVENT_KINDS = [
  { v: 'conference', l: 'Conference' },
  { v: 'exhibition', l: 'Exhibition' },
  { v: 'seminar', l: 'Seminar / CDE program' },
  { v: 'study_club', l: 'Study club' },
]

export default function EventForm({ cities, coverageCities, counts, topics, defaultEmail, defaultCity, defaultMode, paymentsOn }: Props) {
  const [mode, setMode] = useState<'event' | 'course'>(defaultMode)
  const [f, setF] = useState({
    title: '', kind: 'seminar', topic: '', starts_on: '', ends_on: '', is_online: false, city: defaultCity, country: INDIA, otherCountry: '',
    organiser: '', fee_text: '', link: '', description: '', gives_certificate: false, email: defaultEmail, phone: '', website: '',
  })
  const [plan, setPlan] = useState<'free' | 'featured'>('free')
  const [allIndia, setAllIndia] = useState(false)
  const [featureCities, setFeatureCities] = useState<string[]>(defaultCity && counts[defaultCity] ? [defaultCity] : [])
  const [days, setDays] = useState<FeatureDays>(15)
  const [wantsCustom, setWantsCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [result, setResult] = useState<{ id: string; payUrl: string | null } | null>(null)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string | boolean) => setF(prev => ({ ...prev, [k]: v }))

  const quote = useMemo(() => quoteFeatured({ allIndia, cities: featureCities, days, counts }), [allIndia, featureCities, days, counts])
  const coverageLabel = allIndia ? 'all over India' : featureCities.length
    ? `in ${featureCities.map(c => coverageCities.find(x => x.slug === c)?.name || c).join(' + ')}`
    : 'in no city yet'

  function toggleCity(slug: string) {
    setAllIndia(false)
    setFeatureCities(prev => prev.includes(slug) ? prev.filter(c => c !== slug) : [...prev, slug])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (plan === 'featured' && !allIndia && !featureCities.length) { setErr('Pick at least one city for Featured, or All India'); return }
    setState('saving')
    try {
      const res = await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f, country: f.country === 'other' ? f.otherCountry : f.country, kind: mode === 'course' ? 'course' : f.kind, ends_on: f.ends_on || null, topic: f.topic || null,
          plan, feature_all_india: allIndia, feature_cities: featureCities, feature_days: days,
          custom_alert_request: plan === 'featured' && wantsCustom ? customText : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setErr(data?.error || 'Could not submit'); setState('idle'); return }
      if (data.pay_url) { window.location.href = data.pay_url; return }
      setResult({ id: data.id, payUrl: null })
      setState('done')
    } catch { setErr('Network error, please try again.'); setState('idle') }
  }

  if (state === 'done') {
    return (
      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 14, padding: 20, color: '#065F46' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Thanks, we&apos;ve got it</div>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          {plan === 'featured'
            ? `You chose Featured (${rupees(quote.total)}). We'll check the details and send you a payment link by email. It goes live once paid and approved.`
            : 'We’ll check the details, usually within a day, and email you when it’s live.'}
        </div>
        {result?.id && <a href={`/events/listing/${result.id}`} style={{ display: 'inline-block', marginTop: 12, fontWeight: 700, color: '#065F46' }}>See your listing status →</a>}
      </div>
    )
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: '#0F1923', marginBottom: 6 }
  const input: React.CSSProperties = { width: '100%', minHeight: 46, padding: '0 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15, fontFamily: 'var(--font-body)', boxSizing: 'border-box', background: '#fff', color: '#0F1923' }
  const row: React.CSSProperties = { marginBottom: 14 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, ...row }
  const pick = (on: boolean): React.CSSProperties => ({
    flex: 1, textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
    border: on ? '2px solid #1D4ED8' : '1px solid #CBD5E1', background: on ? '#EFF6FF' : '#fff', color: '#0F1923',
  })
  const planBox = (on: boolean, gold = false): React.CSSProperties => ({
    display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', marginBottom: 10,
    border: on ? `2px solid ${gold ? '#F59E0B' : '#1D4ED8'}` : '1px solid #CBD5E1', background: on ? (gold ? '#FFFBEB' : '#EFF6FF') : '#fff', color: '#0F1923',
  })
  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: 38, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font-body)',
    background: on ? '#0F1923' : '#fff', color: on ? '#fff' : '#0F1923', border: on ? '1px solid #0F1923' : '1px solid #CBD5E1',
  })
  const isCourse = mode === 'course'

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>What do you want to list?</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button type="button" onClick={() => setMode('event')} style={pick(!isCourse)} aria-pressed={!isCourse}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>An event</div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4, marginTop: 4 }}>Conference, CDE, seminar, exhibition</div>
        </button>
        <button type="button" onClick={() => setMode('course')} style={pick(isCourse)} aria-pressed={isCourse}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>A course I teach</div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4, marginTop: 4 }}>Hands-on or online course run by you</div>
        </button>
      </div>

      <div style={row}>
        <label style={label} htmlFor="ev-title">{isCourse ? 'Course name' : 'Event name'}</label>
        <input id="ev-title" required value={f.title} onChange={e => set('title', e.target.value)} style={input} />
      </div>
      <div style={grid2}>
        {!isCourse && (
          <div>
            <label style={label} htmlFor="ev-kind">Type</label>
            <select id="ev-kind" value={f.kind} onChange={e => set('kind', e.target.value)} style={input}>
              {EVENT_KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={label} htmlFor="ev-topic">Topic</label>
          <select id="ev-topic" value={f.topic} onChange={e => set('topic', e.target.value)} style={input}>
            <option value="">General</option>
            {topics.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div style={grid2}>
        <div>
          <label style={label} htmlFor="ev-start">Start date</label>
          <input id="ev-start" type="date" required value={f.starts_on} onChange={e => set('starts_on', e.target.value)} style={input} />
        </div>
        <div>
          <label style={label} htmlFor="ev-end">End date (optional)</label>
          <input id="ev-end" type="date" value={f.ends_on} onChange={e => set('ends_on', e.target.value)} style={input} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 14, minHeight: 32 }}>
        <input type="checkbox" checked={f.is_online} onChange={e => set('is_online', e.target.checked)} style={{ width: 20, height: 20 }} />
        It&apos;s online
      </label>
      <div style={row}>
        <label style={label} htmlFor="ev-country">Country</label>
        <select id="ev-country" value={f.country} onChange={e => setF(prev => ({ ...prev, country: e.target.value, city: e.target.value === INDIA ? defaultCity : '' }))} style={input}>
          <option value={INDIA}>India</option>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="other">Other country…</option>
        </select>
        {f.country === 'other' && (
          <input aria-label="Country name" required value={f.otherCountry} onChange={e => set('otherCountry', e.target.value)} placeholder="Type the country" style={{ ...input, marginTop: 8 }} />
        )}
      </div>
      {!f.is_online && (
        <div style={row}>
          <label style={label} htmlFor="ev-city">City</label>
          {f.country === INDIA ? (
            <select id="ev-city" value={f.city} onChange={e => set('city', e.target.value)} style={input}>
              <option value="">Select a city</option>
              {cities.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          ) : (
            <input id="ev-city" required value={f.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Dubai" style={input} />
          )}
        </div>
      )}
      <div style={grid2}>
        <div>
          <label style={label} htmlFor="ev-org">{isCourse ? 'Taught by' : 'Organiser'}</label>
          <input id="ev-org" value={f.organiser} onChange={e => set('organiser', e.target.value)} placeholder={isCourse ? 'e.g. Dr. Priya Shah' : 'e.g. IDA Pune branch'} style={input} />
        </div>
        <div>
          <label style={label} htmlFor="ev-fee">Fee</label>
          <input id="ev-fee" value={f.fee_text} onChange={e => set('fee_text', e.target.value)} placeholder="e.g. Free, or ₹4,000" style={input} />
        </div>
      </div>
      <div style={row}>
        <label style={label} htmlFor="ev-link">Link for details or registration</label>
        <input id="ev-link" type="url" value={f.link} onChange={e => set('link', e.target.value)} placeholder="https://" style={input} />
      </div>
      <div style={row}>
        <label style={label} htmlFor="ev-desc">Short description</label>
        <textarea id="ev-desc" rows={3} maxLength={600} value={f.description} onChange={e => set('description', e.target.value)} style={{ ...input, padding: 12, minHeight: 90, resize: 'vertical' }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 14, minHeight: 32 }}>
        <input type="checkbox" checked={f.gives_certificate} onChange={e => set('gives_certificate', e.target.checked)} style={{ width: 20, height: 20 }} />
        Attendees get a certificate or CDE points
      </label>
      <div style={grid2}>
        <div>
          <label style={label} htmlFor="ev-email">Your email (not shown publicly)</label>
          <input id="ev-email" type="email" required value={f.email} onChange={e => set('email', e.target.value)} style={input} />
        </div>
        <div>
          <label style={label} htmlFor="ev-phone">WhatsApp number (optional)</label>
          <input id="ev-phone" type="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="10-digit mobile" style={input} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: -9999 }} aria-hidden="true">
        <label htmlFor="ev-website">Website</label>
        <input id="ev-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} />
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', margin: '8px 0 10px' }}>HOW SHOULD IT SHOW?</div>
      <button type="button" onClick={() => setPlan('free')} style={planBox(plan === 'free')} aria-pressed={plan === 'free'}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Standard listing</span>
          <span style={{ display: 'block', fontSize: 12, color: '#475569', lineHeight: 1.45, marginTop: 3 }}>Shows in the calendar by date. We check it within a day or two.</span>
        </span>
        <span style={{ fontWeight: 800 }}>Free</span>
      </button>
      <button type="button" onClick={() => setPlan('featured')} style={planBox(plan === 'featured', true)} aria-pressed={plan === 'featured'}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Featured</span>
          <span style={{ display: 'block', fontSize: 12, color: '#475569', lineHeight: 1.45, marginTop: 3 }}>Top of the Events page with a gold badge, plus an email and WhatsApp alert to dentists in your chosen area: the day it goes live, and 2 days before it starts.</span>
        </span>
        <span style={{ fontWeight: 800 }}>{plan === 'featured' ? rupees(quote.total) : 'from ₹499'}</span>
      </button>

      {plan === 'featured' && (
        <div style={{ border: '1px solid #CBD5E1', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>1. Where should it be featured?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <button type="button" onClick={() => { setAllIndia(!allIndia); if (!allIndia) setFeatureCities([]) }} style={chip(allIndia)} aria-pressed={allIndia}>All India</button>
            {coverageCities.map(c => (
              <button key={c.slug} type="button" onClick={() => toggleCity(c.slug)} style={chip(!allIndia && featureCities.includes(c.slug))} aria-pressed={!allIndia && featureCities.includes(c.slug)}>
                {c.name}
              </button>
            ))}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>2. For how many days?</div>
          <div style={{ display: 'flex', background: '#E2E8F0', borderRadius: 10, padding: 3, marginBottom: 14 }}>
            {FEATURE_DAYS.map(d => (
              <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
                style={{ flex: 1, minHeight: 40, border: 0, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: days === d ? 700 : 500, background: days === d ? '#fff' : 'transparent', color: '#0F1923' }}>
                {d} days
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 10, fontSize: 13, color: '#334155', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>Featured {coverageLabel}, {days} days</span><b>{rupees(quote.coverage)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>Alerts to about {quote.dentists} dentists, twice</span><b>{rupees(quote.alerts)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#0F1923' }}><b>Total</b><b>{rupees(quote.total)}</b></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, marginTop: 14 }}>
            <input type="checkbox" checked={wantsCustom} onChange={e => setWantsCustom(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1 }} />
            <span><b>Add-on: custom notification</b><br /><span style={{ fontSize: 12, color: '#475569' }}>An extra message on a date you choose, or only to one speciality. Price to be set: we&apos;ll confirm it before you pay for it.</span></span>
          </label>
          {wantsCustom && (
            <textarea rows={2} maxLength={400} value={customText} onChange={e => setCustomText(e.target.value)} placeholder="What should go out, to whom, and when?" style={{ ...input, padding: 12, minHeight: 70, marginTop: 10, resize: 'vertical' }} />
          )}
        </div>
      )}

      {err && <div style={{ color: '#B91C1C', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
      <button type="submit" disabled={state === 'saving'} style={{ width: '100%', minHeight: 50, borderRadius: 12, border: 'none', background: state === 'saving' ? '#93C5FD' : '#1D4ED8', color: '#fff', fontSize: 16, fontWeight: 700, cursor: state === 'saving' ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {state === 'saving' ? 'Sending…' : plan === 'featured' ? (paymentsOn ? `Pay ${rupees(quote.total)} and submit` : `Submit Featured request (${rupees(quote.total)})`) : 'Submit for approval'}
      </button>
      <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>
        {plan === 'featured'
          ? paymentsOn ? 'UPI, cards or netbanking through Razorpay. Full refund if we don’t approve it.' : 'We’ll email you a payment link after we check the details. Full refund if we don’t approve it.'
          : 'Free to list. Our team checks every listing before it goes live.'}
      </p>
    </form>
  )
}
