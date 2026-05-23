'use client'

// Recall reminders dashboard. Lists every scheduled "you're due for a
// checkup" ping for the dentist's patients, with quick actions to send
// now, snooze a week, or mark complete. Auto-created when an appointment
// is closed out as 'completed' (6 months out by default); also manually
// created from the patient profile.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ReminderType = '6month_checkup' | 'annual_cleaning' | 'follow_up' | 'custom'
type Channel = 'sms' | 'whatsapp' | 'email'
type Status = 'pending' | 'sent' | 'completed' | 'cancelled'
type FilterKey = 'week' | 'month' | 'overdue' | 'sent' | 'all'

interface RecallRow {
  id: string
  patient_id: string | null
  dentist_id: string
  reminder_type: ReminderType | null
  due_date: string
  status: Status
  sent_at: string | null
  message_channel: Channel | null
  notes: string | null
  created_at: string
  patients: { id: string; name: string | null; phone: string | null; email: string | null } | null
}

interface LastVisitRow { patient_id: string | null; appt_date: string }

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

const TYPE_LABEL: Record<ReminderType, string> = {
  '6month_checkup': '6-month checkup',
  annual_cleaning: 'Annual cleaning',
  follow_up: 'Follow-up',
  custom: 'Custom',
}

const CHANNEL_LABEL: Record<Channel, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
}

const STATUS_META: Record<Status, { label: string; bg: string; text: string }> = {
  pending:   { label: 'Pending',   bg: '#FEF3C7', text: '#92400E' },
  sent:      { label: 'Sent',      bg: '#DBEAFE', text: '#1D4ED8' },
  completed: { label: 'Booked',    bg: '#DCFCE7', text: '#166534' },
  cancelled: { label: 'Cancelled', bg: '#FEE2E2', text: '#991B1B' },
}

export default function RecallsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RecallRow[]>([])
  const [lastVisitByPatient, setLastVisitByPatient] = useState<Map<string, string>>(new Map())
  // Land on 'all' so the dentist always sees every recall on first paint —
  // 'week' as a default looks broken when the only recall is overdue or
  // sent (the time-window match is empty even though rows exist).
  const [filter, setFilter] = useState<FilterKey>('all')
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).maybeSingle()
      if (!dentist) { setLoading(false); return }

      const [{ data: rc }, { data: appts }] = await Promise.all([
        // Deliberately no due_date / status filter — the page needs the
        // full list so the All tab and the summary tiles (overdue, sent,
        // total) are all driven from a single fetch. The visible filter
        // is applied client-side in `filtered` below.
        supabase
          .from('recall_reminders')
          .select('*, patients(id, name, phone, email)')
          .eq('dentist_id', dentist.id)
          .order('due_date', { ascending: true }),
        supabase
          .from('appointments')
          .select('patient_id, appt_date, status')
          .eq('dentist_id', dentist.id)
          .eq('status', 'completed')
          .not('patient_id', 'is', null)
          .order('appt_date', { ascending: false }),
      ])

      setRows(((rc ?? []) as unknown) as RecallRow[])
      // Build patient_id → most-recent completed visit date map. Sorted
      // descending above, so the first appearance per patient is the
      // newest visit — skip any subsequent ones to keep map writes O(n).
      const lv = new Map<string, string>()
      for (const a of (appts ?? []) as LastVisitRow[]) {
        if (!a.patient_id) continue
        if (!lv.has(a.patient_id)) lv.set(a.patient_id, a.appt_date)
      }
      setLastVisitByPatient(lv)
      setLoading(false)
    }
    load()
  }, [router])

  const today = todayIso()
  const weekEnd = isoDaysFromToday(7)
  const monthEnd = isoDaysFromToday(30)

  const counts = useMemo(() => {
    const c = { week: 0, month: 0, overdue: 0, sent: 0, all: rows.length }
    for (const r of rows) {
      if (r.status === 'pending') {
        if (r.due_date < today) c.overdue++
        if (r.due_date >= today && r.due_date <= weekEnd) c.week++
        if (r.due_date >= today && r.due_date <= monthEnd) c.month++
      }
      if (r.status === 'sent') c.sent++
    }
    return c
  }, [rows, today, weekEnd, monthEnd])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all') return true
      if (filter === 'sent') return r.status === 'sent'
      if (r.status !== 'pending') return false
      if (filter === 'overdue') return r.due_date < today
      if (filter === 'week') return r.due_date >= today && r.due_date <= weekEnd
      if (filter === 'month') return r.due_date >= today && r.due_date <= monthEnd
      return true
    })
  }, [rows, filter, today, weekEnd, monthEnd])

  async function snooze(row: RecallRow) {
    setBusyRow(row.id); setActionError(null)
    const supabase = createClient()
    const newDate = addDaysIso(row.due_date, 7)
    const { data, error } = await supabase
      .from('recall_reminders')
      .update({ due_date: newDate })
      .eq('id', row.id)
      .select('*, patients(id, name, phone, email)')
      .single()
    setBusyRow(null)
    if (error || !data) { setActionError(error?.message || 'Snooze failed.'); return }
    setRows(prev => prev.map(r => r.id === row.id ? (data as unknown as RecallRow) : r))
    showToast(`Snoozed to ${fmtDate(newDate)}`)
  }

  async function markComplete(row: RecallRow) {
    setBusyRow(row.id); setActionError(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('recall_reminders')
      .update({ status: 'completed' })
      .eq('id', row.id)
      .select('*, patients(id, name, phone, email)')
      .single()
    setBusyRow(null)
    if (error || !data) { setActionError(error?.message || 'Update failed.'); return }
    setRows(prev => prev.map(r => r.id === row.id ? (data as unknown as RecallRow) : r))
    showToast('Marked complete')
  }

  async function cancel(row: RecallRow) {
    if (!confirm('Cancel this recall? The patient will not be notified.')) return
    setBusyRow(row.id); setActionError(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('recall_reminders')
      .update({ status: 'cancelled' })
      .eq('id', row.id)
      .select('*, patients(id, name, phone, email)')
      .single()
    setBusyRow(null)
    if (error || !data) { setActionError(error?.message || 'Cancel failed.'); return }
    setRows(prev => prev.map(r => r.id === row.id ? (data as unknown as RecallRow) : r))
    showToast('Recall cancelled')
  }

  async function sendNow(row: RecallRow) {
    setBusyRow(row.id); setActionError(null)
    try {
      const res = await fetch(`/api/dentist/recalls/${row.id}/send`, { method: 'POST' })
      const body = await res.json().catch(() => ({} as { message?: string; error?: string; channel?: string }))
      if (!res.ok) {
        setActionError(body.message || body.error || 'Send failed.')
        return
      }
      // Re-fetch the row so sent_at + status reflect the post-send state.
      const supabase = createClient()
      const { data } = await supabase
        .from('recall_reminders')
        .select('*, patients(id, name, phone, email)')
        .eq('id', row.id)
        .maybeSingle()
      if (data) setRows(prev => prev.map(r => r.id === row.id ? (data as unknown as RecallRow) : r))
      showToast(`Sent via ${body.channel || row.message_channel || 'SMS'}`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusyRow(null)
    }
  }

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 4000)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading recalls…</div>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Recall Reminders</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Scheduled {'"you\'re due for a checkup"'} pings. Auto-created when a visit is marked complete; or schedule one manually from a patient&apos;s profile.
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={tileGrid}>
        <Tile icon="📅" label="Due this week"  value={String(counts.week)} />
        <Tile icon="🗓️" label="Due this month" value={String(counts.month)} />
        <Tile icon="⚠️" label="Overdue"        value={String(counts.overdue)} accent={counts.overdue > 0 ? '#DC2626' : 'var(--text)'} />
        <Tile icon="📤" label="Sent"           value={String(counts.sent)} />
        <Tile icon="📋" label="Total"          value={String(counts.all)} />
      </div>

      {actionError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {toast && (
        <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>✓ {toast}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { k: 'week',    label: `This Week (${counts.week})` },
          { k: 'month',   label: `This Month (${counts.month})` },
          { k: 'overdue', label: `⚠ Overdue (${counts.overdue})` },
          { k: 'sent',    label: `Sent (${counts.sent})` },
          { k: 'all',     label: `All (${counts.all})` },
        ] as { k: FilterKey; label: string }[]).map(t => (
          <button key={t.k} onClick={() => setFilter(t.k)}
            style={{
              padding: '7px 14px', borderRadius: 20,
              background: filter === t.k ? 'var(--blue)' : '#fff',
              color:      filter === t.k ? '#fff' : 'var(--text)',
              border: `1.5px solid ${filter === t.k ? 'var(--blue)' : 'var(--border)'}`,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>{t.label}</button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          {rows.length === 0
            ? 'No recall reminders yet. They\'re created automatically when you mark a visit complete.'
            : 'No recalls match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => {
            const overdue = r.status === 'pending' && r.due_date < today
            const sc = STATUS_META[r.status]
            const lastVisit = r.patient_id ? lastVisitByPatient.get(r.patient_id) : null
            const channel = r.message_channel || 'sms'
            const isClosed = r.status === 'completed' || r.status === 'cancelled'
            return (
              <div key={r.id} style={{
                background: '#fff',
                border: `1px solid ${overdue ? '#FECACA' : 'var(--border)'}`,
                borderLeft: overdue ? '4px solid #DC2626' : '1px solid var(--border)',
                borderRadius: 12, padding: '14px 18px',
                display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    {r.patients?.id ? (
                      <Link href={`/for-dentists/dashboard/patients/${r.patients.id}`}
                        style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', textDecoration: 'none' }}>
                        {r.patients.name || 'Patient'}
                      </Link>
                    ) : <span style={{ fontWeight: 700, fontSize: 15 }}>Unlinked patient</span>}
                    {r.reminder_type && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6' }}>
                        {TYPE_LABEL[r.reminder_type]}
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
                    {overdue && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B' }}>⚠ Overdue</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {r.patients?.phone && <span>📞 {r.patients.phone}</span>}
                    {lastVisit && <span>🕐 Last visit {fmtDate(lastVisit)}</span>}
                    <span style={{ color: overdue ? '#991B1B' : 'var(--muted)' }}>📅 Due {fmtDate(r.due_date)}</span>
                    <span>📨 via {CHANNEL_LABEL[channel as Channel]}</span>
                    {r.sent_at && <span>✓ Sent {fmtDate(r.sent_at)}</span>}
                  </div>
                  {r.notes && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>&ldquo;{r.notes}&rdquo;</p>}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!isClosed && (
                    <button onClick={() => sendNow(r)} disabled={busyRow === r.id}
                      style={{ ...rowBtn, background: 'var(--blue)', color: '#fff' }}>
                      📨 Send Now
                    </button>
                  )}
                  {r.status === 'pending' && (
                    <button onClick={() => snooze(r)} disabled={busyRow === r.id}
                      title="Push due date out 7 days"
                      style={{ ...rowBtn, background: '#FEF3C7', color: '#92400E' }}>
                      ⏰ Snooze 1 wk
                    </button>
                  )}
                  {!isClosed && (
                    <button onClick={() => markComplete(r)} disabled={busyRow === r.id}
                      title="Patient has booked — close this recall"
                      style={{ ...rowBtn, background: '#DCFCE7', color: '#166534' }}>
                      ✓ Mark Complete
                    </button>
                  )}
                  {!isClosed && (
                    <button onClick={() => cancel(r)} disabled={busyRow === r.id}
                      title="Cancel without notifying patient"
                      style={ghostBtn}>
                      ✕ Cancel
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Tile({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: accent || 'var(--text)' }}>{value}</div>
    </div>
  )
}

const tileGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16,
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px', background: '#fff', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--font-body)',
}
const rowBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
  border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
}
