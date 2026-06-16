'use client'

// Inventory item detail — full info, an inline edit form (PATCH), and the
// item's movement history split into Usage and Restock timelines (read from
// inventory_movements via GET /api/dentist/inventory/[id]). Stock-changing
// actions stay on the main list page; this view is info + edit + history.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const CATEGORIES = [
  { key: 'consumables',   label: 'Consumables'   },
  { key: 'instruments',   label: 'Instruments'   },
  { key: 'medicines',     label: 'Medicines'     },
  { key: 'ppe',           label: 'PPE'           },
  { key: 'lab_materials', label: 'Lab Materials' },
] as const
type CategoryKey = typeof CATEGORIES[number]['key']
const CATEGORY_LABEL: Record<string, string> = CATEGORIES.reduce((a, c) => { a[c.key] = c.label; return a }, {} as Record<string, string>)

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

interface Movement {
  id: string
  type: 'use' | 'restock' | string
  quantity: number
  notes: string | null
  created_at: string
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const [ya, ma, da] = iso.split('-').map(Number)
  const now = new Date()
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
}
// green >90 days · amber 30–90 · red <30 days or expired
function expiryColor(iso: string | null): string {
  const d = daysUntil(iso)
  if (d == null) return 'var(--muted)'
  if (d < 30) return '#991B1B'
  if (d <= 90) return '#92400E'
  return '#166534'
}

export default function InventoryItemPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<InventoryItem | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', category: 'consumables' as CategoryKey, current_stock: '', min_stock_level: '',
    unit: '', expiry_date: '', supplier_name: '', supplier_phone: '', unit_cost: '', notes: '',
  })

  async function load() {
    const res = await fetch(`/api/dentist/inventory/${id}`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Could not load this item.')
      return
    }
    const j = await res.json()
    setItem(j.item)
    setMovements(j.movements || [])
  }

  useEffect(() => {
    (async () => { await load(); setLoading(false) })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function startEdit() {
    if (!item) return
    setForm({
      name: item.name,
      category: item.category,
      current_stock: String(item.current_stock ?? ''),
      min_stock_level: String(item.min_stock_level ?? ''),
      unit: item.unit,
      expiry_date: item.expiry_date || '',
      supplier_name: item.supplier_name || '',
      supplier_phone: item.supplier_phone || '',
      unit_cost: item.unit_cost != null ? String(item.unit_cost) : '',
      notes: item.notes || '',
    })
    setFormError(null)
    setEditing(true)
  }

  async function save() {
    setFormError(null)
    if (!form.name.trim()) { setFormError('Item name is required.'); return }
    if (!form.unit.trim()) { setFormError('Unit is required.'); return }
    setSaving(true)
    const res = await fetch(`/api/dentist/inventory/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setFormError(j.error || 'Save failed.'); return
    }
    const j = await res.json()
    setItem(j.item)
    setEditing(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading item…</div>
  if (error || !item) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#991B1B', marginBottom: 16 }}>{error || 'Item not found.'}</p>
        <Link href="/for-dentists/dashboard/inventory" style={linkBtn}>← Back to Inventory</Link>
      </div>
    )
  }

  const stock = Number(item.current_stock || 0)
  const min = Number(item.min_stock_level || 0)
  const belowMin = stock <= min
  const usage = movements.filter(m => m.type === 'use')
  const restocks = movements.filter(m => m.type === 'restock')

  return (
    <div>
      <Link href="/for-dentists/dashboard/inventory" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← All Inventory</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '12px 0 20px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{item.name}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'var(--blue-light)', color: 'var(--blue)' }}>{CATEGORY_LABEL[item.category] || item.category}</span>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: belowMin ? '#FEF3C7' : '#DCFCE7', color: belowMin ? '#92400E' : '#166534' }}>{belowMin ? 'Low stock' : 'In stock'}</span>
          </div>
        </div>
        {!editing && <button onClick={startEdit} style={primaryBtn}>✏ Edit Item</button>}
      </div>

      {/* Info / Edit card */}
      <div style={card}>
        {!editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <Field label="Current stock"><span style={{ color: belowMin ? '#991B1B' : 'var(--text)', fontWeight: 700 }}>{stock} / {min} {item.unit}</span></Field>
            <Field label="Expiry date"><span style={{ color: expiryColor(item.expiry_date), fontWeight: 600 }}>{fmtDate(item.expiry_date)}</span></Field>
            <Field label="Supplier">{item.supplier_name || '—'}</Field>
            <Field label="Supplier phone">{item.supplier_phone || '—'}</Field>
            <Field label="Unit cost">{item.unit_cost != null ? `₹${Number(item.unit_cost).toLocaleString('en-IN')}` : '—'}</Field>
            <Field label="Last updated">{fmtDate(item.updated_at)}</Field>
            {item.notes && <div style={{ gridColumn: '1/-1' }}><Field label="Notes">{item.notes}</Field></div>}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Item name *</Label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <Label>Category *</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as CategoryKey }))} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div><Label>Unit *</Label><input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="box, piece, ml" style={inputStyle} /></div>
              <div><Label>Current stock</Label><input type="number" min="0" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))} style={inputStyle} /></div>
              <div><Label>Min stock level</Label><input type="number" min="0" value={form.min_stock_level} onChange={e => setForm(f => ({ ...f, min_stock_level: e.target.value }))} style={inputStyle} /></div>
              <div><Label>Expiry date</Label><input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} style={inputStyle} /></div>
              <div><Label>Unit cost (₹)</Label><input type="number" min="0" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} style={inputStyle} /></div>
              <div><Label>Supplier name</Label><input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} style={inputStyle} /></div>
              <div><Label>Supplier WhatsApp / phone</Label><input value={form.supplier_phone} onChange={e => setForm(f => ({ ...f, supplier_phone: e.target.value }))} placeholder="10-digit number" style={inputStyle} /></div>
              <div style={{ gridColumn: '1/-1' }}><Label>Notes</Label><textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} /></div>
            </div>
            {formError && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginTop: 12 }}>{formError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button onClick={() => setEditing(false)} disabled={saving} style={ghostBtn}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </>
        )}
      </div>

      {/* History */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 20 }}>
        <HistorySection title="📉 Usage History" emptyText="No usage logged yet." rows={usage} accent="#3730A3" />
        <HistorySection title="📈 Restock History" emptyText="No restocks logged yet." rows={restocks} accent="#166534" />
      </div>
    </div>
  )
}

function HistorySection({ title, rows, emptyText, accent }: { title: string; rows: Movement[]; emptyText: string; accent: string }) {
  return (
    <div style={card}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{title} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({rows.length})</span></h3>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>{emptyText}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(m => (
            <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <span style={{ fontWeight: 800, color: accent, fontSize: 14, whiteSpace: 'nowrap' }}>{m.type === 'use' ? '−' : '+'}{m.quantity}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDateTime(m.created_at)}</div>
                {m.notes && <div style={{ fontSize: 13, marginTop: 2 }}>{m.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  )
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{children}</label>
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = { padding: '9px 18px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }
const ghostBtn: React.CSSProperties = { padding: '8px 14px', background: '#fff', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }
const linkBtn: React.CSSProperties = { ...primaryBtn, textDecoration: 'none', display: 'inline-block' }
