'use client'

// Clinic inventory tracker. Lists every consumable / instrument / medicine /
// PPE / lab material the dentist stocks, surfaces low-stock + expiring
// alerts, and one-taps a WhatsApp reorder to the saved supplier.
//
// Stock writes go through /api/dentist/inventory/[id]/restock + /use so the
// inventory_movements paper trail stays in sync. Direct edits (name, min
// level, expiry, supplier) go through PATCH on the same endpoint.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const CATEGORIES = [
  { key: 'consumables',   label: 'Consumables'   },
  { key: 'instruments',   label: 'Instruments'   },
  { key: 'medicines',     label: 'Medicines'     },
  { key: 'ppe',           label: 'PPE'           },
  { key: 'lab_materials', label: 'Lab Materials' },
] as const
type CategoryKey = typeof CATEGORIES[number]['key']
const CATEGORY_LABEL: Record<CategoryKey, string> = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c.label
  return acc
}, {} as Record<CategoryKey, string>)

type FilterKey = 'all' | CategoryKey

interface InventoryItem {
  id: string
  name: string
  category: CategoryKey
  current_stock: number
  min_stock_level: number
  unit: string
  expiry_date: string | null
  supplier_name: string | null
  supplier_phone: string | null
  unit_cost: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface AlertsResponse {
  counts: { out: number; low: number; expired: number; expiringSoon: number }
  monthly_usage_value: number
  total_items: number
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86400000)
}

function statusFor(item: InventoryItem): { kind: 'ok' | 'low' | 'critical'; label: string; bg: string; text: string } {
  const stock = Number(item.current_stock || 0)
  const min = Number(item.min_stock_level || 0)
  if (stock <= 0) return { kind: 'critical', label: 'CRITICAL', bg: '#FEE2E2', text: '#991B1B' }
  if (stock <= min) return { kind: 'low', label: 'LOW', bg: '#FEF3C7', text: '#92400E' }
  return { kind: 'ok', label: 'OK', bg: '#DCFCE7', text: '#166534' }
}

type StatusKey = 'all' | 'low' | 'expiring' | 'expired' | 'ok'

// Per-item alert flags — drive the clickable alert tiles and the status filter.
function itemFlags(it: InventoryItem) {
  const stock = Number(it.current_stock || 0)
  const min = Number(it.min_stock_level || 0)
  const low = stock <= min
  const d = daysUntil(it.expiry_date)
  const expired = d != null && d < 0
  const expiring = d != null && d >= 0 && d <= 30
  return { low, expired, expiring, ok: !low && !expired && !expiring }
}

// Expiry text colour: green >90 days · amber 30–90 · red <30 days or expired.
function expiryColorFor(iso: string | null): string {
  const d = daysUntil(iso)
  if (d == null) return 'var(--muted)'
  if (d < 30) return '#991B1B'
  if (d <= 90) return '#92400E'
  return '#166534'
}

const blankForm = () => ({
  name: '',
  category: 'consumables' as CategoryKey,
  current_stock: '',
  min_stock_level: '',
  unit: '',
  expiry_date: '',
  supplier_name: '',
  supplier_phone: '',
  unit_cost: '',
  notes: '',
})

export default function InventoryPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [summary, setSummary] = useState<AlertsResponse | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all')
  // Recent/upcoming appointments for the optional selector in the Use modal.
  const [appointments, setAppointments] = useState<{ id: string; label: string }[]>([])
  // Use modal state.
  const [useItem, setUseItem] = useState<InventoryItem | null>(null)
  const [useQty, setUseQty] = useState('')
  const [useApptId, setUseApptId] = useState('')
  const [useError, setUseError] = useState<string | null>(null)

  async function loadAll() {
    const [itemsRes, alertsRes] = await Promise.all([
      fetch('/api/dentist/inventory'),
      fetch('/api/dentist/inventory/alerts'),
    ])
    if (itemsRes.ok) {
      const j = await itemsRes.json()
      setItems(j.items || [])
    }
    if (alertsRes.ok) {
      const j = await alertsRes.json()
      setSummary(j)
    }
  }

  useEffect(() => {
    (async () => {
      await loadAll()
      setLoading(false)
      // Load the dentist's own recent + upcoming appointments for the Use
      // modal's optional selector. Scoped by dentist_id (not relying on RLS
      // alone) so the dropdown never leaks another clinic's patients.
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) return
        const { data: d } = await supabase.from('dentists').select('id').eq('email', user.email).maybeSingle()
        if (!d?.id) return
        const since = new Date(); since.setDate(since.getDate() - 7)
        const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, patient_name, appt_date, time_slot, treatments(name)')
          .eq('dentist_id', d.id)
          .gte('appt_date', sinceIso)
          .order('appt_date', { ascending: false })
          .limit(60)
        setAppointments((appts || []).map((a: any) => ({
          id: a.id,
          label: `${a.patient_name || 'Patient'} · ${new Date(a.appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${a.time_slot ? ' ' + a.time_slot : ''}${a.treatments?.name ? ' · ' + a.treatments.name : ''}`,
        })))
      } catch {}
    })()
  }, [])

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: items.length, consumables: 0, instruments: 0, medicines: 0, ppe: 0, lab_materials: 0,
    }
    for (const it of items) {
      if (c[it.category] !== undefined) c[it.category]++
    }
    return c
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(it => {
      if (filter !== 'all' && it.category !== filter) return false
      if (statusFilter !== 'all') {
        const f = itemFlags(it)
        if (statusFilter === 'low' && !f.low) return false
        if (statusFilter === 'expiring' && !f.expiring) return false
        if (statusFilter === 'expired' && !f.expired) return false
        if (statusFilter === 'ok' && !f.ok) return false
      }
      if (!q) return true
      const hay = [it.name, it.supplier_name, it.notes, it.unit].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [items, filter, search, statusFilter])

  const statusCounts = useMemo(() => {
    const c = { low: 0, expiring: 0, expired: 0, ok: 0 }
    for (const it of items) {
      const f = itemFlags(it)
      if (f.low) c.low++
      if (f.expiring) c.expiring++
      if (f.expired) c.expired++
      if (f.ok) c.ok++
    }
    return c
  }, [items])

  const lowOrCriticalItems = useMemo(() => items.filter(it => {
    const s = statusFor(it).kind
    return s === 'low' || s === 'critical'
  }), [items])

  function openAdd() {
    setEditingId(null); setForm(blankForm()); setFormError(null); setShowModal(true)
  }
  function openEdit(it: InventoryItem) {
    setEditingId(it.id); setFormError(null)
    setForm({
      name: it.name,
      category: it.category,
      current_stock: String(it.current_stock ?? ''),
      min_stock_level: String(it.min_stock_level ?? ''),
      unit: it.unit,
      expiry_date: it.expiry_date || '',
      supplier_name: it.supplier_name || '',
      supplier_phone: it.supplier_phone || '',
      unit_cost: it.unit_cost != null ? String(it.unit_cost) : '',
      notes: it.notes || '',
    })
    setShowModal(true)
  }

  async function save() {
    setFormError(null)
    if (!form.name.trim()) { setFormError('Item name is required.'); return }
    if (!form.unit.trim()) { setFormError('Unit is required (e.g. box, piece, ml).'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: form.category,
      current_stock: form.current_stock === '' ? 0 : Number(form.current_stock),
      min_stock_level: form.min_stock_level === '' ? 0 : Number(form.min_stock_level),
      unit: form.unit.trim(),
      expiry_date: form.expiry_date || null,
      supplier_name: form.supplier_name.trim() || null,
      supplier_phone: form.supplier_phone.trim() || null,
      unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
      notes: form.notes.trim() || null,
    }
    const url = editingId ? `/api/dentist/inventory/${editingId}` : '/api/dentist/inventory'
    const method = editingId ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setFormError(j.error || 'Save failed.'); return
    }
    setShowModal(false)
    await loadAll()
  }

  async function remove(it: InventoryItem) {
    if (!confirm(`Delete "${it.name}"? This will keep historical movements but remove the item.`)) return
    setBusyRow(it.id); setActionError(null)
    const res = await fetch(`/api/dentist/inventory/${it.id}`, { method: 'DELETE' })
    setBusyRow(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setActionError(j.error || 'Delete failed.'); return
    }
    await loadAll()
  }

  async function quickStock(it: InventoryItem, kind: 'restock' | 'use') {
    const verb = kind === 'restock' ? 'restock' : 'use'
    const max = kind === 'use' ? it.current_stock : Infinity
    const raw = prompt(`How many ${it.unit} of "${it.name}" to ${verb}?${kind === 'use' && it.current_stock <= 0 ? '\n(Currently 0 in stock)' : ''}`)
    if (raw == null) return
    const qty = Number(raw)
    if (!Number.isFinite(qty) || qty <= 0) { setActionError('Quantity must be a positive number'); return }
    if (qty > max) { setActionError(`Only ${it.current_stock} in stock`); return }
    setBusyRow(it.id); setActionError(null)
    const res = await fetch(`/api/dentist/inventory/${it.id}/${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: qty }),
    })
    setBusyRow(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setActionError(j.error || `${verb} failed.`); return
    }
    await loadAll()
  }

  async function reorder(it: InventoryItem, channel: 'whatsapp' | 'dentalsamaan') {
    setBusyRow(it.id); setActionError(null); setActionNotice(null)
    const res = await fetch('/api/dentist/inventory/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: it.id, channel }),
    })
    setBusyRow(null)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (j.code === 'NO_SUPPLIER_PHONE') {
        setActionError(`Add a supplier contact for "${it.name}" before reordering.`)
        openEdit(it)
        return
      }
      setActionError(j.error || 'Reorder failed.'); return
    }
    if (channel === 'dentalsamaan' && j.redirect_url) {
      window.open(j.redirect_url, '_blank', 'noopener,noreferrer')
      setActionNotice(`Opening supply order for ${it.name} — 90 min delivery.`)
    } else if (j.whatsapp_url) {
      window.open(j.whatsapp_url, '_blank', 'noopener,noreferrer')
      setActionNotice(`Reorder logged · WhatsApp opened for ${j.supplier_name || 'supplier'}`)
    }
    await loadAll()
  }

  function openUse(it: InventoryItem) {
    setUseItem(it); setUseQty(''); setUseApptId(''); setUseError(null)
  }
  async function submitUse() {
    if (!useItem) return
    const qty = Number(useQty)
    if (!Number.isFinite(qty) || qty <= 0) { setUseError('Enter a quantity greater than 0.'); return }
    if (qty > Number(useItem.current_stock || 0)) { setUseError(`Only ${useItem.current_stock} ${useItem.unit} in stock.`); return }
    setBusyRow(useItem.id); setUseError(null)
    // Fold the chosen appointment into the movement note (inventory_movements
    // has no appointment_id column — we keep the link as readable text).
    const appt = appointments.find(a => a.id === useApptId)
    const notes = appt ? `Used during appointment — ${appt.label}` : null
    const res = await fetch(`/api/dentist/inventory/${useItem.id}/use`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: qty, notes }),
    })
    setBusyRow(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setUseError(j.error || 'Use failed.'); return
    }
    setUseItem(null)
    await loadAll()
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading inventory…</div>
  }

  const lowCount = summary ? summary.counts.low + summary.counts.out : 0
  const expiringCount = summary ? summary.counts.expiringSoon + summary.counts.expired : 0
  const monthlyValue = summary?.monthly_usage_value ?? 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Inventory</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Consumables, instruments, medicines and PPE — track stock, get low-stock alerts, and reorder over WhatsApp.
          </p>
        </div>
        <button onClick={openAdd} style={primaryBtn}>+ Add Item</button>
      </div>

      {/* Summary tiles */}
      <div style={tileGrid}>
        <Tile icon="📦" label="Total Items"        value={String(summary?.total_items ?? items.length)} />
        <Tile icon="⚠️" label="Low Stock"          value={String(lowCount)}     accent={lowCount > 0 ? '#92400E' : 'var(--text)'} />
        <Tile icon="⏳" label="Expiring Soon"      value={String(expiringCount)} accent={expiringCount > 0 ? '#991B1B' : 'var(--text)'} />
        <Tile icon="💸" label="Monthly Usage"      value={`₹${Math.round(monthlyValue).toLocaleString('en-IN')}`} />
      </div>

      {/* Clickable alert tiles — shown only when there's something to act on.
          Clicking sets the status filter (toggles off if already active). */}
      {(statusCounts.expired > 0 || statusCounts.expiring > 0 || statusCounts.low > 0) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {statusCounts.expired > 0 && (
            <AlertTile emoji="🔴" label="Expired" count={statusCounts.expired} bg="#FEE2E2" color="#991B1B"
              active={statusFilter === 'expired'} onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')} />
          )}
          {statusCounts.expiring > 0 && (
            <AlertTile emoji="🟡" label="Expiring ≤30 days" count={statusCounts.expiring} bg="#FEF3C7" color="#92400E"
              active={statusFilter === 'expiring'} onClick={() => setStatusFilter(statusFilter === 'expiring' ? 'all' : 'expiring')} />
          )}
          {statusCounts.low > 0 && (
            <AlertTile emoji="🟠" label="Low stock" count={statusCounts.low} bg="#FFEDD5" color="#9A3412"
              active={statusFilter === 'low'} onClick={() => setStatusFilter(statusFilter === 'low' ? 'all' : 'low')} />
          )}
        </div>
      )}

      {/* Status filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Status:</span>
        {([
          { k: 'all' as StatusKey, label: 'All' },
          { k: 'low' as StatusKey, label: `Low Stock (${statusCounts.low})` },
          { k: 'expiring' as StatusKey, label: `Expiring (${statusCounts.expiring})` },
          { k: 'expired' as StatusKey, label: `Expired (${statusCounts.expired})` },
          { k: 'ok' as StatusKey, label: `OK (${statusCounts.ok})` },
        ]).map(t => (
          <button key={t.k} onClick={() => setStatusFilter(t.k)}
            style={{ padding: '6px 12px', borderRadius: 20, background: statusFilter === t.k ? '#0F172A' : '#fff', color: statusFilter === t.k ? '#fff' : 'var(--text)', border: `1.5px solid ${statusFilter === t.k ? '#0F172A' : 'var(--border)'}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Alert banner — only when items are at/below min_stock_level */}
      {lowOrCriticalItems.length > 0 && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '12px 16px', borderRadius: 10, fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>⚠ {lowOrCriticalItems.length} {lowOrCriticalItems.length === 1 ? 'item is' : 'items are'} at or below the minimum stock level.</strong>{' '}
            <span style={{ color: '#78350F' }}>
              {lowOrCriticalItems.slice(0, 3).map(i => i.name).join(', ')}
              {lowOrCriticalItems.length > 3 && ` +${lowOrCriticalItems.length - 3} more`}
            </span>
          </div>
        </div>
      )}

      {actionError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {actionNotice && (
        <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Category filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([{ k: 'all' as FilterKey, label: `All (${counts.all})` }, ...CATEGORIES.map(c => ({ k: c.key as FilterKey, label: `${c.label} (${counts[c.key]})` }))]).map(t => (
          <button key={t.k} onClick={() => setFilter(t.k)}
            style={{
              padding: '7px 14px', borderRadius: 20,
              background: filter === t.k ? 'var(--blue)' : '#fff',
              color:      filter === t.k ? '#fff' : 'var(--text)',
              border: `1.5px solid ${filter === t.k ? 'var(--blue)' : 'var(--border)'}`,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>{t.label}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items, supplier…"
          style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, minWidth: 220, fontFamily: 'var(--font-body)', outline: 'none' }} />
      </div>

      {/* Items table — same card-list style other dashboard pages use. */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          {items.length === 0
            ? 'No inventory yet. Hit + Add Item to start tracking stock.'
            : 'No items match this filter.'}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div className="inv-table" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 1fr 1fr 1fr 1fr 1fr 1.4fr', alignItems: 'center', padding: '10px 16px', background: '#F8FAFC', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <div>Name</div>
            <div>Category</div>
            <div>Stock</div>
            <div>Min</div>
            <div>Status</div>
            <div>Expiry</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>
          {filtered.map((it, idx) => {
            const s = statusFor(it)
            const expDays = daysUntil(it.expiry_date)
            const expiring = expDays != null && expDays <= 30
            const expired = expDays != null && expDays < 0
            return (
              <div key={it.id} className="inv-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px, 2fr) 1fr 1fr 1fr 1fr 1fr 1.4fr',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: idx === filtered.length - 1 ? 'none' : '1px solid var(--border)',
                  fontSize: 13,
                }}>
                <div>
                  <Link href={`/for-dentists/dashboard/inventory/${it.id}`} style={{ fontWeight: 700, fontSize: 14, color: 'var(--blue)', textDecoration: 'none' }}>{it.name}</Link>
                  {it.supplier_name && <div style={{ fontSize: 11, color: 'var(--muted)' }}>🏭 {it.supplier_name}</div>}
                  {it.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>"{it.notes}"</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{CATEGORY_LABEL[it.category] || it.category}</div>
                <div style={{ fontWeight: 600 }}>{it.current_stock} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{it.unit}</span></div>
                <div style={{ color: 'var(--muted)' }}>{it.min_stock_level} {it.unit}</div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.text }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 12, color: expiryColorFor(it.expiry_date), fontWeight: expired || expiring ? 600 : 400 }}>
                  {it.expiry_date ? (expired ? `Expired ${fmtDate(it.expiry_date)}` : fmtDate(it.expiry_date)) : '—'}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => quickStock(it, 'restock')} disabled={busyRow === it.id}
                    style={{ ...rowBtn, background: '#DCFCE7', color: '#166534' }}>+ Restock</button>
                  <button onClick={() => openUse(it)} disabled={busyRow === it.id || it.current_stock <= 0}
                    style={{ ...rowBtn, background: '#E0E7FF', color: '#3730A3', opacity: it.current_stock <= 0 ? 0.5 : 1 }}>− Use</button>
                  {(s.kind === 'low' || s.kind === 'critical') && (
                    <button onClick={() => reorder(it, 'dentalsamaan')} disabled={busyRow === it.id}
                      style={{ ...rowBtn, background: 'var(--blue)', color: '#fff' }}>📦 Order Supplies</button>
                  )}
                  <button onClick={() => reorder(it, 'whatsapp')} disabled={busyRow === it.id}
                    style={{ ...rowBtn, background: '#25D366', color: '#fff' }}>💬 WhatsApp Supplier</button>
                  <button onClick={() => openEdit(it)} disabled={busyRow === it.id} style={ghostBtn}>✏ Edit</button>
                  <button onClick={() => remove(it)} disabled={busyRow === it.id}
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
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>{editingId ? 'Edit Item' : 'New Item'}</h2>
              <button onClick={() => !saving && setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Item name *</Label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Composite resin A2, Surgical gloves" style={inputStyle} />
              </div>
              <div>
                <Label>Category *</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as CategoryKey }))} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Unit *</Label>
                <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="e.g. box, piece, ml" style={inputStyle} />
              </div>
              <div>
                <Label>Current stock</Label>
                <input type="number" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))}
                  placeholder="0" min="0" style={inputStyle} />
              </div>
              <div>
                <Label>Min stock level</Label>
                <input type="number" value={form.min_stock_level} onChange={e => setForm(f => ({ ...f, min_stock_level: e.target.value }))}
                  placeholder="0" min="0" style={inputStyle} />
              </div>
              <div>
                <Label>Expiry date</Label>
                <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <Label>Unit cost (₹)</Label>
                <input type="number" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                  placeholder="Cost per unit" min="0" style={inputStyle} />
              </div>
              <div>
                <Label>Supplier name</Label>
                <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                  placeholder="Distributor or company" style={inputStyle} />
              </div>
              <div>
                <Label>Supplier WhatsApp / phone</Label>
                <input value={form.supplier_phone} onChange={e => setForm(f => ({ ...f, supplier_phone: e.target.value }))}
                  placeholder="10-digit number" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Notes</Label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Storage, batch numbers, shade…" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              {formError && (
                <div style={{ gridColumn: '1/-1', background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{formError}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !saving && setShowModal(false)} style={ghostBtn}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : (editingId ? 'Update' : 'Add Item')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Use modal — quantity + optional appointment link */}
      {useItem && (
        <div onClick={() => busyRow !== useItem.id && setUseItem(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>Use stock — {useItem.name}</h2>
              <button onClick={() => setUseItem(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>In stock: <strong style={{ color: 'var(--text)' }}>{useItem.current_stock} {useItem.unit}</strong></div>
              <div>
                <Label>How many {useItem.unit} used? *</Label>
                <input type="number" min="1" autoFocus value={useQty} onChange={e => setUseQty(e.target.value)} placeholder="0" style={inputStyle} />
              </div>
              <div>
                <Label>Link to appointment (optional)</Label>
                <select value={useApptId} onChange={e => setUseApptId(e.target.value)} style={inputStyle}>
                  <option value="">— None</option>
                  {appointments.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              {useError && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{useError}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setUseItem(null)} style={ghostBtn}>Cancel</button>
              <button onClick={submitUse} disabled={busyRow === useItem.id} style={{ ...primaryBtn, background: '#3730A3', opacity: busyRow === useItem.id ? 0.7 : 1 }}>
                {busyRow === useItem.id ? 'Saving…' : 'Deduct stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .inv-table, .inv-row {
            grid-template-columns: 1fr 1fr !important;
            gap: 6px 12px;
          }
          .inv-table > div:nth-child(n+2), .inv-row > div:nth-child(n+2) {
            font-size: 12px;
          }
          .inv-table > div:nth-child(7), .inv-row > div:nth-child(7) {
            grid-column: 1 / -1; justify-content: flex-start !important;
          }
        }
      `}</style>
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

function AlertTile({ emoji, label, count, bg, color, active, onClick }: { emoji: string; label: string; count: number; bg: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: bg, border: `2px solid ${active ? color : 'transparent'}`, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color, lineHeight: 1 }}>{count}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
      </div>
    </button>
  )
}

const tileGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16,
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
