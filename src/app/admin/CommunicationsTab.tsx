'use client'

import { useEffect, useMemo, useState } from 'react'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

type Mode = 'individual' | 'bulk' | 'city'
type Channel = 'email' | 'whatsapp'
type Tier = 'all' | 'free' | 'silver' | 'gold' | 'featured'

interface DentistSlim {
  id: string
  name: string | null
  clinic_name: string | null
  email?: string | null
  city: string | null
  tier?: string | null
}

interface HistoryRow {
  id: string
  sent_by: string
  mode: Mode
  subject: string
  recipient_count: number
  failed_count: number
  city_filters: string[] | null
  tier_filter: string | null
  created_at: string
}

interface Props {
  dentists: DentistSlim[]
}

interface TemplateDef {
  id: string
  label: string
  subject: string
  body: string
}

// Quick-fill templates the admin can click instead of typing from scratch.
// Each ID maps to a subject + body pair; clicking populates both inputs
// (replaces whatever was there, after a confirm if non-empty).
const TEMPLATES: TemplateDef[] = [
  {
    id: 'complete-profile',
    label: 'Complete Your Profile',
    subject: 'Quick wins to attract more patients to your clinic',
    body: `Hope you're doing well!\n\nWe noticed your clinic profile is missing a few details that patients look for before booking. Spending five minutes today can mean significantly more enquiries this week.\n\nPlease consider adding:\n• Profile photo and clinic photos\n• Your WhatsApp number for direct leads\n• Working hours\n• Treatment fee ranges\n\nThanks for being part of the platform!`,
  },
  {
    id: 'upgrade-gold',
    label: 'Upgrade to Gold',
    subject: 'Special offer: Upgrade to Gold and get priority placement',
    body: `Hi there,\n\nA quick note about Gold — our paid tier that places your clinic at the top of search results in your area and unlocks the full analytics dashboard, PMS tools, and direct lead alerts.\n\nFor a limited time, founding members can lock in Gold at the introductory rate. Open your dashboard's Upgrade page to see the details.\n\nWe'd love to have you on Gold.`,
  },
  {
    id: 'patient-portal',
    label: 'Patient Portal Announcement',
    subject: 'Your Patient Portal is Ready — DentistIn',
    body: `Hi,\n\nYour patients can now access their own dental records online through the new Patient Portal.\n\nWhat it is:\n• A secure, self-service page where your patients can view their treatment history, prescriptions, invoices, and reports — anytime\n• Login is by phone-number OTP, so there are no passwords for them to remember\n• You stay in control: the portal is enabled per patient, and you can switch it off at any time\n\nHow to give a patient access:\nOpen your dashboard and go to Patients, select a patient, and use the "Patient Portal" toggle on their profile to enable access. From the patient list you can then share their portal link directly over WhatsApp.\n\nReply to this email if you have any questions — we're happy to help you get started.\n\nThanks for being part of the journey.`,
  },
  {
    id: 'city-offer',
    label: 'Special City Offer',
    subject: 'A city-specific offer for clinics in your area',
    body: `Hi,\n\nWe're running a focused campaign for clinics in <city>. <Describe the offer: e.g. featured placement on the homepage for the next month, a free shoot, a discounted Gold quarter>.\n\nThis is limited to the first <N> clinics that opt in. Reply to this email or message us on WhatsApp to claim your slot.`,
  },
]

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: 'all',      label: 'All dentists' },
  { value: 'free',     label: 'Free tier only' },
  { value: 'silver',   label: 'Silver tier only' },
  { value: 'gold',     label: 'Gold tier only' },
  { value: 'featured', label: 'Featured tier only' },
]

export default function CommunicationsTab({ dentists }: Props) {
  const [mode, setMode] = useState<Mode>('individual')
  const [channel, setChannel] = useState<Channel>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [individualId, setIndividualId] = useState<string>('')
  const [bulkTier, setBulkTier] = useState<Tier>('all')
  const [selectedCities, setSelectedCities] = useState<Set<CitySlug>>(new Set())
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  async function loadHistory() {
    setHistoryError(null)
    try {
      const res = await fetch('/api/admin/communications', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setHistoryError(data?.error || 'Failed to load history')
      else setHistory(data.history ?? [])
    } catch {
      setHistoryError('Network error')
    }
    setHistoryLoading(false)
  }

  useEffect(() => { loadHistory() }, [])

  // Sort dentists by clinic name for the individual dropdown so admins can
  // scan alphabetically rather than scrolling chronological registration order.
  const sortedDentists = useMemo(
    () => [...dentists].sort((a, b) => (a.clinic_name || a.name || '').localeCompare(b.clinic_name || b.name || '')),
    [dentists],
  )

  // Compute recipient count locally for the confirm dialog. The API
  // re-derives this server-side from the live DB (the dentists prop is a
  // ≤100-row snapshot), so this is a UI hint only — the dialog discloses
  // that.
  const estimatedCount = useMemo(() => {
    if (mode === 'individual') return individualId ? 1 : 0
    if (mode === 'bulk') {
      return bulkTier === 'all'
        ? dentists.length
        : dentists.filter(d => d.tier === bulkTier).length
    }
    return dentists.filter(d => d.city && selectedCities.has(d.city as CitySlug)).length
  }, [mode, individualId, bulkTier, dentists, selectedCities])

  function applyTemplate(t: TemplateDef) {
    if ((subject || body) && !confirm('Replace the current subject and message with this template?')) return
    setSubject(t.subject)
    setBody(t.body)
  }

  function validate(): string | null {
    if (!subject.trim()) return 'Subject is required'
    if (!body.trim()) return 'Message body is required'
    if (mode === 'individual' && !individualId) return 'Pick a dentist'
    if (mode === 'city' && selectedCities.size === 0) return 'Pick at least one city'
    return null
  }

  function openConfirm() {
    const v = validate()
    if (v) { setError(v); return }
    setError(null); setResult(null); setConfirmOpen(true)
  }

  async function send() {
    setSending(true); setError(null)
    const payload: any = { mode, subject: subject.trim(), message: body.trim(), channel }
    if (mode === 'individual') payload.targets = individualId
    if (mode === 'bulk') payload.targets = bulkTier
    if (mode === 'city') payload.cityFilters = Array.from(selectedCities)
    try {
      const res = await fetch('/api/admin/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Send failed')
      } else {
        setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, total: data.total ?? 0 })
        // Pull the freshly-logged row in so the audit panel reflects this
        // blast without a full page reload. loadHistory clears its own
        // error state, so a previous failure won't stick.
        loadHistory()
      }
    } catch {
      setError('Network error')
    }
    setSending(false); setConfirmOpen(false)
  }

  function toggleCity(slug: CitySlug) {
    setSelectedCities(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 6 }}>📣 Communications</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>
        Send announcements, nudges, and offers to dentists. Email today; WhatsApp coming soon.
      </p>

      {/* Mode tabs */}
      <div role="tablist" style={{ display: 'flex', gap: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 4, marginBottom: 20, maxWidth: 540 }}>
        {(['individual', 'bulk', 'city'] as Mode[]).map(m => {
          const on = mode === m
          return (
            <button
              key={m} role="tab" aria-selected={on}
              onClick={() => { setMode(m); setResult(null); setError(null) }}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
                background: on ? 'var(--blue)' : 'transparent',
                color: on ? '#fff' : 'var(--text-secondary)',
                fontWeight: on ? 700 : 600, fontSize: 13, cursor: 'pointer',
                fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              }}>
              {m === 'individual' ? 'Individual' : m === 'bulk' ? 'Bulk' : 'City-wise'}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }} className="comms-grid">
        {/* LEFT — controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Targets */}
          <div style={card}>
            <h3 style={cardTitle}>Recipients</h3>
            {mode === 'individual' && (
              <select value={individualId} onChange={e => setIndividualId(e.target.value)} style={inputStyle}>
                <option value="">— Select a dentist —</option>
                {sortedDentists.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.clinic_name || d.name} {d.name && d.clinic_name ? `· ${d.name}` : ''} {d.city ? `(${CITY_CONFIGS[d.city as CitySlug]?.cityName ?? d.city})` : ''}
                  </option>
                ))}
              </select>
            )}
            {mode === 'bulk' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TIER_OPTIONS.map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: bulkTier === opt.value ? 'var(--blue-light)' : 'transparent', border: `1px solid ${bulkTier === opt.value ? '#BFDBFE' : 'transparent'}` }}>
                    <input type="radio" name="tier" value={opt.value} checked={bulkTier === opt.value} onChange={() => setBulkTier(opt.value)} style={{ accentColor: 'var(--blue)' }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
            {mode === 'city' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                {(Object.keys(CITY_CONFIGS) as CitySlug[]).map(slug => {
                  const cfg = CITY_CONFIGS[slug]
                  const on = selectedCities.has(slug)
                  return (
                    <label key={slug} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--blue-light)' : 'transparent', border: `1px solid ${on ? '#BFDBFE' : 'var(--border)'}`, fontSize: 13 }}>
                      <input type="checkbox" checked={on} onChange={() => toggleCity(slug)} style={{ accentColor: 'var(--blue)' }} />
                      <span style={{ fontWeight: 500 }}>{cfg.cityName}</span>
                    </label>
                  )
                })}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              {mode === 'individual' && (individualId ? 'Will send to this dentist.' : 'Pick a dentist above.')}
              {mode === 'bulk' && `${estimatedCount} dentist${estimatedCount === 1 ? '' : 's'} match this filter${''}.`}
              {mode === 'city' && (selectedCities.size === 0 ? 'Pick at least one city above.' : `${estimatedCount} dentist${estimatedCount === 1 ? '' : 's'} in selected cities${''}.`)}
            </p>
          </div>

          {/* Templates */}
          <div style={card}>
            <h3 style={cardTitle}>Quick Templates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} style={templateBtn}>
                  <span style={{ fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{t.subject}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Composer */}
          <div style={card}>
            <h3 style={cardTitle}>Message</h3>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={fieldLabel}>Subject *</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject of the email" style={inputStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={fieldLabel}>Body *</span>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message. Newlines are preserved. HTML is escaped — type plain text." rows={8} style={{ ...inputStyle, resize: 'vertical', minHeight: 140, fontFamily: 'var(--font-body)' }} />
            </label>
            <div>
              <span style={fieldLabel}>Channel</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['email', 'whatsapp'] as Channel[]).map(c => {
                  const disabled = c === 'whatsapp'
                  const on = channel === c && !disabled
                  return (
                    <button
                      key={c}
                      onClick={() => !disabled && setChannel(c)}
                      disabled={disabled}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                        background: on ? 'var(--blue-light)' : '#fff',
                        color: disabled ? 'var(--muted)' : on ? 'var(--blue-dark)' : 'var(--text)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-body)',
                      }}>
                      {c === 'email' ? '📧 Email' : '💬 WhatsApp (soon)'}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13 }}>
              {error}
            </div>
          )}
          {result && (
            <div style={{ background: result.failed === 0 ? '#DCFCE7' : '#FEF3C7', border: `1px solid ${result.failed === 0 ? '#BBF7D0' : '#FDE68A'}`, color: result.failed === 0 ? '#166534' : '#92400E', padding: '12px 14px', borderRadius: 10, fontSize: 13 }}>
              <strong>Done.</strong> Sent {result.sent} of {result.total}{result.failed > 0 ? `, ${result.failed} failed.` : '.'}
            </div>
          )}

          <button
            onClick={openConfirm}
            disabled={sending}
            style={{
              padding: '13px 22px', background: 'var(--blue)', color: '#fff',
              border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)',
              fontWeight: 700, fontSize: 15, cursor: sending ? 'not-allowed' : 'pointer',
              opacity: sending ? 0.7 : 1, alignSelf: 'flex-start', minHeight: 48,
            }}>
            {sending ? 'Sending…' : '📨 Send Message'}
          </button>
        </div>

        {/* RIGHT — preview */}
        <div style={{ ...card, position: 'sticky', top: 16, alignSelf: 'flex-start' }} className="comms-preview">
          <h3 style={cardTitle}>Preview</h3>
          <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}><strong>Subject:</strong> {subject || '— subject will appear here —'}</div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {body || '— message body will appear here —'}
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Dentists receive this with their city's branded header and an "Open Dashboard" button at the bottom.
            </div>
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div style={modalBackdrop} onClick={() => !sending && setConfirmOpen(false)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Confirm send</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
              You are about to send to <strong>{estimatedCount} dentist{estimatedCount === 1 ? '' : 's'}</strong>. Confirm?
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
              This action sends real emails. There is no undo. The final recipient list is re-derived from the live database at send time, so the actual count may differ slightly from the estimate above if any dentists have been added or deactivated since this page loaded.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => !sending && setConfirmOpen(false)} disabled={sending} style={subtleBtn}>Cancel</button>
              <button onClick={send} disabled={sending} style={{ padding: '10px 18px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}>
                {sending ? 'Sending…' : 'Send now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SENT HISTORY — last 50 blasts, newest first. Audit trail only;
          per-recipient delivery state lives in Resend, not here. */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Sent History</h2>
          <button onClick={loadHistory} style={subtleBtn} disabled={historyLoading}>
            {historyLoading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {historyError ? (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13 }}>
            {historyError}
          </div>
        ) : history.length === 0 && !historyLoading ? (
          <div style={{ background: '#fff', border: '1px dashed var(--border)', borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            No communications sent yet. Your first blast will appear here.
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Date', 'Subject', 'Mode', 'Filter', 'Sent', 'Failed', 'By'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={historyCell}>
                      <div style={{ fontWeight: 600 }}>{new Date(row.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(row.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td style={{ ...historyCell, maxWidth: 280 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.subject}>{row.subject}</div>
                    </td>
                    <td style={historyCell}>
                      <span style={modePill(row.mode)}>{modeLabel(row.mode)}</span>
                    </td>
                    <td style={{ ...historyCell, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {row.mode === 'bulk' && (row.tier_filter && row.tier_filter !== 'all' ? `Tier: ${row.tier_filter}` : 'All dentists')}
                      {row.mode === 'city' && Array.isArray(row.city_filters) && row.city_filters.length > 0
                        ? row.city_filters.map(c => CITY_CONFIGS[c as CitySlug]?.cityName ?? c).join(', ')
                        : ''}
                      {row.mode === 'individual' && '—'}
                    </td>
                    <td style={historyCell}>
                      <span style={{ fontWeight: 700, color: '#166534' }}>{row.recipient_count}</span>
                    </td>
                    <td style={historyCell}>
                      <span style={{ fontWeight: 700, color: row.failed_count > 0 ? '#991B1B' : 'var(--muted)' }}>{row.failed_count}</span>
                    </td>
                    <td style={{ ...historyCell, fontSize: 12, color: 'var(--muted)' }}>{row.sent_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .comms-grid { grid-template-columns: 1fr !important; }
          .comms-preview { position: static !important; }
        }
      `}</style>
    </div>
  )
}

function modeLabel(m: Mode): string {
  return m === 'individual' ? 'Individual' : m === 'bulk' ? 'Bulk' : 'City'
}

function modePill(m: Mode): React.CSSProperties {
  const palette = m === 'individual'
    ? { bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' }
    : m === 'bulk'
      ? { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' }
      : { bg: '#F3E8FF', color: '#7E22CE', border: '#E9D5FF' }
  return { padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: palette.bg, color: palette.color, border: `1px solid ${palette.border}`, whiteSpace: 'nowrap' }
}

const historyCell: React.CSSProperties = { padding: '12px 14px', fontSize: 13, verticalAlign: 'middle' }

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18,
}
const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14,
  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)',
  marginBottom: 12,
}
const fieldLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14, outline: 'none',
  fontFamily: 'var(--font-body)', background: '#fff', boxSizing: 'border-box',
}
const templateBtn: React.CSSProperties = {
  textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
  padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer',
}
const subtleBtn: React.CSSProperties = {
  padding: '10px 16px', background: '#fff', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 8,
  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15, 25, 35, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 300, padding: 16,
}
const modalCard: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 460,
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
}
