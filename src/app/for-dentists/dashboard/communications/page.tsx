'use client'

// Dashboard Communications tab. Pick a template (or write from scratch),
// pick a channel (email or WhatsApp), pick recipients (one / selected /
// all), filter the patient list by recent activity or treatment, hit
// Send. Opted-out patients are filtered server-side by the API; this
// page mirrors that on the count badge so the dentist sees the same
// number that will actually receive the message.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'individual' | 'selected' | 'all'
type Channel = 'email' | 'whatsapp'
type LastVisitWindow = 'all' | '30' | '60' | '90'

interface Patient {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  opt_out_communications: boolean | null
  last_visit?: string | null
  treatments?: string[]
}

interface HistoryRow {
  id: string
  channel: Channel
  mode: Mode
  subject: string | null
  message: string
  recipients_count: number
  failed_count: number
  status: string
  sent_at: string
}

interface TemplateDef {
  id: string
  label: string
  subject: string
  body: string
}

// Each template has a tags-friendly body so the dentist can rip the
// {patient_name} stub out if they don't want it. Bodies are plain text
// with literal newlines; the API/email layer escapes HTML.
const TEMPLATES: TemplateDef[] = [
  {
    id: 'appointment-reminder',
    label: 'Appointment Reminder',
    subject: 'Reminder: Your appointment at {clinic_name}',
    body: `Hi {patient_name},\n\nThis is a friendly reminder of your upcoming appointment at {clinic_name}.\n\nPlease arrive 5 minutes early. If you need to reschedule, just reply to this message or call us on {clinic_phone}.\n\nSee you soon!\n— {dentist_name}`,
  },
  {
    id: 'offer',
    label: 'Offer / Discount',
    subject: 'A special offer for you at {clinic_name}',
    body: `Hi {patient_name},\n\nWe're running a limited-time offer at {clinic_name}. <Add details: e.g. 20% off cleaning this month, complimentary X-ray with consultation, etc.>\n\nCall {clinic_phone} to book your slot.\n\n— {dentist_name}`,
  },
  {
    id: 'holiday',
    label: 'Holiday Announcement',
    subject: '{clinic_name} closure notice',
    body: `Dear {patient_name},\n\nPlease note that {clinic_name} will be closed on <date> for <reason>. We'll resume normal hours on <date>.\n\nFor emergencies during this period, call {clinic_phone}.\n\n— {dentist_name}`,
  },
  {
    id: 'new-service',
    label: 'New Service',
    subject: 'New at {clinic_name}: <treatment name>',
    body: `Hi {patient_name},\n\nWe've just added <treatment name> at {clinic_name}. <One-line description of what it does and who benefits>.\n\nIf you'd like to know more or book a consultation, reply to this message or call {clinic_phone}.\n\n— {dentist_name}`,
  },
  {
    id: 'follow-up',
    label: 'Follow-up Care',
    subject: 'Following up on your visit',
    body: `Hi {patient_name},\n\nHow are you feeling after your last visit at {clinic_name}? If you have any concerns about the treatment or your recovery, please reach out — we're here to help.\n\nCall {clinic_phone} or just reply to this message.\n\n— {dentist_name}`,
  },
  {
    id: 'birthday',
    label: 'Birthday Wishes',
    subject: 'Happy birthday from {clinic_name}!',
    body: `Happy birthday, {patient_name}! 🎉\n\nWishing you a wonderful year ahead from everyone at {clinic_name}.\n\nAs a small gift, we'd love to offer you a complimentary <freebie> on your next visit — just mention this message when you book.\n\n— {dentist_name}`,
  },
]

const PERSONALIZATION_TAGS: Array<{ tag: string; label: string }> = [
  { tag: '{patient_name}', label: 'Patient name' },
  { tag: '{clinic_name}',  label: 'Clinic name' },
  { tag: '{dentist_name}', label: 'Dentist name' },
  { tag: '{clinic_phone}', label: 'Clinic phone' },
]

const WHATSAPP_TAB_BATCH = 10
const WHATSAPP_TAB_DELAY_MS = 1000

export default function CommunicationsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [treatmentsAvailable, setTreatmentsAvailable] = useState<string[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])

  const [mode, setMode] = useState<Mode>('selected')
  const [channel, setChannel] = useState<Channel>('email')
  const [templateId, setTemplateId] = useState<string>('custom')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [search, setSearch] = useState('')
  const [lastVisitWindow, setLastVisitWindow] = useState<LastVisitWindow>('all')
  const [treatmentFilter, setTreatmentFilter] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [individualId, setIndividualId] = useState<string>('')

  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; total: number; message?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }

      const { data: dentist } = await supabase
        .from('dentists').select('id').eq('email', user.email).maybeSingle()
      if (!dentist) { setLoading(false); return }
      setDentistId(dentist.id)

      const [{ data: pts }, { data: appts }, { data: hist }] = await Promise.all([
        supabase.from('patients')
          .select('id, name, phone, email, opt_out_communications')
          .eq('dentist_id', dentist.id)
          .order('name'),
        supabase.from('appointments')
          .select('patient_id, appt_date, treatments(name)')
          .eq('dentist_id', dentist.id),
        supabase.from('communications_log')
          .select('id, channel, mode, subject, message, recipients_count, failed_count, status, sent_at')
          .eq('dentist_id', dentist.id)
          .order('sent_at', { ascending: false })
          .limit(20),
      ])

      // Index appointments by patient so we can attach last_visit and the
      // set of treatments to each Patient row. last_visit is the max
      // appt_date — past, future, doesn't matter; the filter window is
      // "days since the most recent appointment".
      const byPatient = new Map<string, { last: string | null; treatments: Set<string> }>()
      for (const a of (appts ?? []) as any[]) {
        const entry = byPatient.get(a.patient_id) || { last: null, treatments: new Set<string>() }
        if (a.appt_date && (!entry.last || a.appt_date > entry.last)) entry.last = a.appt_date
        const tName = a.treatments?.name
        if (tName) entry.treatments.add(tName)
        byPatient.set(a.patient_id, entry)
      }

      const list = ((pts ?? []) as Patient[]).map(p => {
        const ix = byPatient.get(p.id)
        return { ...p, last_visit: ix?.last ?? null, treatments: ix ? Array.from(ix.treatments) : [] }
      })
      setPatients(list)
      setTreatmentsAvailable(Array.from(new Set(list.flatMap(p => p.treatments || []))).sort())
      setHistory((hist ?? []) as HistoryRow[])
      setLoading(false)
    }
    load()
  }, [router])

  // The filtered list reflects search + last-visit window + treatment.
  // Opted-out patients are surfaced visually (greyed, disabled) but
  // included in the list so the dentist knows they exist and chose to
  // skip them rather than wondering where they went.
  const filtered = useMemo(() => {
    const now = Date.now()
    const cutoffMs = lastVisitWindow === 'all' ? null : now - parseInt(lastVisitWindow) * 24 * 60 * 60 * 1000
    const q = search.trim().toLowerCase()
    return patients.filter(p => {
      if (q) {
        const hay = `${p.name ?? ''} ${p.phone ?? ''} ${p.email ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (cutoffMs) {
        if (!p.last_visit) return false
        if (new Date(p.last_visit).getTime() < cutoffMs) return false
      }
      if (treatmentFilter && !(p.treatments || []).includes(treatmentFilter)) return false
      return true
    })
  }, [patients, search, lastVisitWindow, treatmentFilter])

  function applyTemplate(id: string) {
    setTemplateId(id)
    if (id === 'custom') {
      // Don't wipe what the dentist has typed if they're switching back
      // to Custom from a preset; just stop highlighting any template.
      return
    }
    const tpl = TEMPLATES.find(t => t.id === id)
    if (!tpl) return
    setSubject(tpl.subject)
    setBody(tpl.body)
  }

  function insertTag(tag: string) {
    setBody(b => b + tag)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    const eligible = filtered.filter(p => !p.opt_out_communications && (channel === 'email' ? p.email : p.phone))
    setSelectedIds(new Set(eligible.map(p => p.id)))
  }

  function clearSelection() { setSelectedIds(new Set()) }

  // Effective recipient count — drives the Send button label and the
  // confirm dialog. Mirrors the server-side filter in
  // /api/dentist/communications/send so the dentist sees the same N
  // the API will actually message.
  const effectiveRecipientIds = useMemo(() => {
    let list: Patient[] = []
    if (mode === 'all') list = patients
    else if (mode === 'selected') list = patients.filter(p => selectedIds.has(p.id))
    else if (mode === 'individual') list = individualId ? patients.filter(p => p.id === individualId) : []
    return list
      .filter(p => !p.opt_out_communications)
      .filter(p => channel === 'email' ? !!p.email : !!p.phone)
      .map(p => p.id)
  }, [mode, patients, selectedIds, individualId, channel])

  async function handleSend() {
    setError(null); setResult(null); setSending(true)
    try {
      const res = await fetch('/api/dentist/communications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, channel,
          subject: channel === 'email' ? subject : undefined,
          message: body,
          patient_ids: mode === 'all' ? undefined : effectiveRecipientIds,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Send failed.')
        setSending(false)
        setConfirmOpen(false)
        return
      }
      if (channel === 'whatsapp' && Array.isArray(data.whatsapp_links)) {
        // Open in tabs with a small stagger so the browser doesn't
        // refuse the pop-ups. WHATSAPP_TAB_BATCH at a time, then a
        // 1s pause before the next batch. The user clicked Send, so
        // the first window.open is a direct response to user input —
        // the browser allows subsequent opens within ~1s.
        const links: Array<{ url: string }> = data.whatsapp_links
        for (let i = 0; i < links.length; i += WHATSAPP_TAB_BATCH) {
          const batch = links.slice(i, i + WHATSAPP_TAB_BATCH)
          for (const l of batch) window.open(l.url, '_blank', 'noopener,noreferrer')
          if (i + WHATSAPP_TAB_BATCH < links.length) {
            await new Promise(r => setTimeout(r, WHATSAPP_TAB_DELAY_MS))
          }
        }
        setResult({ sent: data.sent, failed: data.failed, total: data.total, message: 'WhatsApp tabs opened. Send each message manually.' })
      } else {
        setResult({ sent: data.sent, failed: data.failed, total: data.total })
      }
      setConfirmOpen(false)
      // Refresh history so the new blast shows up at the top.
      const supabase = createClient()
      const { data: hist } = await supabase.from('communications_log')
        .select('id, channel, mode, subject, message, recipients_count, failed_count, status, sent_at')
        .eq('dentist_id', dentistId)
        .order('sent_at', { ascending: false })
        .limit(20)
      setHistory((hist ?? []) as HistoryRow[])
    } catch (e: any) {
      setError(e?.message || 'Network error.')
    } finally {
      setSending(false)
    }
  }

  // Toggle a patient's opt-out flag inline. Cheaper than a full
  // preferences page and the dentist often wants to do this right
  // after a patient asks to be removed.
  async function toggleOptOut(p: Patient) {
    const supabase = createClient()
    const next = !p.opt_out_communications
    const { error: e } = await supabase
      .from('patients')
      .update({ opt_out_communications: next })
      .eq('id', p.id)
      .select('id')
    if (e) { alert(`Could not update: ${e.message}`); return }
    setPatients(prev => prev.map(x => x.id === p.id ? { ...x, opt_out_communications: next } : x))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Communications</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Send appointment reminders, offers, and updates to your patients via email or WhatsApp. Opted-out patients are automatically skipped.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18 }} className="comms-grid">
        {/* Left column — compose */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 22 }}>
          {/* Channel switcher */}
          <SectionLabel>Channel</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {(['email', 'whatsapp'] as Channel[]).map(c => (
              <button key={c} type="button" onClick={() => setChannel(c)}
                style={{
                  padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: channel === c ? 'var(--blue)' : 'var(--bg)',
                  color: channel === c ? '#fff' : 'var(--text)',
                  border: channel === c ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>
                {c === 'email' ? '📧 Email' : '💬 WhatsApp'}
              </button>
            ))}
          </div>
          {channel === 'whatsapp' && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginBottom: 18 }}>
              WhatsApp opens one tab per patient with the message pre-filled. You'll need to hit Send in each tab manually — Business API integration is coming.
            </div>
          )}

          {/* Send mode */}
          <SectionLabel>Send to</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {([
              { v: 'individual', label: 'One patient' },
              { v: 'selected',   label: 'Selected patients' },
              { v: 'all',        label: 'All my patients' },
            ] as Array<{ v: Mode; label: string }>).map(opt => (
              <button key={opt.v} type="button" onClick={() => setMode(opt.v)}
                style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: mode === opt.v ? 'var(--blue-light)' : '#fff',
                  color: mode === opt.v ? 'var(--blue)' : 'var(--text)',
                  border: `1.5px solid ${mode === opt.v ? 'var(--blue)' : 'var(--border)'}`,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Template picker */}
          <SectionLabel>Template</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {TEMPLATES.map(t => (
              <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
                style={{
                  padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: templateId === t.id ? 'var(--blue)' : '#fff',
                  color: templateId === t.id ? '#fff' : 'var(--text)',
                  border: `1.5px solid ${templateId === t.id ? 'var(--blue)' : 'var(--border)'}`,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>
                {t.label}
              </button>
            ))}
            <button type="button" onClick={() => applyTemplate('custom')}
              style={{
                padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: templateId === 'custom' ? 'var(--blue)' : '#fff',
                color: templateId === 'custom' ? '#fff' : 'var(--text)',
                border: `1.5px solid ${templateId === 'custom' ? 'var(--blue)' : 'var(--border)'}`,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>
              Custom
            </button>
          </div>

          {/* Subject (email only) */}
          {channel === 'email' && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>Subject</SectionLabel>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}

          {/* Message body */}
          <div style={{ marginBottom: 10 }}>
            <SectionLabel>Message</SectionLabel>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} placeholder="Write your message…"
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Insert tag:</span>
              {PERSONALIZATION_TAGS.map(t => (
                <button key={t.tag} type="button" onClick={() => insertTag(t.tag)}
                  style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'monospace', background: '#F3F4F6', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text)' }}>
                  {t.tag}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              Tags are replaced per recipient — {'{patient_name}'} becomes the patient's actual name in each message.
            </p>
          </div>

          {/* Errors + result */}
          {error && <Banner kind="error">{error}</Banner>}
          {result && (
            <Banner kind={result.failed === 0 ? 'success' : 'warn'}>
              {channel === 'email'
                ? `Sent ${result.sent} of ${result.total}${result.failed ? ` — ${result.failed} failed` : ''}.`
                : (result.message || `Opened ${result.sent} WhatsApp tabs.`)}
            </Banner>
          )}

          {/* Send */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Will reach <strong style={{ color: 'var(--text)' }}>{effectiveRecipientIds.length}</strong> patient{effectiveRecipientIds.length === 1 ? '' : 's'} (opted-out skipped).
            </div>
            <button type="button" onClick={() => setConfirmOpen(true)}
              disabled={sending || effectiveRecipientIds.length === 0 || !body.trim() || (channel === 'email' && !subject.trim())}
              style={{
                padding: '11px 22px', minHeight: 44, fontSize: 14, fontWeight: 700,
                background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: (sending || effectiveRecipientIds.length === 0 || !body.trim()) ? 0.5 : 1,
                fontFamily: 'var(--font-body)',
              }}>
              {sending ? 'Sending…' : channel === 'email' ? 'Send Emails' : 'Open WhatsApp Tabs'}
            </button>
          </div>
        </div>

        {/* Right column — recipient picker */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 18, position: 'sticky', top: 0, alignSelf: 'start', maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
          <SectionLabel>Recipients</SectionLabel>

          {mode === 'individual' ? (
            <select value={individualId} onChange={e => setIndividualId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', marginBottom: 12 }}>
              <option value="">Select a patient…</option>
              {patients
                .filter(p => !p.opt_out_communications && (channel === 'email' ? p.email : p.phone))
                .map(p => <option key={p.id} value={p.id}>{p.name} {p.phone ? `· ${p.phone}` : ''}</option>)}
            </select>
          ) : mode === 'all' ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, padding: '12px 0' }}>
              Sending to every patient on your roster who hasn't opted out and has a {channel === 'email' ? 'valid email' : 'phone number'}.
            </p>
          ) : (
            <>
              {/* Filters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email…"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select value={lastVisitWindow} onChange={e => setLastVisitWindow(e.target.value as LastVisitWindow)}
                    style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
                    <option value="all">Any visit date</option>
                    <option value="30">Visited in last 30 days</option>
                    <option value="60">Visited in last 60 days</option>
                    <option value="90">Visited in last 90 days</option>
                  </select>
                  <select value={treatmentFilter} onChange={e => setTreatmentFilter(e.target.value)}
                    style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
                    <option value="">Any treatment</option>
                    {treatmentsAvailable.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <button type="button" onClick={selectAllVisible}
                    style={{ flex: 1, padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    Select all visible
                  </button>
                  <button type="button" onClick={clearSelection}
                    style={{ flex: 1, padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    Clear ({selectedIds.size})
                  </button>
                </div>
              </div>

              {/* Patient list */}
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>No patients match.</div>
                ) : filtered.map(p => {
                  const blocked = !!p.opt_out_communications
                  const unreachable = channel === 'email' ? !p.email : !p.phone
                  const checked = selectedIds.has(p.id)
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', cursor: blocked || unreachable ? 'not-allowed' : 'pointer', background: checked ? 'var(--blue-light)' : '#fff', opacity: blocked || unreachable ? 0.5 : 1 }}>
                      <input type="checkbox" checked={checked} disabled={blocked || unreachable} onChange={() => toggleSelect(p.id)} style={{ accentColor: 'var(--blue)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {channel === 'email' ? (p.email || 'no email') : (p.phone || 'no phone')}
                          {p.last_visit ? ` · last ${new Date(p.last_visit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                        </div>
                      </div>
                      <button type="button" onClick={e => { e.preventDefault(); toggleOptOut(p) }}
                        title={blocked ? 'Opted out — click to re-include' : 'Opt this patient out of communications'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: blocked ? '#DC2626' : 'var(--muted)' }}>
                        {blocked ? '🚫' : '·'}
                      </button>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* History */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginTop: 18 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Recent Sends</h2>
        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>No messages sent yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {h.channel === 'email' ? '📧' : '💬'} {h.subject || h.message.split('\n')[0].slice(0, 60)}
                  </div>
                  <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                    {new Date(h.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    {' · '}{h.mode}{' · '}{h.recipients_count} sent{h.failed_count ? ` · ${h.failed_count} failed` : ''}
                    {h.status !== 'sent' ? ` · ${h.status}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
              {channel === 'email' ? 'Send to' : 'Open WhatsApp tabs for'} {effectiveRecipientIds.length} patient{effectiveRecipientIds.length === 1 ? '' : 's'}?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
              {channel === 'email'
                ? 'Emails go out in batches of 10 with a one-second gap. This may take a few seconds.'
                : `Your browser will open ${effectiveRecipientIds.length} WhatsApp tabs in groups of 10. Allow pop-ups if asked.`}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmOpen(false)} disabled={sending}
                style={{ padding: '10px 18px', minHeight: 44, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={handleSend} disabled={sending}
                style={{ padding: '10px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1, fontFamily: 'var(--font-body)' }}>
                {sending ? 'Sending…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 980px) {
          .comms-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 8 }}>{children}</div>
}

function Banner({ kind, children }: { kind: 'error' | 'success' | 'warn'; children: React.ReactNode }) {
  const palette = kind === 'error'
    ? { bg: '#FEE2E2', border: '#FECACA', text: '#991B1B' }
    : kind === 'success'
      ? { bg: '#DCFCE7', border: '#BBF7D0', text: '#166534' }
      : { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E' }
  return (
    <div style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text, padding: '10px 12px', borderRadius: 8, fontSize: 12, marginTop: 12 }}>
      {children}
    </div>
  )
}
