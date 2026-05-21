'use client'

// Cold-email outreach console. Three sections, top to bottom:
//
//   A. Contacts — CSV upload with a client-side preview pass that reports
//      valid / duplicate / invalid counts BEFORE the admin commits, then
//      posts the validated rows to /api/admin/outreach/contacts/upload.
//      By-city counts rendered as pills below the upload.
//   B. Campaigns — create form (city, subject, body with variable hints,
//      preview), and a list table with status + funnel counts.
//   C. Send — start/pause/resume the selected campaign with a 50-per-min
//      pacing loop driven from the client (so a Vercel function timeout
//      can't strand a half-sent batch).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

interface Campaign {
  id: string
  name: string
  city: string | null
  subject: string
  body: string
  status: 'draft' | 'sending' | 'sent' | 'paused'
  total_contacts: number
  sent_count: number
  open_count: number
  click_count: number
  registration_count: number
  created_at: string
  sent_at: string | null
}

interface Contact {
  id: string
  name: string | null
  clinic_name: string | null
  email: string
  city: string | null
  status: string
}

type CityCounts = Record<string, number>

interface ParsedPreview {
  valid: Array<{ sr_no?: string; name: string; clinic_name: string | null; email: string; city: string | null }>
  invalidCount: number
  duplicateCount: number
  totalRows: number
}

const CITY_ORDER: CitySlug[] = [
  'mumbai', 'pune', 'thane', 'nashik', 'nagpur', 'goa', 'surat',
  'kolhapur', 'sambhajinagar', 'rajkot', 'ahmedabad', 'jamnagar', 'navimumbai',
]

const DEFAULT_TEMPLATE = {
  subject: 'Quick note for Dr. {name}',
  body: `Hi Dr. {name},

I came across your clinic {clinic_name} and wanted to reach out personally.

A few dentists in {city} have been using dentistinindia.in to connect with peers and share clinical cases. I thought you might find it useful too.

It's a professional network built specifically for dentists — you can share before/after cases, connect with specialists nearby, and your clinic gets listed on dentistin{city_lower}.in automatically.

If you're curious: https://dentistinindia.in/join

Happy to answer any questions — just reply to this email.

Dr. Team
DentistIn India`,
}

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

// ---------- CSV parsing (client-side, with preview-friendly counts) ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += ch }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { cur.push(field); field = '' }
      else if (ch === '\n') { cur.push(field); field = ''; rows.push(cur); cur = [] }
      else if (ch === '\r') {/* swallow */}
      else field += ch
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows
}

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/
const TLD_TYPOS = ['.vom', '.cim', '.comcom', '.cmo', '.conm', '.con', '.coom', '.comm']

function isValidEmail(v: string): boolean {
  const t = v.trim().toLowerCase()
  if (!EMAIL_RE.test(t)) return false
  for (const bad of TLD_TYPOS) {
    if (t.endsWith(bad)) return false
  }
  const atIdx = t.indexOf('@')
  const domain = t.slice(atIdx + 1)
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false
  return true
}

function normalizeCity(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v)) return v
  return v || null
}

// Map the user's CSV columns (Sr No, Dentist Name, Clinic Name, Email, City)
// to column indices. Tolerant of capitalisation and small variants.
function findCol(header: string[], aliases: string[]): number {
  const norm = header.map(h => h.trim().toLowerCase())
  for (const a of aliases) {
    const idx = norm.indexOf(a)
    if (idx !== -1) return idx
  }
  return -1
}

function parseAndValidate(csvText: string): ParsedPreview {
  const rows = parseCsv(csvText.trim())
  if (rows.length < 2) return { valid: [], invalidCount: 0, duplicateCount: 0, totalRows: 0 }

  const header = rows[0]
  const colSrNo  = findCol(header, ['sr no', 'sr_no', 'srno', '#', 's.no', 'sno'])
  const colName  = findCol(header, ['dentist name', 'name', 'dentist', 'dentist_name', 'doctor'])
  const colClin  = findCol(header, ['clinic name', 'clinic_name', 'clinic'])
  const colEmail = findCol(header, ['email', 'e-mail', 'email_address'])
  const colCity  = findCol(header, ['city', 'town'])

  const valid: ParsedPreview['valid'] = []
  const seen = new Set<string>()
  let invalidCount = 0
  let duplicateCount = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length === 0 || (r.length === 1 && !r[0].trim())) continue
    const email = (colEmail > -1 ? (r[colEmail] || '') : '').trim().toLowerCase()
    const name  = (colName  > -1 ? (r[colName]  || '') : '').trim()
    if (!isValidEmail(email) || !name) { invalidCount++; continue }
    if (seen.has(email)) { duplicateCount++; continue }
    seen.add(email)
    valid.push({
      sr_no: colSrNo > -1 ? (r[colSrNo] || '').trim() : undefined,
      name,
      clinic_name: colClin > -1 && (r[colClin] || '').trim() ? r[colClin].trim() : null,
      email,
      city: normalizeCity(colCity > -1 ? (r[colCity] || null) : null),
    })
  }

  return { valid, invalidCount, duplicateCount, totalRows: rows.length - 1 }
}

// ---------- Variable rendering for preview ----------

function cityLowerSlug(input: string): string {
  return (input || '').toLowerCase().trim().replace(/\s+/g, '')
}

function renderTemplate(input: string, ctx: { name?: string | null; clinic_name?: string | null; city?: string | null; email?: string | null }): string {
  return input.replace(/\{(name|clinic_name|city|city_lower|email|first_name)\}/g, (_m, key) => {
    if (key === 'first_name') return (ctx.name || '').split(/\s+/)[0] || 'there'
    if (key === 'city_lower') return cityLowerSlug(ctx.city || '')
    if (key === 'city') return cityDisplayName(ctx.city)
    const v = (ctx as any)[key]
    return v == null || v === '' ? '' : String(v)
  })
}

function cityDisplayName(slug: string | null | undefined): string {
  if (!slug) return ''
  if (Object.prototype.hasOwnProperty.call(CITY_CONFIGS, slug)) return CITY_CONFIGS[slug as CitySlug].cityName
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

// ---------- Component ----------

export default function OutreachTab() {
  // Contacts
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [previewFileName, setPreviewFileName] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [cityCounts, setCityCounts] = useState<CityCounts>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sample contact (for preview rendering)
  const [sampleContact, setSampleContact] = useState<Contact | null>(null)

  // Campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [showForm, setShowForm] = useState(false)
  const [cName, setCName] = useState('')
  const [cCity, setCCity] = useState<string>('')
  const [cSubject, setCSubject] = useState(DEFAULT_TEMPLATE.subject)
  const [cBody, setCBody] = useState(DEFAULT_TEMPLATE.body)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [savingCampaign, setSavingCampaign] = useState(false)
  const [campaignError, setCampaignError] = useState<string | null>(null)

  // Send progress, keyed by campaign id
  const [sendProgress, setSendProgress] = useState<Record<string, { active: boolean; sent: number; total: number; failed: number }>>({})
  const sendCancelRef = useRef<Record<string, boolean>>({})

  // Per-row test-send state. testEmailFor holds the campaign id whose row
  // is currently expanded; null collapses every row.
  const [testEmailFor, setTestEmailFor] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/outreach/contacts', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const counts: CityCounts = {}
        const raw = (data.city_counts || {}) as Record<string, { total?: number } | number>
        for (const [k, v] of Object.entries(raw)) {
          counts[k] = typeof v === 'number' ? v : (v?.total ?? 0)
        }
        setCityCounts(counts)
        const sample = (data.contacts || [])[0] || null
        setSampleContact(sample)
      }
    } catch {}
  }, [])

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/outreach/campaigns', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setCampaigns(data.campaigns || [])
    } catch {}
  }, [])

  useEffect(() => { loadCounts(); loadCampaigns() }, [loadCounts, loadCampaigns])

  // ---- Upload flow ----

  async function onFile(file: File) {
    setImportMsg(null)
    setPreviewFileName(file.name)
    const text = await file.text()
    const result = parseAndValidate(text)
    setPreview(result)
  }

  async function confirmImport() {
    if (!preview || preview.valid.length === 0) return
    setImporting(true); setImportMsg(null)
    try {
      const res = await fetch('/api/admin/outreach/contacts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: preview.valid }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportMsg(`Import failed: ${data?.error || 'Unknown error'}`)
      } else {
        setImportMsg(`Imported ${data.inserted}. ${data.duplicates_skipped} already existed, ${data.invalid_skipped} invalid.`)
        setPreview(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        loadCounts()
      }
    } catch {
      setImportMsg('Import failed: network error')
    }
    setImporting(false)
  }

  function cancelPreview() {
    setPreview(null)
    setPreviewFileName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---- Campaign create ----

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
      if (!res.ok) setCampaignError(data?.error || 'Failed to create campaign')
      else {
        setCName('')
        setCSubject(DEFAULT_TEMPLATE.subject)
        setCBody(DEFAULT_TEMPLATE.body)
        setShowForm(false)
        loadCampaigns()
      }
    } catch {
      setCampaignError('Network error')
    }
    setSavingCampaign(false)
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign?')) return
    try {
      await fetch(`/api/admin/outreach/campaigns?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      loadCampaigns()
    } catch {}
  }

  // ---- Send loop ----

  async function startSending(c: Campaign) {
    if (sendProgress[c.id]?.active) return
    sendCancelRef.current[c.id] = false
    setSendProgress(s => ({ ...s, [c.id]: { active: true, sent: c.sent_count || 0, total: c.total_contacts || 0, failed: 0 } }))

    const BATCH = 50
    const MIN_GAP_MS = 60_000

    while (true) {
      const batchStart = Date.now()
      let batchResult: any
      try {
        const res = await fetch('/api/admin/outreach/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: c.id, batch_size: BATCH }),
        })
        batchResult = await res.json().catch(() => ({}))
        if (!res.ok) { alert(`Send failed: ${batchResult?.error || 'Unknown error'}`); break }
      } catch {
        alert('Send failed: network error')
        break
      }

      setSendProgress(s => {
        const prev = s[c.id] || { active: true, sent: c.sent_count || 0, total: c.total_contacts || 0, failed: 0 }
        return {
          ...s,
          [c.id]: {
            active: true,
            sent: prev.sent + (batchResult.sent_in_batch || 0),
            total: prev.total,
            failed: prev.failed + (batchResult.failed_in_batch || 0),
          },
        }
      })

      loadCampaigns()

      if (batchResult.done || batchResult.status === 'sent' || batchResult.status === 'paused' || sendCancelRef.current[c.id]) {
        break
      }

      const elapsed = Date.now() - batchStart
      const wait = Math.max(0, MIN_GAP_MS - elapsed)
      await new Promise(r => setTimeout(r, wait))
    }

    setSendProgress(s => {
      const cur = s[c.id]
      return { ...s, [c.id]: { active: false, sent: cur?.sent || 0, total: cur?.total || 0, failed: cur?.failed || 0 } }
    })
  }

  async function pauseSending(c: Campaign) {
    sendCancelRef.current[c.id] = true
    try {
      await fetch('/api/admin/outreach/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: c.id, action: 'pause' }),
      })
    } catch {}
    loadCampaigns()
  }

  async function sendTest(campaignId: string) {
    const to = testEmail.trim()
    if (!to) return
    setTestSending(true); setTestMsg(null)
    try {
      const res = await fetch('/api/admin/outreach/campaigns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, test_email: to }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setTestMsg(`Test failed: ${data?.error || 'Unknown error'}`)
      else setTestMsg(`✓ Test sent to ${to}`)
    } catch {
      setTestMsg('Test failed: network error')
    }
    setTestSending(false)
  }

  async function resumeSending(c: Campaign) {
    try {
      await fetch('/api/admin/outreach/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: c.id, action: 'resume' }),
      })
    } catch {}
    startSending(c)
  }

  // ---- Render ----

  const previewSample = useMemo(() => {
    if (sampleContact) return sampleContact
    if (preview && preview.valid[0]) return preview.valid[0]
    return { name: 'Anil Sharma', clinic_name: 'Bright Smile Dental', city: cCity || 'mumbai', email: 'anil@example.com' }
  }, [sampleContact, preview, cCity])

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, marginBottom: 6 }}>📧 Outreach</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>
        Cold-email prospect lists, track opens/clicks, and watch registrations roll in.
      </p>

      {/* ---------- SECTION A — CONTACTS UPLOAD ---------- */}
      <section style={cardStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Contacts</h2>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 0, marginBottom: 14 }}>
          CSV columns: <code>Sr No, Dentist Name, Clinic Name, Email, City</code>. Email and Dentist Name are required.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          />
          <button style={btnPrimary} onClick={() => fileInputRef.current?.click()}>⬆ Choose CSV</button>
          {previewFileName && <span style={{ fontSize: 13, color: '#475569' }}>{previewFileName}</span>}
        </div>

        {preview && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 10 }}>
              Found <strong style={{ color: '#15803D' }}>{preview.valid.length} valid contacts</strong>,
              {' '}<strong>{preview.duplicateCount} duplicates skipped</strong>,
              {' '}<strong style={{ color: '#B91C1C' }}>{preview.invalidCount} invalid emails skipped</strong>
              {' '}<span style={{ color: '#64748B' }}>(out of {preview.totalRows} rows)</span>.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnPrimary} disabled={importing || preview.valid.length === 0} onClick={confirmImport}>
                {importing ? 'Importing…' : `Import ${preview.valid.length} contacts`}
              </button>
              <button style={btnGhost} onClick={cancelPreview} disabled={importing}>Cancel</button>
            </div>
          </div>
        )}

        {importMsg && (
          <div style={{ background: importMsg.startsWith('Import failed') ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${importMsg.startsWith('Import failed') ? '#FECACA' : '#BBF7D0'}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            {importMsg}
          </div>
        )}

        {/* By-city pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {Object.entries(cityCounts).length === 0 ? (
            <span style={{ fontSize: 13, color: '#94A3B8' }}>No contacts yet.</span>
          ) : (
            CITY_ORDER.filter(s => cityCounts[s]).map(slug => (
              <span key={slug} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#0F1923' }}>
                {CITY_CONFIGS[slug].cityName}: {cityCounts[slug]}
              </span>
            ))
          )}
          {/* Surface unrecognised cities at the end so admins notice them. */}
          {Object.entries(cityCounts)
            .filter(([k]) => !CITY_ORDER.includes(k as CitySlug))
            .map(([k, v]) => (
              <span key={k} style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#92400E' }}>
                {k}: {v}
              </span>
            ))}
        </div>
      </section>

      {/* ---------- SECTION B — CAMPAIGNS ---------- */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>Campaigns</h2>
          <button style={btnPrimary} onClick={() => setShowForm(v => !v)}>{showForm ? 'Close form' : '+ Create Campaign'}</button>
        </div>

        {showForm && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Campaign name (internal)</label>
                <input value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. Pune Round 1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>City filter</label>
                <select value={cCity} onChange={e => setCCity(e.target.value)} style={inputStyle}>
                  <option value="">All India (every pending contact)</option>
                  {CITY_ORDER.map(slug => <option key={slug} value={slug}>{CITY_CONFIGS[slug].cityName}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Subject (variables: {'{name}'} {'{clinic_name}'} {'{city}'} {'{city_lower}'})</label>
              <input value={cSubject} onChange={e => setCSubject(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Body (variables: {'{name}'} {'{clinic_name}'} {'{city}'} {'{city_lower}'} {'{email}'})</label>
              <textarea value={cBody} onChange={e => setCBody(e.target.value)} rows={14} style={{ ...inputStyle, minHeight: 260, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
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

        {/* Campaign list table */}
        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={th}>Name</th>
                <th style={th}>City</th>
                <th style={th}>Status</th>
                <th style={th}>Sent</th>
                <th style={th}>Opened</th>
                <th style={th}>Clicked</th>
                <th style={th}>Registered</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: '#94A3B8' }}>No campaigns yet.</td></tr>
              ) : campaigns.map(c => {
                const progress = sendProgress[c.id]
                const total = c.total_contacts || progress?.total || 0
                const sent = c.sent_count || progress?.sent || 0
                const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{c.subject}</div>
                    </td>
                    <td style={td}>{c.city ? cityDisplayName(c.city) : 'All India'}</td>
                    <td style={td}><CampaignStatusBadge status={c.status} /></td>
                    <td style={td}>
                      {sent}/{total}
                      {progress?.active && (
                        <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, marginTop: 4, width: 80 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#0057A8', borderRadius: 2 }} />
                        </div>
                      )}
                    </td>
                    <td style={td}>{c.open_count || 0}</td>
                    <td style={td}>{c.click_count || 0}</td>
                    <td style={{ ...td, color: '#15803D', fontWeight: 600 }}>{c.registration_count || 0}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.status !== 'sent' && !progress?.active && (
                          <button style={smallBtnPrimary} onClick={() => startSending(c)}>▶ Send</button>
                        )}
                        {progress?.active && (
                          <button style={smallBtnGhost} onClick={() => pauseSending(c)}>⏸ Pause</button>
                        )}
                        {c.status === 'paused' && !progress?.active && (
                          <button style={smallBtnPrimary} onClick={() => resumeSending(c)}>▶ Resume</button>
                        )}
                        <button style={smallBtnGhost} onClick={() => {
                          if (testEmailFor === c.id) { setTestEmailFor(null); setTestMsg(null) }
                          else { setTestEmailFor(c.id); setTestEmail(''); setTestMsg(null) }
                        }}>✉ Test</button>
                        <button style={smallBtnGhost} onClick={() => deleteCampaign(c.id)}>🗑</button>
                      </div>
                      {testEmailFor === c.id && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ ...labelStyle, marginBottom: 0 }}>Send test to</label>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <input
                              type="email"
                              value={testEmail}
                              placeholder="your@email.com"
                              onChange={e => setTestEmail(e.target.value)}
                              style={{ ...inputStyle, flex: '1 1 180px', minWidth: 180 }}
                            />
                            <button
                              style={smallBtnPrimary}
                              disabled={testSending || !testEmail.trim()}
                              onClick={() => sendTest(c.id)}
                            >
                              {testSending ? 'Sending…' : 'Send Test'}
                            </button>
                          </div>
                          {testMsg && (
                            <div style={{ fontSize: 12, color: testMsg.startsWith('✓') ? '#15803D' : '#B91C1C' }}>{testMsg}</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {previewOpen && (
        <PreviewModal
          subject={renderTemplate(cSubject, previewSample)}
          body={renderTemplate(cBody, previewSample)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0F1923', verticalAlign: 'middle' }
const smallBtnPrimary: React.CSSProperties = { padding: '5px 10px', minHeight: 28, background: '#0057A8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const smallBtnGhost: React.CSSProperties = { padding: '5px 10px', minHeight: 28, background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }

function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  const palette: Record<Campaign['status'], { bg: string; fg: string; label: string }> = {
    draft:   { bg: '#F1F5F9', fg: '#475569', label: 'Draft' },
    sending: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Sending' },
    paused:  { bg: '#FEF3C7', fg: '#92400E', label: 'Paused' },
    sent:    { bg: '#DCFCE7', fg: '#166534', label: 'Sent' },
  }
  const p = palette[status]
  return <span style={{ background: p.bg, color: p.fg, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{p.label}</span>
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
