'use client'

// Admin Events tab: the review queue for dentistinindia.in events and
// courses, whether submitted by organisers / dentists or found by the
// monthly auto-search. Approve, edit, reject (a paid one becomes "refund
// due": refund it in the Razorpay dashboard, then mark it refunded), create
// a pay link for a Featured request, and run the search on demand.

import { useCallback, useEffect, useMemo, useState } from 'react'

type Ev = Record<string, any>
type Run = { id: string; trigger: string; started_at: string; finished_at: string | null; found: number; added: number; searches: number; cost_usd: number | null; error: string | null }
type Filter = 'review' | 'paid' | 'search' | 'live' | 'rejected' | 'all'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }
const pill = (bg: string, color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color })
const btn = (kind: 'ok' | 'plain' | 'no' | 'blue' = 'plain'): React.CSSProperties => ({
  minHeight: 38, padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  border: kind === 'ok' ? '1px solid #047857' : kind === 'blue' ? '1px solid #1D4ED8' : '1px solid #CBD5E1',
  background: kind === 'ok' ? '#047857' : kind === 'blue' ? '#1D4ED8' : '#fff',
  color: kind === 'ok' || kind === 'blue' ? '#fff' : kind === 'no' ? '#B91C1C' : '#0F1923',
})
const input: React.CSSProperties = { width: '100%', minHeight: 40, padding: '0 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }

const rs = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
const fmtDate = (d: string | null) => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function coverage(e: Ev): string {
  if (e.plan !== 'featured') return ''
  const where = e.feature_all_india ? 'All India' : (e.feature_cities || []).join(' + ') || 'no city'
  return `${where} · ${e.feature_days || '?'} days · alerts to ~${e.alert_dentists ?? '?'} dentists`
}

export default function EventsTab() {
  const [events, setEvents] = useState<Ev[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [paidMonth, setPaidMonth] = useState(0)
  const [paymentsOn, setPaymentsOn] = useState(false)
  const [alertsOn, setAlertsOn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('review')
  const [busy, setBusy] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchMsg, setSearchMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<Ev | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/events', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Could not load')
      setEvents(data.events || []); setRuns(data.runs || []); setPaidMonth(data.paid_this_month || 0)
      setPaymentsOn(!!data.payments_on); setAlertsOn(!!data.alerts_on)
    } catch (e: any) { setError(e?.message || 'Could not load') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(id + action)
    try {
      const res = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) })
      const data = await res.json()
      if (!res.ok) { setToast(data?.error || 'Failed'); return false }
      setEvents(prev => prev.map(e => e.id === id ? data.event : e))
      setToast('Saved')
      return true
    } catch { setToast('Network error'); return false } finally { setBusy(null) }
  }

  async function searchNow() {
    setSearching(true); setSearchMsg('Searching the web for upcoming events. This takes 2 to 4 minutes, keep this page open…')
    try {
      const res = await fetch('/api/admin/events/search', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) setSearchMsg(data?.error || 'Search failed')
      else setSearchMsg(`Done: found ${data.found}, ${data.added} new waiting for review. ${data.searches} searches, about $${data.cost_usd}.${data.errors?.length ? ` Problems: ${data.errors.join('; ')}` : ''}`)
      await load()
    } catch { setSearchMsg('The search is still running or the connection dropped. Reload in a few minutes to see new events.') }
    setSearching(false)
  }

  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10)
  const counts = useMemo(() => ({
    review: events.filter(e => e.status === 'pending').length,
    unpaid: events.filter(e => e.plan === 'featured' && e.payment_status === 'pending' && e.status !== 'rejected').length,
    refund: events.filter(e => e.payment_status === 'refund_due').length,
  }), [events])
  const shown = events.filter(e => {
    if (filter === 'review') return e.status === 'pending'
    if (filter === 'paid') return e.plan === 'featured'
    if (filter === 'search') return e.source === 'search'
    if (filter === 'live') return e.status === 'approved' && (e.ends_on || e.starts_on) >= today
    if (filter === 'rejected') return e.status === 'rejected'
    return true
  }).sort((a, b) => {
    // Paid first, then Featured waiting for payment, then by start date.
    const rank = (e: Ev) => e.payment_status === 'paid' ? 0 : e.payment_status === 'refund_due' ? 0 : e.plan === 'featured' ? 1 : 2
    return rank(a) - rank(b) || String(a.starts_on).localeCompare(String(b.starts_on))
  })
  const lastRun = runs[0]

  const chip = (k: Filter, label: string) => (
    <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
      style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: filter === k ? 700 : 500, background: filter === k ? '#0F1923' : '#fff', color: filter === k ? '#fff' : '#0F1923', border: filter === k ? '1px solid #0F1923' : '1px solid #CBD5E1' }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Events and courses</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>Everything here waits for you before it shows on dentistinindia.in/events.</p>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <b style={{ fontSize: 14 }}>Monthly search</b>
            <div style={{ fontSize: 13, color: '#475569' }}>
              {lastRun
                ? `Last run ${fmtDate(lastRun.started_at)} (${lastRun.trigger === 'manual' ? 'Search now' : 'monthly'}) · found ${lastRun.found}, ${lastRun.added} new${lastRun.cost_usd != null ? ` · about $${lastRun.cost_usd}` : ''}${lastRun.finished_at ? '' : ' · still running or stopped'}`
                : 'No run yet. Runs by itself on the 1st of every month.'}
            </div>
            {lastRun?.error && <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 4 }}>Problem: {lastRun.error}</div>}
          </div>
          <button type="button" onClick={searchNow} disabled={searching} style={{ ...btn('blue'), minHeight: 44, padding: '0 18px' }}>{searching ? 'Searching…' : 'Search now'}</button>
        </div>
        {searchMsg && <div style={{ fontSize: 13, color: '#334155', background: '#F8FAFC', borderRadius: 8, padding: 10 }}>{searchMsg}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {[
          ['To review', String(counts.review)],
          ['Paid this month', rs(paidMonth)],
          ['Payment pending', String(counts.unpaid)],
          ['Refund due', String(counts.refund)],
        ].map(([l, v]) => (
          <div key={l} style={{ ...card, alignItems: 'center', padding: 12 }}>
            <b style={{ fontSize: 20 }}>{v}</b><span style={{ fontSize: 12, color: '#475569' }}>{l}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: '#475569' }}>
        Payments: <b style={{ color: paymentsOn ? '#047857' : '#B45309' }}>{paymentsOn ? 'on' : 'off'}</b> · Alerts to dentists: <b style={{ color: alertsOn ? '#047857' : '#B45309' }}>{alertsOn ? 'on' : 'off (dry run)'}</b>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chip('review', `To review (${counts.review})`)}{chip('paid', 'Featured')}{chip('search', 'Found by search')}{chip('live', 'Live')}{chip('rejected', 'Rejected')}{chip('all', 'All')}
      </div>

      {loading && <div style={{ color: '#475569', fontSize: 14 }}>Loading…</div>}
      {error && <div style={{ color: '#B91C1C', fontSize: 14 }}>{error}</div>}
      {!loading && !shown.length && <div style={{ ...card, color: '#475569', fontSize: 14 }}>Nothing here.</div>}

      {shown.map(e => {
        const featured = e.plan === 'featured'
        const b = (a: string) => busy === e.id + a
        return (
          <div key={e.id} style={card}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {featured && e.payment_status === 'paid' && <span style={pill('#F59E0B', '#1F1300')}>Featured · {rs(e.amount_rupees)} paid</span>}
              {featured && e.payment_status === 'pending' && <span style={pill('#FEF2F2', '#B91C1C')}>Payment pending · {rs(e.amount_rupees)}</span>}
              {e.payment_status === 'refund_due' && <span style={pill('#FEF2F2', '#B91C1C')}>Refund due · {rs(e.amount_rupees)}</span>}
              {e.payment_status === 'refunded' && <span style={pill('#F1F5F9', '#334155')}>Refunded</span>}
              {!featured && <span style={pill('#ECFDF5', '#065F46')}>Free</span>}
              {e.source === 'search' && <span style={pill('#FEF3C7', '#92400E')}>Found by search</span>}
              <span style={pill('#EFF6FF', '#1D4ED8')}>{e.kind === 'course' ? 'Course' : e.kind}</span>
              <span style={pill(e.status === 'approved' ? '#DCFCE7' : e.status === 'rejected' ? '#FEE2E2' : '#F1F5F9', e.status === 'approved' ? '#166534' : e.status === 'rejected' ? '#991B1B' : '#334155')}>{e.status === 'approved' ? 'Live' : e.status}</span>
              {e.custom_alert_request && <span style={pill('#F5F3FF', '#5B21B6')}>Custom alert asked</span>}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{e.title}</div>
            <div style={{ fontSize: 13, color: '#475569' }}>
              {e.is_online ? 'Online' : (e.city || 'No city')} · {fmtDate(e.starts_on)}{e.ends_on && e.ends_on !== e.starts_on ? ` to ${fmtDate(e.ends_on)}` : ''}{e.fee_text ? ` · ${e.fee_text}` : ''}
              {e.organiser ? ` · by ${e.organiser}` : ''}
            </div>
            {(e.submitter_email || e.submitter_phone) && <div style={{ fontSize: 13, color: '#475569' }}>Contact: {[e.submitter_email, e.submitter_phone].filter(Boolean).join(' · ')}</div>}
            {featured && <div style={{ fontSize: 13, color: '#0F1923', fontWeight: 600 }}>Bought: {coverage(e)}</div>}
            {e.link && <div style={{ fontSize: 13 }}><a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: '#1D4ED8', wordBreak: 'break-all' }}>{e.link}</a>{e.source === 'search' ? ' (check the dates on this page before approving)' : ''}</div>}
            {e.description && <div style={{ fontSize: 13, color: '#334155' }}>{e.description}</div>}
            {e.custom_alert_request && <div style={{ fontSize: 13, color: '#5B21B6', background: '#F5F3FF', borderRadius: 8, padding: 8 }}>Custom alert asked: “{e.custom_alert_request}”. Agree a price with them and send a Razorpay link from the dashboard.</div>}
            {featured && e.status === 'approved' && (
              <div style={{ fontSize: 12, color: '#475569' }}>
                Featured until {fmtDate(e.featured_until)} · live alert {e.alert_live_sent_at ? `sent ${fmtDate(e.alert_live_sent_at)}` : 'not sent yet'} · 2-day reminder {e.alert_reminder_sent_at ? `sent ${fmtDate(e.alert_reminder_sent_at)}` : 'not sent yet'}
              </div>
            )}
            {e.payment_link_url && e.payment_status === 'pending' && <div style={{ fontSize: 12, color: '#475569' }}>Pay link: <a href={e.payment_link_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1D4ED8' }}>{e.payment_link_url}</a></div>}
            {e.admin_note && <div style={{ fontSize: 12, color: '#475569' }}>Note: {e.admin_note}</div>}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {e.status !== 'approved' && <button type="button" style={btn('ok')} disabled={b('approve')} onClick={() => act(e.id, 'approve')}>{b('approve') ? '…' : 'Approve'}</button>}
              <button type="button" style={btn()} onClick={() => setEditing({ ...e })}>Edit</button>
              {e.status !== 'rejected' && (
                <button type="button" style={btn('no')} disabled={b('reject')} onClick={() => {
                  const note = window.prompt(e.payment_status === 'paid' ? 'Reason (it will be marked refund due):' : 'Reason (optional):') ?? null
                  if (note !== null) act(e.id, 'reject', { note })
                }}>{e.payment_status === 'paid' ? 'Reject + refund' : 'Reject'}</button>
              )}
              {featured && e.payment_status === 'pending' && !e.payment_link_url && paymentsOn && <button type="button" style={btn()} disabled={b('create_link')} onClick={() => act(e.id, 'create_link')}>Create pay link</button>}
              {featured && e.payment_status === 'pending' && <button type="button" style={btn()} disabled={b('mark_paid')} onClick={() => { if (window.confirm(`Mark ${rs(e.amount_rupees)} as received outside Razorpay?`)) act(e.id, 'mark_paid') }}>Mark paid</button>}
              {featured && e.payment_status === 'pending' && <button type="button" style={btn()} disabled={b('make_free')} onClick={() => act(e.id, 'make_free')}>Make free</button>}
              {e.payment_status === 'refund_due' && <button type="button" style={btn()} disabled={b('mark_refunded')} onClick={() => { if (window.confirm('Refunded in the Razorpay dashboard?')) act(e.id, 'mark_refunded') }}>Mark refunded</button>}
            </div>
          </div>
        )
      })}

      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Edit listing" style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b style={{ fontSize: 17 }}>Edit listing</b>
            {([['title', 'Name'], ['organiser', 'Organiser'], ['city', 'City (slug like pune, or a name)'], ['fee_text', 'Fee'], ['link', 'Link'], ['admin_note', 'Private note']] as const).map(([k, l]) => (
              <label key={k} style={{ fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>{l}
                <input style={input} value={editing[k] ?? ''} onChange={ev => setEditing({ ...editing, [k]: ev.target.value })} />
              </label>
            ))}
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1, fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>Starts
                <input type="date" style={input} value={editing.starts_on || ''} onChange={ev => setEditing({ ...editing, starts_on: ev.target.value })} />
              </label>
              <label style={{ flex: 1, fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>Ends
                <input type="date" style={input} value={editing.ends_on || ''} onChange={ev => setEditing({ ...editing, ends_on: ev.target.value })} />
              </label>
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>Type
              <select style={input} value={editing.kind} onChange={ev => setEditing({ ...editing, kind: ev.target.value })}>
                {['conference', 'exhibition', 'seminar', 'study_club', 'course'].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!editing.is_online} onChange={ev => setEditing({ ...editing, is_online: ev.target.checked })} /> Online
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>Description
              <textarea rows={3} style={{ ...input, padding: 10, minHeight: 80 }} value={editing.description ?? ''} onChange={ev => setEditing({ ...editing, description: ev.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btn()} onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" style={btn('blue')} onClick={async () => {
                const f = editing
                const ok = await act(f.id, 'edit', { fields: { title: f.title, organiser: f.organiser ?? '', city: f.city ?? '', fee_text: f.fee_text ?? '', link: f.link ?? '', admin_note: f.admin_note ?? '', starts_on: f.starts_on, ends_on: f.ends_on || '', kind: f.kind, is_online: !!f.is_online, description: f.description ?? '' } })
                if (ok) setEditing(null)
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" onClick={() => setToast(null)} style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0F1923', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 14, zIndex: 1001, cursor: 'pointer' }}>{toast}</div>
      )}
    </div>
  )
}
