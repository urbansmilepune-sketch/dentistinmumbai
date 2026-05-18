'use client'

// Cold-email outreach console. Three sections, top to bottom:
//
//   1. Contacts — CSV upload, by-city counts, filtered contact table,
//      bulk-delete-by-city.
//   2. Campaigns — create form (city, subject, body with variables, preview),
//      list with stats, send/pause controls.
//   3. Templates — pre-built starter content the admin can drop in.
//
// All API calls live under /api/admin/outreach/* and /api/track/*. The send
// surface is polled batch-by-batch from this component so the work stays
// inside a Vercel function timeout — see startSending below.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

interface Contact {
  id: string
  name: string | null
  clinic_name: string | null
  email: string
  phone: string | null
  city: string | null
  area: string | null
  source: string | null
  status: string
  campaign_id: string | null
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  registered_at: string | null
  created_at: string
}

interface Campaign {
  id: string
  name: string
  city: string | null
  subject: string
  body: string
  total_contacts: number
  sent_count: number
  open_count: number
  click_count: number
  registration_count: number
  status: 'draft' | 'sending' | 'paused' | 'sent' | 'failed'
  created_at: string
  sent_at: string | null
}

type CityCount = { total: number; pending: number; sent: number; opened: number; clicked: number; registered: number }

// Display order matches the rest of the admin panel for muscle memory.
const CITY_ORDER: CitySlug[] = [
  'mumbai', 'pune', 'thane', 'nashik', 'nagpur', 'goa', 'surat',
  'kolhapur', 'sambhajinagar', 'rajkot', 'ahmedabad', 'jamnagar', 'navimumbai',
]

const TEMPLATES = [
  {
    id: 'missing-listing',
    label: 'Your clinic is missing',
    subject: '{clinic_name} is not listed on dentistin{city}.in',
    body: `Hi Dr. {name},

We noticed {clinic_name} is not listed on dentistin{city}.in — the fastest growing dental directory in {city}.

Dentists on our platform are getting new patient enquiries every week. Your listing is completely free and takes 5 minutes to set up.

👉 Claim your free listing: https://dentistin{city}.in/for-dentists/register

What you get for free:
✅ Your own booking page
✅ Patient reviews & ratings
✅ WhatsApp booking button
✅ Appointment management
✅ Zero commission — ever

Join 25+ dentists already on DentistIn.

Regards,
The DentistIn Team
dentistin{city}.in`,
  },
  {
    id: 'patients-searching',
    label: 'Patients are searching for you',
    subject: 'Patients in {area} are searching for a dentist',
    body: `Hi Dr. {name},

Patients in {area} ({city}) search for dentists every day — and right now, your clinic isn't showing up in our directory.

dentistin{city}.in is a free local listing trusted by patients across the city. Setting up your clinic page takes 5 minutes and brings in real bookings.

👉 Set up your free listing: https://dentistin{city}.in/for-dentists/register

It costs you nothing, takes 5 minutes, and could mean a steady stream of new patients each week.

Looking forward to having {clinic_name} on the platform.

Regards,
The DentistIn Team
dentistin{city}.in`,
  },
]

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14,
  boxShadow: '0 4px 12px rgba(15, 25, 35, 0.04), 0 1px 3px rgba(15, 25, 35, 0.06)',
  padding: 20, marginBottom: 20,
}
const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }
const btnPrimary: React.CSSProperties = {
  padding: '9px 18px', minHeight: 38, background: '#0057A8', color: '#fff', border: 'none',
  borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '9px 18px', minHeight: 38, background: '#fff', color: '#475569',
  border: '1px solid #E2E8F0', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#DC2626' }

function renderTemplate(input: string, ctx: { name?: string | null; clinic_name?: string | null; city?: string | null; area?: string | null }): string {
  return input.replace(/\{(name|clinic_name|city|area|first_name)\}/g, (_m, key) => {
    if (key === 'first_name') return (ctx.name || '').split(/\s+/)[0] || 'there'
    const v = (ctx as any)[key]
    return v == null || v === '' ? '' : String(v)
  })
}

export default function OutreachTab() {
  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([])
  const [cityCounts, setCityCounts] = useState<Record<string, CityCount>>({})
  const [filterCity, setFilterCity] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Campaign state
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [cName, setCName] = useState('')
  const [cCity, setCCity] = useState<string>('mumbai')
  const [cSubject, setCSubject] = useState('')
  const [cBody, setCBody] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [savingCampaign, setSavingCampaign] = useState(false)
  const [campaignError, setCampaignError] = useState<string | null>(null)

  // Send state — keyed by campaign id so multiple campaigns can be in
  // different stages without stepping on each other.
  const [sending, setSending] = useState<Record<string, { active: boolean; sent: number; total: number; failed: number }>>({})
  const sendCancel = useRef<Record<string, boolean>>({})

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true)
    const params = new URLSearchParams()
    if (filterCity) params.set('city', filterCity)
    if (filterStatus) params.set('status', filterStatus)
    try {
      const res = await fetch(`/api/admin/outreach/contacts?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setContacts(data.contacts || [])
        setCityCounts(data.city_counts || {})
      }
    } catch {}
    setLoadingContacts(false)
  }, [filterCity, filterStatus])

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/outreach/campaigns', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setCampaigns(data.campaigns || [])
    } catch {}
  }, [])

  useEffect(() => { loadContacts() }, [loadContacts])
  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  async function onUploadFile(file: File) {
    setUploading(true); setUploadMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/outreach/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadMsg(`Upload failed: ${data?.error || 'Unknown error'}`)
      } else {
        setUploadMsg(`Imported ${data.inserted} contacts. ${data.skipped_existing || 0} already existed, ${data.skipped_invalid || 0} invalid rows.`)
        loadContacts()
      }
    } catch (e) {
      setUploadMsg('Upload failed: network error')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function bulkDeleteByCity(city: string) {
    if (!confirm(`Delete ALL ${cityCounts[city]?.total ?? 0} contacts in ${cityName(city)}? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/outreach/contacts?city=${encodeURIComponent(city)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(`Delete failed: ${data?.error || 'Unknown error'}`)
        return
      }
      loadContacts()
    } catch {
      alert('Delete failed: network error')
    }
  }

  async function createCampaign() {
    setCampaignError(null)
    if (!cName.trim() || !cSubject.trim() || !cBody.trim()) {
      setCampaignError('Name, subject, and body are required.')
      return
    }
    setSavingCampaign(true)
    try {
      const res = await fetch('/api/admin/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName.trim(), city: cCity || null, subject: cSubject, body: cBody }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCampaignError(data?.error || 'Failed to create campaign')
      } else {
        setCName(''); setCSubject(''); setCBody('')
        setShowCampaignForm(false)
        loadCampaigns()
      }
    } catch {
      setCampaignError('Network error')
    }
    setSavingCampaign(false)
  }

  async function startSending(c: Campaign) {
    if (sending[c.id]?.active) return
    sendCancel.current[c.id] = false
    setSending(s => ({ ...s, [c.id]: { active: true, sent: c.sent_count || 0, total: c.total_contacts || 0, failed: 0 } }))

    // Walk batches until the route reports done or the admin pauses. Rate is
    // 50 emails per minute — Resend Pro allows ≥10/sec but slower keeps us
    // outside greylisting territory for the long tail of B2C MX servers.
    const BATCH = 50
    const MIN_GAP_MS = 60_000

    while (true) {
      const batchStart = Date.now()
      let batchResult: any
      try {
        const res = await fetch('/api/admin/outreach/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: c.id, batch_size: BATCH }),
        })
        batchResult = await res.json().catch(() => ({}))
        if (!res.ok) {
          alert(`Send failed: ${batchResult?.error || 'Unknown error'}`)
          break
        }
      } catch {
        alert('Send failed: network error')
        break
      }

      setSending(s => ({
        ...s,
        [c.id]: {
          active: true,
          sent: (s[c.id]?.sent || 0) + (batchResult.sent_in_batch || 0),
          total: c.total_contacts || 0,
          failed: (s[c.id]?.failed || 0) + (batchResult.failed_in_batch || 0),
        },
      }))

      loadCampaigns()

      if (batchResult.done || batchResult.status === 'sent' || batchResult.status === 'paused' || sendCancel.current[c.id]) {
        break
      }

      // Throttle to 50 per minute. The route itself already paces inside the
      // batch; this gap is the gate between batches.
      const elapsed = Date.now() - batchStart
      const wait = Math.max(0, MIN_GAP_MS - elapsed)
      await new Promise(r => setTimeout(r, wait))
    }

    setSending(s => {
      const cur = s[c.id]
      return { ...s, [c.id]: { active: false, sent: cur?.sent || 0, total: cur?.total || 0, failed: cur?.failed || 0 } }
    })
  }

  async function pauseSending(c: Campaign) {
    sendCancel.current[c.id] = true
    try {
      await fetch('/api/admin/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: c.id, action: 'pause' }),
      })
    } catch {}
    loadCampaigns()
  }

  async function resumeSending(c: Campaign) {
    try {
      await fetch('/api/admin/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: c.id, action: 'resume' }),
      })
    } catch {}
    startSending(c)
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign? Sent counts on contacts stay, but the campaign row goes away.')) return
    try {
      await fetch(`/api/admin/outreach/campaigns?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      loadCampaigns()
    } catch {}
  }

  // Preview uses a sample contact (the first contact in the chosen city,
  // falling back to a synthetic placeholder so admins can preview before any
  // upload). Variables are rendered with the same rules as the server.
  const sampleContact = useMemo(() => {
    if (cCity) {
      const m = contacts.find(c => c.city === cCity)
      if (m) return m
    }
    return contacts[0] || { name: 'Anil Sharma', clinic_name: 'Bright Smile Dental', city: cCity || 'mumbai', area: 'Bandra West' }
  }, [contacts, cCity])

  const ordered = useMemo(() => [...CITY_ORDER], [])

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, marginBottom: 6 }}>📧 Outreach</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>
        Cold-email prospect lists, track opens/clicks, and watch registrations roll in.
      </p>

      {/* ---------- CONTACTS ---------- */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>Contacts</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) onUploadFile(file)
              }}
            />
            <button
              style={btnPrimary}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >{uploading ? 'Uploading…' : '⬆ Upload CSV'}</button>
            <button style={btnGhost} onClick={loadContacts}>↻ Refresh</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: -6, marginBottom: 12 }}>
          CSV columns: name, clinic_name, email, phone, city, area (email required, others optional).
        </p>
        {uploadMsg && (
          <div style={{ background: uploadMsg.startsWith('Upload failed') ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${uploadMsg.startsWith('Upload failed') ? '#FECACA' : '#BBF7D0'}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            {uploadMsg}
          </div>
        )}

        {/* City counts */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {ordered.map(slug => {
            const cnt = cityCounts[slug]
            if (!cnt || cnt.total === 0) return null
            return (
              <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '6px 12px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F1923' }}>{CITY_CONFIGS[slug].cityName}</span>
                <span style={{ fontSize: 11, color: '#64748B' }}>{cnt.total}</span>
                <button
                  aria-label={`Delete ${CITY_CONFIGS[slug].cityName} contacts`}
                  onClick={() => bulkDeleteByCity(slug)}
                  style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
                >×</button>
              </div>
            )
          })}
          {Object.keys(cityCounts).length === 0 && (
            <span style={{ fontSize: 13, color: '#94A3B8' }}>No contacts yet — upload a CSV to get started.</span>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={filterCity} onChange={e => setFilterCity(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 160 }}>
            <option value="">All cities</option>
            {ordered.map(slug => <option key={slug} value={slug}>{CITY_CONFIGS[slug].cityName}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 160 }}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="opened">Opened</option>
            <option value="clicked">Clicked</option>
            <option value="registered">Registered</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>

        {/* Contact table */}
        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={th}>Name</th>
                <th style={th}>Clinic</th>
                <th style={th}>Email</th>
                <th style={th}>City</th>
                <th style={th}>Area</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingContacts ? (
                <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94A3B8' }}>No contacts match these filters.</td></tr>
              ) : contacts.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={td}>{c.name || '—'}</td>
                  <td style={td}>{c.clinic_name || '—'}</td>
                  <td style={td}>{c.email}</td>
                  <td style={td}>{cityName(c.city)}</td>
                  <td style={td}>{c.area || '—'}</td>
                  <td style={td}><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {contacts.length >= 200 && (
          <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>Showing the first 200 rows. Use filters above to narrow.</p>
        )}
      </section>

      {/* ---------- CAMPAIGNS ---------- */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>Campaigns</h2>
          <button style={btnPrimary} onClick={() => setShowCampaignForm(v => !v)}>
            {showCampaignForm ? 'Close form' : '+ Create Campaign'}
          </button>
        </div>

        {showCampaignForm && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Internal name</label>
                <input value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. Pune Round 1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <select value={cCity} onChange={e => setCCity(e.target.value)} style={inputStyle}>
                  {ordered.map(slug => <option key={slug} value={slug}>{CITY_CONFIGS[slug].cityName}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>From</label>
                <input value={cCity ? `orders@${CITY_CONFIGS[cCity as CitySlug]?.domain || ''}` : ''} disabled style={{ ...inputStyle, background: '#F1F5F9', color: '#64748B' }} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Subject (variables: {'{name}'} {'{clinic_name}'} {'{city}'} {'{area}'})</label>
              <input value={cSubject} onChange={e => setCSubject(e.target.value)} placeholder="{clinic_name} is missing from dentistin{city}.in" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Body</label>
              <textarea value={cBody} onChange={e => setCBody(e.target.value)} rows={10} style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
            </div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748B' }}>Quick templates:</span>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setCSubject(t.subject); setCBody(t.body) }}
                  style={{ background: 'transparent', border: 'none', color: '#0057A8', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >{t.label}</button>
              ))}
            </div>
            {campaignError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>{campaignError}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnGhost} onClick={() => setPreviewOpen(true)}>👁 Preview</button>
              <button style={btnPrimary} disabled={savingCampaign} onClick={createCampaign}>{savingCampaign ? 'Saving…' : 'Save draft'}</button>
            </div>
          </div>
        )}

        {/* Campaign list */}
        {campaigns.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94A3B8' }}>No campaigns yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {campaigns.map(c => {
              const progress = sending[c.id]
              const total = c.total_contacts || progress?.total || 0
              const sent = c.sent_count || progress?.sent || 0
              const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0
              return (
                <div key={c.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F1923' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{cityName(c.city)} · {c.subject}</div>
                    </div>
                    <CampaignStatusBadge status={c.status} />
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#0057A8', transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B', marginTop: 4 }}>
                      <span>Sending… {sent}/{total} sent {progress?.failed ? `· ${progress.failed} failed` : ''}</span>
                      <span>{pct}%</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
                    <Stat label="Sent" value={c.sent_count} />
                    <Stat label="Opened" value={c.open_count} />
                    <Stat label="Clicked" value={c.click_count} />
                    <Stat label="Registered" value={c.registration_count} color="#15803D" />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {c.status !== 'sent' && !progress?.active && (
                      <button style={btnPrimary} onClick={() => startSending(c)}>▶ Start sending</button>
                    )}
                    {progress?.active && (
                      <button style={btnGhost} onClick={() => pauseSending(c)}>⏸ Pause</button>
                    )}
                    {c.status === 'paused' && !progress?.active && (
                      <button style={btnPrimary} onClick={() => resumeSending(c)}>▶ Resume</button>
                    )}
                    <button style={btnGhost} onClick={() => deleteCampaign(c.id)}>🗑 Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {previewOpen && (
        <PreviewModal
          subject={renderTemplate(cSubject, sampleContact)}
          body={renderTemplate(cBody, sampleContact)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || '#0F1923' }}>{value || 0}</div>
      <div style={{ fontSize: 11, color: '#64748B' }}>{label}</div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0F1923', verticalAlign: 'middle' }

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    pending:    { bg: '#F1F5F9', fg: '#475569' },
    sent:       { bg: '#DBEAFE', fg: '#1D4ED8' },
    opened:     { bg: '#FEF3C7', fg: '#92400E' },
    clicked:    { bg: '#E0E7FF', fg: '#4338CA' },
    registered: { bg: '#DCFCE7', fg: '#166534' },
    bounced:    { bg: '#FEE2E2', fg: '#991B1B' },
  }
  const p = palette[status] || palette.pending
  return <span style={{ background: p.bg, color: p.fg, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{status}</span>
}

function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  const palette: Record<Campaign['status'], { bg: string; fg: string; label: string }> = {
    draft:   { bg: '#F1F5F9', fg: '#475569', label: 'Draft' },
    sending: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Sending' },
    paused:  { bg: '#FEF3C7', fg: '#92400E', label: 'Paused' },
    sent:    { bg: '#DCFCE7', fg: '#166534', label: 'Sent' },
    failed:  { bg: '#FEE2E2', fg: '#991B1B', label: 'Failed' },
  }
  const p = palette[status]
  return <span style={{ background: p.bg, color: p.fg, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{p.label}</span>
}

function cityName(slug: string | null) {
  if (!slug) return '—'
  return Object.prototype.hasOwnProperty.call(CITY_CONFIGS, slug) ? CITY_CONFIGS[slug as CitySlug].cityName : slug
}

function PreviewModal({ subject, body, onClose }: { subject: string; body: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 25, 35, 0.5)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 600, background: '#fff', borderRadius: 14, padding: 0, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Preview</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B' }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Subject</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{subject || <em style={{ color: '#94A3B8' }}>(empty subject)</em>}</div>
          <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Body</div>
          <pre style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, color: '#1F2937' }}>{body || <em style={{ color: '#94A3B8' }}>(empty body)</em>}</pre>
        </div>
      </div>
    </div>
  )
}
