'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCityByDomain, CITY_CONFIGS, DEFAULT_CITY, type CitySlug, type CityConfig } from '@/config/cities'

type AreaStatus = 'idle' | 'loading' | 'ready' | 'error'

export default function OnboardPage() {
  const router = useRouter()
  const [form, setForm] = useState({ clinic_name: '', phone: '', area: '', area_name_raw: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [cityConfig, setCityConfig] = useState<CityConfig>(CITY_CONFIGS[DEFAULT_CITY])
  const city: CitySlug = cityConfig.citySlug

  // Same hydration pattern as /register: pull the curated area list for the
  // current city, fall back to a free-text input if the fetch fails so the
  // dentist isn't blocked by an /api/areas outage.
  const [areas, setAreas] = useState<{ name: string }[]>([])
  const [areaStatus, setAreaStatus] = useState<AreaStatus>('idle')

  useEffect(() => {
    setCityConfig(getCityByDomain(window.location.hostname))
  }, [])

  useEffect(() => {
    let cancelled = false
    setAreaStatus('loading')
    setAreas([])
    setForm(f => ({ ...f, area: '', area_name_raw: '' }))
    fetch(`/api/areas?city=${encodeURIComponent(city)}`)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        const list: { name: string }[] = Array.isArray(data?.areas) ? data.areas : []
        setAreas(list)
        setAreaStatus('ready')
      })
      .catch(err => {
        if (cancelled) return
        console.error('[onboard] /api/areas fetch failed', err)
        setAreaStatus('error')
      })
    return () => { cancelled = true }
  }, [city])

  function update(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setError('')
  }

  async function handleSubmit() {
    if (!form.clinic_name.trim() || !form.phone.trim()) {
      setError('Please fill all required fields.'); return
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
      setError('Please enter a valid 10-digit phone number.'); return
    }
    if (form.area === '__other__' && !form.area_name_raw.trim()) {
      setError('Please type your area name.'); return
    }
    if (!form.area && !form.area_name_raw.trim()) {
      setError('Please pick or type your area.'); return
    }

    const submittingArea = form.area === '__other__' ? '' : form.area
    const submittingAreaRaw = form.area === '__other__' ? form.area_name_raw.trim() : null

    setSubmitting(true)
    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_name: form.clinic_name,
          phone: form.phone,
          area: submittingArea,
          area_name_raw: submittingAreaRaw,
          city,
        }),
      })
      const data = await res.json()
      if (data.success && data.redirect) {
        router.refresh()
        router.push(data.redirect)
        return
      }
      setError(data.error || 'Something went wrong. Please try again.')
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '1.5px solid var(--border)', fontSize: 14,
    fontFamily: 'var(--font-body)', outline: 'none',
    background: '#fff', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: 13, fontWeight: 600 as const, display: 'block' as const, marginBottom: 6 }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, background: 'var(--blue)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 17 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>DentistIn{cityConfig.cityName.replace(/\s+/g, '')}<span style={{ color: 'var(--blue)' }}>{'.' + cityConfig.domain.split('.').slice(1).join('.')}</span></span>
          </Link>
        </nav>
      </header>

      <main style={{ padding: '48px 20px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', marginBottom: 10, lineHeight: 1.2 }}>
              Finish setting up your listing
            </h1>
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>
              We just need three details to put your clinic live on {cityConfig.cityName}&apos;s directory.
            </p>
          </div>

          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: '28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Clinic Name *</label>
                <input value={form.clinic_name} onChange={e => update('clinic_name', e.target.value)} placeholder="Your Dental Clinic" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Phone Number *</label>
                <input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="10-digit number" type="tel" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Area in {cityConfig.cityName} *</label>
                {areaStatus === 'error' ? (
                  <>
                    <input
                      value={form.area}
                      onChange={e => update('area', e.target.value)}
                      placeholder={`Type your area in ${cityConfig.cityName}`}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 11, color: '#92400E', marginTop: 6 }}>
                      ⚠️ Couldn&apos;t load the area list — please type your area instead.
                    </div>
                  </>
                ) : areaStatus !== 'ready' ? (
                  <select disabled value="" style={{ ...inputStyle, cursor: 'wait', opacity: 0.7 }}>
                    <option value="">Loading areas in {cityConfig.cityName}…</option>
                  </select>
                ) : areas.length === 0 ? (
                  <>
                    <input
                      value={form.area}
                      onChange={e => update('area', e.target.value)}
                      placeholder={`Type your area in ${cityConfig.cityName}`}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                      We don&apos;t have a curated list for {cityConfig.cityName} yet — type your area and we&apos;ll add it.
                    </div>
                  </>
                ) : (
                  <>
                    <select value={form.area} onChange={e => update('area', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">Select your area</option>
                      {areas.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                      <option value="__other__">Other (not in this list)</option>
                    </select>
                    {form.area === '__other__' && (
                      <div style={{ marginTop: 10 }}>
                        <input
                          value={form.area_name_raw}
                          onChange={e => update('area_name_raw', e.target.value)}
                          placeholder={`Type your area in ${cityConfig.cityName}`}
                          style={inputStyle}
                        />
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                          We&apos;ll add this area to {cityConfig.cityName} once your listing is live.
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {error && (
                <div style={{ padding: '12px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B' }}>
                  ⚠️ {error}
                </div>
              )}

              <button
                onClick={handleSubmit} disabled={submitting}
                style={{ width: '100%', padding: '14px', background: '#FF6135', color: '#fff', border: 'none', borderRadius: 12, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
              >{submitting ? 'Setting up…' : 'Take me to my dashboard →'}</button>

              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                You can edit everything else from your dashboard once you&apos;re in.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
