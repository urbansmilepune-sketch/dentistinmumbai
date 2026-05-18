'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeTier, type Tier } from '@/lib/tier'

// Per-tier branch limits. Surface the limit visually (count badge + tooltip
// on a disabled Add button) but also enforce it on the server-side POST so
// a determined free dentist can't bypass via direct API calls.
const LOCATION_LIMIT: Record<Tier, number> = {
  free: 2, silver: 3, gold: Infinity, featured: Infinity,
}

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

const DEFAULT_HOURS = DAYS.reduce<Record<string, any>>((acc, { key }) => {
  acc[key] = { is_open: key !== 'sun', open_time: '09:00', close_time: '19:00' }
  return acc
}, {})

interface Location {
  id: string
  name: string
  address: string
  area_id: string | null
  area_name_raw: string | null
  city: string
  phone: string | null
  working_hours: any
  is_primary: boolean
  areas?: { name: string; slug: string } | null
}

interface FormState {
  id?: string
  name: string
  address: string
  area_name: string
  city: string
  phone: string
  working_hours: Record<string, any>
  is_primary: boolean
}

const EMPTY_FORM: FormState = {
  name: '', address: '', area_name: '', city: 'mumbai', phone: '',
  working_hours: DEFAULT_HOURS, is_primary: false,
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<Tier>('free')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || cancelled) return
      const { data } = await supabase.from('dentists').select('tier').eq('email', user.email).maybeSingle()
      if (!cancelled) setTier(normalizeTier(data?.tier))
    })
    return () => { cancelled = true }
  }, [])

  const limit = LOCATION_LIMIT[tier]
  const atLimit = locations.length >= limit
  const limitLabel = limit === Infinity ? 'unlimited' : `${locations.length}/${limit}`

  async function load() {
    setLoading(true)
    const res = await fetch('/api/dentist/locations', { cache: 'no-store' })
    const data = await res.json().catch(() => ({ locations: [] }))
    setLocations(data.locations ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setError(null)
    setEditing({ ...EMPTY_FORM, is_primary: locations.length === 0 })
  }

  function openEdit(loc: Location) {
    setError(null)
    setEditing({
      id: loc.id,
      name: loc.name,
      address: loc.address || '',
      area_name: loc.area_name_raw || loc.areas?.name || '',
      city: loc.city || 'mumbai',
      phone: loc.phone || '',
      working_hours: loc.working_hours || DEFAULT_HOURS,
      is_primary: loc.is_primary,
    })
  }

  async function handleSave() {
    if (!editing) return
    if (!editing.name.trim()) { setError('Clinic name is required'); return }
    setSaving(true); setError(null)
    const url = editing.id ? `/api/dentist/locations/${editing.id}` : '/api/dentist/locations'
    const method = editing.id ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error || 'Save failed')
      setSaving(false)
      return
    }
    setEditing(null); setSaving(false)
    await load()
  }

  async function setPrimary(id: string) {
    await fetch(`/api/dentist/locations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_primary: true }),
    })
    await load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this location? Patients will no longer see it on your profile.')) return
    await fetch(`/api/dentist/locations/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Clinic Locations</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>
            Add every branch where you practice. Patients see all of them on your profile and pick when booking.
            {limit !== Infinity && <> · <strong style={{ color: 'var(--text)' }}>{limitLabel}</strong> locations</>}
          </p>
        </div>
        {!atLimit && (
          <button onClick={openCreate} style={primaryBtn}>+ Add Location</button>
        )}
      </div>

      {atLimit && limit !== Infinity && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 10, padding: '12px 14px',
          fontSize: 13, color: '#92400E', marginBottom: 16, flexWrap: 'wrap',
        }}>
          <span>🔒 You&apos;ve used all <strong>{limit}</strong> locations on the {tier} plan.</span>
          <a href="/for-dentists/dashboard/upgrade"
            style={{ color: 'var(--blue)', fontWeight: 700, textDecoration: 'none', marginLeft: 'auto' }}>
            Upgrade for more →
          </a>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading…</p>
      ) : locations.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏥</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>No locations yet</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 18, maxWidth: 360, margin: '0 auto 18px' }}>
            Add your first clinic location. Once you have more than one, your profile will show a location tab strip patients can switch between.
          </p>
          <button onClick={openCreate} style={primaryBtn}>+ Add Location</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {locations.map(loc => (
            <div key={loc.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{loc.name}</h3>
                    {loc.is_primary && (
                      <span style={{ padding: '2px 8px', borderRadius: 20, background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', fontSize: 11, fontWeight: 700 }}>★ Primary</span>
                    )}
                  </div>
                  {loc.address && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>📍 {loc.address}</p>}
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {loc.areas?.name || loc.area_name_raw || '—'}
                    {loc.phone ? ` · 📞 ${loc.phone}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!loc.is_primary && (
                    <button onClick={() => setPrimary(loc.id)} style={subtleBtn}>Set primary</button>
                  )}
                  <button onClick={() => openEdit(loc)} style={subtleBtn}>Edit</button>
                  <button onClick={() => remove(loc.id)} style={dangerBtn}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div style={modalBackdrop} onClick={() => !saving && setEditing(null)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>
                {editing.id ? 'Edit Location' : 'Add Location'}
              </h2>
              <button onClick={() => !saving && setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
              <Field label="Clinic Name *">
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={inputStyle} placeholder="e.g. Bandra West Branch" />
              </Field>
              <Field label="Address">
                <textarea value={editing.address} onChange={e => setEditing({ ...editing, address: e.target.value })} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Building, street, landmark" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Area">
                  <input value={editing.area_name} onChange={e => setEditing({ ...editing, area_name: e.target.value })} style={inputStyle} placeholder="e.g. Bandra West" />
                </Field>
                <Field label="Phone">
                  <input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} style={inputStyle} placeholder="10-digit number" inputMode="tel" />
                </Field>
              </div>

              <div>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Working Hours</p>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {DAYS.map(({ key, label }) => {
                    const day = editing.working_hours[key] || { is_open: false, open_time: '09:00', close_time: '19:00' }
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, width: 80 }}>
                          <input
                            type="checkbox" checked={!!day.is_open}
                            onChange={e => setEditing({ ...editing, working_hours: { ...editing.working_hours, [key]: { ...day, is_open: e.target.checked } } })}
                            style={{ accentColor: 'var(--blue)' }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                        </label>
                        {day.is_open ? (
                          <>
                            <input type="time" value={day.open_time} onChange={e => setEditing({ ...editing, working_hours: { ...editing.working_hours, [key]: { ...day, open_time: e.target.value } } })} style={timeInput} />
                            <span style={{ color: 'var(--muted)', fontSize: 12 }}>to</span>
                            <input type="time" value={day.close_time} onChange={e => setEditing({ ...editing, working_hours: { ...editing.working_hours, [key]: { ...day, close_time: e.target.value } } })} style={timeInput} />
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }}>Closed</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox" checked={editing.is_primary}
                  onChange={e => setEditing({ ...editing, is_primary: e.target.checked })}
                  style={{ accentColor: 'var(--blue)' }}
                />
                <span>Mark as primary location (shown first on profile)</span>
              </label>

              {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !saving && setEditing(null)} style={subtleBtn} disabled={saving}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save Location'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14, outline: 'none',
  fontFamily: 'var(--font-body)', background: '#fff',
}
const timeInput: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
  fontSize: 12, fontFamily: 'var(--font-body)',
}
const primaryBtn: React.CSSProperties = {
  padding: '11px 22px', background: 'var(--blue)', color: '#fff',
  border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)',
  fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44,
}
const subtleBtn: React.CSSProperties = {
  padding: '8px 14px', background: '#fff', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 8,
  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  ...subtleBtn, color: '#991B1B', border: '1px solid #FECACA', background: '#FEF2F2',
}
const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16,
}
const emptyStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
  padding: 48, textAlign: 'center',
}
const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15, 25, 35, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 300, padding: 16,
}
const modalCard: React.CSSProperties = {
  background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560,
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
}
