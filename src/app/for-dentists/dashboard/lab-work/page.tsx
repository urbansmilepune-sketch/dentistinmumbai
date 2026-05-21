'use client'

// Dental lab tracker. Lists every crown / bridge / denture / aligner case
// the dentist has sent out, with the round-trip status flowing
//   sent → in_progress → ready → delivered
// plus a remake bucket for cases the lab has to redo. The page is the
// front-desk's worklist for chasing labs and pulling cases when they
// land back at the clinic.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = 'sent' | 'in_progress' | 'ready' | 'delivered' | 'remake'
type FilterKey = 'all' | Status | 'overdue'

// Work types are intentionally free text in the DB (a niche clinic might
// send a custom piece we haven't anticipated). The UI offers a curated
// list of common ones plus an "Other" fallback that opens a text input.
const WORK_TYPES = [
  'Crown', 'Bridge', 'Denture (Full)', 'Denture (Partial)',
  'Veneer', 'Inlay / Onlay', 'Aligner Set', 'Night Guard',
  'Implant Abutment', 'Implant Crown', 'Other',
] as const

const STATUS_META: Record<Status, { label: string; bg: string; text: string; emoji: string }> = {
  sent:        { label: 'Sent',         bg: '#FEF3C7', text: '#92400E', emoji: '📤' },
  in_progress: { label: 'In Progress',  bg: '#DBEAFE', text: '#1D4ED8', emoji: '🛠️' },
  ready:       { label: 'Ready',        bg: '#DCFCE7', text: '#166534', emoji: '✅' },
  delivered:   { label: 'Delivered',    bg: '#E5E7EB', text: '#374151', emoji: '🏁' },
  remake:      { label: 'Remake',       bg: '#FEE2E2', text: '#991B1B', emoji: '↺' },
}

const VALID_STATUSES: Status[] = ['sent', 'in_progress', 'ready', 'delivered', 'remake']

interface LabWorkRow {
  id: string
  patient_id: string | null
  dentist_id: string
  lab_name: string | null
  lab_phone: string | null
  work_type: string
  tooth_numbers: string | null
  shade: string | null
  sent_date: string | null
  expected_return_date: string | null
  actual_return_date: string | null
  status: Status
  cost: number | null
  notes: string | null
  created_at: string
  updated_at: string
  patients: { id: string; name: string | null; phone: string | null } | null
}

interface PatientOpt {
  id: string
  name: string | null
  phone: string | null
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isOverdue(row: LabWorkRow): boolean {
  // A case is overdue only while the lab still holds it. Once it's
  // marked ready/delivered the expected_return_date stops mattering.
  if (row.status === 'ready' || row.status === 'delivered') return false
  if (!row.expected_return_date) return false
  return row.expected_return_date < todayIso()
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const today = todayIso()
  const [ya, ma, da] = iso.split('-').map(Number)
  const [yb, mb, db] = today.split('-').map(Number)
  const a = Date.UTC(ya, ma - 1, da)
  const b = Date.UTC(yb, mb - 1, db)
  return Math.round((a - b) / (1000 * 60 * 60 * 24))
}

// Sensible default for the expected_return_date input when adding a new
// case — most labs quote 7–10 working days, so today + 10 is a fair stub
// that the dentist can adjust.
function defaultExpectedReturn(): string {
  const d = new Date()
  d.setDate(d.getDate() + 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const blankForm = () => ({
  patient_id: '',
  lab_name: '',
  lab_phone: '',
  work_type: 'Crown' as string,
  custom_work_type: '',
  tooth_numbers: '',
  shade: '',
  sent_date: todayIso(),
  expected_return_date: defaultExpectedReturn(),
  status: 'sent' as Status,
  cost: '',
  notes: '',
})

export default function LabWorkPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [rows, setRows] = useState<LabWorkRow[]>([])
  const [patients, setPatients] = useState<PatientOpt[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  // editingId === null means the modal is in Add mode; otherwise Edit.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyRow, setBusyRow] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).maybeSingle()
      if (!dentist) { setLoading(false); return }
      setDentistId(dentist.id)

      const [{ data: lw }, { data: pts }] = await Promise.all([
        supabase
          .from('lab_work')
          .select('*, patients(id, name, phone)')
          .eq('dentist_id', dentist.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('patients')
          .select('id, name, phone')
          .eq('dentist_id', dentist.id)
          .order('name'),
      ])
      setRows(((lw ?? []) as unknown) as LabWorkRow[])
      setPatients((pts ?? []) as PatientOpt[])
      setLoading(false)
    }
    load()
  }, [router])

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: rows.length,
      sent: 0, in_progress: 0, ready: 0, delivered: 0, remake: 0,
      overdue: 0,
    }
    for (const r of rows) {
      c[r.status]++
      if (isOverdue(r)) c.overdue++
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter === 'overdue') { if (!isOverdue(r)) return false }
      else if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      const hay = [
        r.lab_name, r.work_type, r.tooth_numbers, r.shade, r.notes,
        r.patients?.name, r.patients?.phone,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [rows, filter, search])

  function openAdd() {
    setEditingId(null)
    setForm(blankForm())
    setFormError(null)
    setShowModal(true)
  }
  function openEdit(r: LabWorkRow) {
    setEditingId(r.id)
    setFormError(null)
    setForm({
      patient_id: r.patient_id || '',
      lab_name: r.lab_name || '',
      lab_phone: r.lab_phone || '',
      work_type: WORK_TYPES.includes(r.work_type as any) ? r.work_type : 'Other',
      custom_work_type: WORK_TYPES.includes(r.work_type as any) ? '' : r.work_type,
      tooth_numbers: r.tooth_numbers || '',
      shade: r.shade || '',
      sent_date: r.sent_date || todayIso(),
      expected_return_date: r.expected_return_date || defaultExpectedReturn(),
      status: r.status,
      cost: r.cost != null ? String(r.cost) : '',
      notes: r.notes || '',
    })
    setShowModal(true)
  }

  async function save() {
    setFormError(null)
    const workTypeFinal = form.work_type === 'Other' ? form.custom_work_type.trim() : form.work_type
    if (!workTypeFinal) { setFormError('Work type is required.'); return }
    if (!form.patient_id) { setFormError('Pick the patient this case is for.'); return }
    setSaving(true)
    const supabase = createClient()
    // actual_return_date stamps the day the lab work landed back; we set
    // it automatically when status transitions to 'ready' (or 'delivered'
    // if 'ready' was skipped) and the dentist hasn't already filled it.
    const wantsAutoReturn = (form.status === 'ready' || form.status === 'delivered')
    const payload: any = {
      patient_id: form.patient_id || null,
      lab_name: form.lab_name.trim() || null,
      lab_phone: form.lab_phone.trim() || null,
      work_type: workTypeFinal,
      tooth_numbers: form.tooth_numbers.trim() || null,
      shade: form.shade.trim() || null,
      sent_date: form.sent_date || null,
      expected_return_date: form.expected_return_date || null,
      status: form.status,
      cost: form.cost ? Number(form.cost) : null,
      notes: form.notes.trim() || null,
    }
    if (wantsAutoReturn) payload.actual_return_date = todayIso()

    if (editingId) {
      const { data, error } = await supabase
        .from('lab_work')
        .update(payload)
        .eq('id', editingId)
        .select('*, patients(id, name, phone)')
        .single()
      setSaving(false)
      if (error || !data) { setFormError(error?.message || 'Update failed.'); return }
      setRows(prev => prev.map(r => r.id === editingId ? (data as unknown as LabWorkRow) : r))
    } else {
      const { data, error } = await supabase
        .from('lab_work')
        .insert({ ...payload, dentist_id: dentistId })
        .select('*, patients(id, name, phone)')
        .single()
      setSaving(false)
      if (error || !data) { setFormError(error?.message || 'Save failed.'); return }
      setRows(prev => [data as unknown as LabWorkRow, ...prev])
    }
    setShowModal(false)
  }

  async function transitionStatus(row: LabWorkRow, next: Status) {
    setBusyRow(row.id); setActionError(null)
    const supabase = createClient()
    // Stamp actual_return_date the first time the case reaches ready or
    // delivered. Don't clobber an existing value the dentist may have
    // already set manually.
    const patch: any = { status: next }
    if ((next === 'ready' || next === 'delivered') && !row.actual_return_date) {
      patch.actual_return_date = todayIso()
    }
    const { data, error } = await supabase
      .from('lab_work').update(patch).eq('id', row.id).select('*, patients(id, name, phone)').single()
    setBusyRow(null)
    if (error || !data) {
      setActionError(error?.message || 'Status change failed — you may not have permission.')
      return
    }
    setRows(prev => prev.map(r => r.id === row.id ? (data as unknown as LabWorkRow) : r))
  }

  async function remove(row: LabWorkRow) {
    if (!confirm(`Delete this ${row.work_type} case? This can't be undone.`)) return
    setBusyRow(row.id); setActionError(null)
    const supabase = createClient()
    const { error } = await supabase.from('lab_work').delete().eq('id', row.id)
    setBusyRow(null)
    if (error) { setActionError(error.message); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading lab work…</div>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Lab Work</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Crowns, bridges, dentures and aligners — tracked from "sent" through "delivered" with overdue alerts.
          </p>
        </div>
        <button onClick={openAdd} style={primaryBtn}>+ Add Lab Work</button>
      </div>

      {/* Summary tiles */}
      <div style={tileGrid}>
        <Tile icon="📤" label="Sent"        value={String(counts.sent)} />
        <Tile icon="🛠️" label="In Progress" value={String(counts.in_progress)} />
        <Tile icon="✅" label="Ready"       value={String(counts.ready)} accent="#166534" />
        <Tile icon="⚠️" label="Overdue"     value={String(counts.overdue)} accent={counts.overdue > 0 ? '#DC2626' : 'var(--text)'} />
        <Tile icon="↺"  label="Remake"     value={String(counts.remake)} accent="#991B1B" />
        <Tile icon="🏁" label="Delivered"   value={String(counts.delivered)} />
      </div>

      {actionError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { k: 'all',         label: `All (${counts.all})` },
          { k: 'sent',        label: `Sent (${counts.sent})` },
          { k: 'in_progress', label: `In Progress (${counts.in_progress})` },
          { k: 'ready',       label: `Ready (${counts.ready})` },
          { k: 'overdue',     label: `⚠ Overdue (${counts.overdue})` },
          { k: 'remake',      label: `Remake (${counts.remake})` },
          { k: 'delivered',   label: `Delivered (${counts.delivered})` },
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lab, patient, tooth…"
          style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, minWidth: 220, fontFamily: 'var(--font-body)', outline: 'none' }} />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          {rows.length === 0
            ? 'No lab work yet. Hit + Add Lab Work to start tracking a case.'
            : 'No cases match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => {
            const overdue = isOverdue(r)
            const sc = STATUS_META[r.status]
            const days = daysUntil(r.expected_return_date)
            return (
              <div key={r.id} style={{
                background: '#fff',
                border: `1px solid ${overdue ? '#FECACA' : 'var(--border)'}`,
                borderLeft: overdue ? '4px solid #DC2626' : `1px solid var(--border)`,
                borderRadius: 12, padding: '14px 18px',
                display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{r.work_type}</span>
                    {r.tooth_numbers && <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>🦷 {r.tooth_numbers}</span>}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.emoji} {sc.label}</span>
                    {overdue && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B' }}>⚠ Overdue {days != null ? `${Math.abs(days)}d` : ''}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {r.patients?.id ? (
                      <Link href={`/for-dentists/dashboard/patients/${r.patients.id}`}
                        style={{ color: 'var(--muted)', textDecoration: 'none' }}>👤 {r.patients.name || 'Patient'}</Link>
                    ) : <span>👤 (unlinked)</span>}
                    {r.lab_name && <span>🏭 {r.lab_name}</span>}
                    {r.shade && <span>🎨 Shade {r.shade}</span>}
                    {r.sent_date && <span>📤 Sent {fmtDate(r.sent_date)}</span>}
                    {r.expected_return_date && (
                      <span style={{ color: overdue ? '#991B1B' : 'var(--muted)' }}>
                        ⏰ Due {fmtDate(r.expected_return_date)}
                        {days != null && (r.status === 'sent' || r.status === 'in_progress') && !overdue && ` · in ${days}d`}
                      </span>
                    )}
                    {r.cost != null && <span>💰 ₹{Number(r.cost).toLocaleString('en-IN')}</span>}
                  </div>
                  {r.notes && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>"{r.notes}"</p>}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Status transitions — show the next step or two,
                      not the whole pipeline, so the row doesn't bloat. */}
                  {r.status === 'sent' && (
                    <button onClick={() => transitionStatus(r, 'in_progress')} disabled={busyRow === r.id}
                      style={{ ...rowBtn, background: '#DBEAFE', color: '#1D4ED8' }}>🛠️ In Progress</button>
                  )}
                  {(r.status === 'sent' || r.status === 'in_progress') && (
                    <button onClick={() => transitionStatus(r, 'ready')} disabled={busyRow === r.id}
                      style={{ ...rowBtn, background: '#DCFCE7', color: '#166534' }}>✅ Mark Ready</button>
                  )}
                  {r.status === 'ready' && (
                    <button onClick={() => transitionStatus(r, 'delivered')} disabled={busyRow === r.id}
                      style={{ ...rowBtn, background: '#E0E7FF', color: '#3730A3' }}>🏁 Delivered</button>
                  )}
                  {r.status !== 'remake' && r.status !== 'delivered' && (
                    <button onClick={() => transitionStatus(r, 'remake')} disabled={busyRow === r.id}
                      title="Lab needs to redo this case"
                      style={{ ...rowBtn, background: '#FEE2E2', color: '#991B1B' }}>↺ Remake</button>
                  )}
                  {r.lab_phone && (
                    <a href={`tel:${r.lab_phone}`} style={ghostBtn}>📞 Lab</a>
                  )}
                  {r.lab_phone && (
                    <a href={`https://wa.me/91${(r.lab_phone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                      style={{ ...ghostBtn, color: '#166534', borderColor: '#BBF7D0' }}>💬</a>
                  )}
                  <button onClick={() => openEdit(r)} style={ghostBtn}>✏ Edit</button>
                  <button onClick={() => remove(r)} disabled={busyRow === r.id}
                    style={{ ...ghostBtn, color: '#991B1B', borderColor: '#FECACA' }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div onClick={() => !saving && setShowModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>{editingId ? 'Edit Lab Work' : 'New Lab Work'}</h2>
              <button onClick={() => !saving && setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Patient *</Label>
                <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select patient</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name || 'Unnamed'} — {p.phone}</option>)}
                </select>
              </div>
              <div>
                <Label>Work type *</Label>
                <select value={form.work_type} onChange={e => setForm(f => ({ ...f, work_type: e.target.value }))} style={inputStyle}>
                  {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {form.work_type === 'Other' && (
                <div>
                  <Label>Custom work type *</Label>
                  <input value={form.custom_work_type} onChange={e => setForm(f => ({ ...f, custom_work_type: e.target.value }))}
                    placeholder="e.g. Splint" style={inputStyle} />
                </div>
              )}
              <div>
                <Label>Tooth numbers</Label>
                <input value={form.tooth_numbers} onChange={e => setForm(f => ({ ...f, tooth_numbers: e.target.value }))}
                  placeholder="e.g. 11, 21" style={inputStyle} />
              </div>
              <div>
                <Label>Shade</Label>
                <input value={form.shade} onChange={e => setForm(f => ({ ...f, shade: e.target.value }))}
                  placeholder="e.g. A2, B1" style={inputStyle} />
              </div>
              <div>
                <Label>Lab name</Label>
                <input value={form.lab_name} onChange={e => setForm(f => ({ ...f, lab_name: e.target.value }))}
                  placeholder="e.g. Smile Dental Lab" style={inputStyle} />
              </div>
              <div>
                <Label>Lab phone</Label>
                <input value={form.lab_phone} onChange={e => setForm(f => ({ ...f, lab_phone: e.target.value }))}
                  placeholder="10-digit number" style={inputStyle} />
              </div>
              <div>
                <Label>Sent date</Label>
                <input type="date" value={form.sent_date} onChange={e => setForm(f => ({ ...f, sent_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <Label>Expected return</Label>
                <input type="date" value={form.expected_return_date} onChange={e => setForm(f => ({ ...f, expected_return_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <Label>Status</Label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))} style={inputStyle}>
                  {VALID_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
              <div>
                <Label>Cost (₹)</Label>
                <input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                  placeholder="Lab cost" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Notes</Label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Margin design, special instructions…" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              {formError && (
                <div style={{ gridColumn: '1/-1', background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{formError}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !saving && setShowModal(false)} style={ghostBtn}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : (editingId ? 'Update' : 'Create case')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Layout primitives -----------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{children}</label>
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
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', fontSize: 13,
  fontFamily: 'var(--font-body)', outline: 'none', background: '#fff', boxSizing: 'border-box',
}
const primaryBtn: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--blue)', color: '#fff', border: 'none',
  borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px', background: '#fff', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
}
const rowBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
  border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
}
