'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { downloadInvoicePdf } from '@/lib/invoicePdf'
import { resolveCurrentDentist } from '@/lib/currentDentist'

type DentistMeta = {
  id: string
  name: string | null
  degree: string | null
  clinic_name: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  mci_number: string | null
  city: string | null
  areas: { name: string | null } | null
}

// Next.js 16 requires useSearchParams() to be inside a Suspense boundary;
// the inner component is where the hook lives so build doesn't bail to the
// "missing-suspense-with-csr-bailout" error.
export default function BillingPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>}>
      <BillingPageInner />
    </Suspense>
  )
}

function BillingPageInner() {
  const router = useRouter()
  // Honours ?patient_id=<uuid> — the patient-detail page's "+ New Invoice"
  // link pre-fills the modal so the dentist doesn't have to pick the patient
  // back out of the dropdown after navigating here.
  const searchParams = useSearchParams()
  const initialPatientId = searchParams.get('patient_id') || ''
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [dentist, setDentist] = useState<DentistMeta | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string | null; is_primary: boolean }[]>([])
  // Branch filter scoped to the invoice list. 'all' shows everything,
  // 'unassigned' shows invoices still missing a location_id (legacy rows),
  // a specific id scopes to one branch. Hidden when the dentist has ≤1
  // clinic_locations rows.
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(Boolean(initialPatientId))
  const [saving, setSaving] = useState(false)
  const [linkLoading, setLinkLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // When set, the New Invoice modal is reused as an Edit modal: same fields,
  // same totals, but the submit handler does an UPDATE instead of an INSERT
  // and the headline / CTA copy switch to "Edit / Update Invoice".
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    patient_id: initialPatientId, date: new Date().toISOString().split('T')[0],
    items: [{ treatment_name: '', quantity: '1', unit_price: '' }],
    discount: '', gst_enabled: false, notes: '', payment_status: 'pending',
    payment_method: '', location_id: '',
  })

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const dentistRow = await resolveCurrentDentist<DentistMeta>(
          supabase,
          'id, name, degree, clinic_name, phone, whatsapp, address, mci_number, city, areas(name)',
        )
        if (!dentistRow) return
        setDentistId(dentistRow.id)
        setDentist(dentistRow as unknown as DentistMeta)
        const [{ data: inv }, { data: pat }, { data: locs }] = await Promise.all([
          supabase.from('invoices').select('*, patients(name, phone), clinic_locations(id, clinic_name)').eq('dentist_id', dentistRow.id).order('created_at', { ascending: false }),
          supabase.from('patients').select('id, name, phone').eq('dentist_id', dentistRow.id).order('name'),
          supabase.from('clinic_locations').select('id, clinic_name, is_primary').eq('dentist_id', dentistRow.id).order('is_primary', { ascending: false }).order('created_at'),
        ])
        setInvoices(inv || [])
        setPatients(pat || [])
        setLocations((locs || []).map((l: any) => ({ id: l.id, name: l.clinic_name, is_primary: !!l.is_primary })))
      } finally {
        // Always release the spinner so RLS denial or a missing dentist row
        // doesn't strand the page on "Loading…".
        setLoading(false)
      }
    }
    load()
  }, [])

  // Line totals derive from qty × unit; subtotal is the sum of lines, discount
  // is applied first, GST is computed on the discounted base so the tax line
  // matches the bill the patient actually owes.
  const itemsComputed = form.items.map(i => {
    const qty = parseFloat(i.quantity) || 0
    const unit = parseFloat(i.unit_price) || 0
    return { qty, unit, line: qty * unit }
  })
  const subtotal = itemsComputed.reduce((sum, i) => sum + i.line, 0)
  const discountAmt = parseFloat(form.discount) || 0
  const taxable = Math.max(subtotal - discountAmt, 0)
  const gstAmt = form.gst_enabled ? +(taxable * 0.18).toFixed(2) : 0
  const total = taxable + gstAmt

  function resetForm() {
    setForm({
      patient_id: '', date: new Date().toISOString().split('T')[0],
      items: [{ treatment_name: '', quantity: '1', unit_price: '' }],
      discount: '', gst_enabled: false, notes: '', payment_status: 'pending',
      payment_method: '', location_id: '',
    })
    setEditingId(null)
  }

  function openEdit(inv: any) {
    // Items are stored as JSONB on the invoices row. Old rows may use the
    // legacy `description` field instead of `treatment_name`, so we read
    // either. Numbers come back as JSON numbers — re-stringify them for the
    // inputs (the form keeps text so empty fields stay empty, not 0).
    const items = Array.isArray(inv.items) && inv.items.length > 0
      ? inv.items.map((i: any) => ({
          treatment_name: String(i.treatment_name || i.description || ''),
          quantity: i.quantity != null ? String(i.quantity) : '1',
          unit_price: i.unit_price != null ? String(i.unit_price) : '',
        }))
      : [{ treatment_name: '', quantity: '1', unit_price: '' }]
    setForm({
      patient_id: inv.patient_id || '',
      date: (inv.invoice_date || new Date().toISOString().split('T')[0]).slice(0, 10),
      items,
      discount: inv.discount != null ? String(inv.discount) : '',
      gst_enabled: Number(inv.gst_amount || 0) > 0,
      notes: inv.notes || '',
      payment_status: inv.payment_status || 'pending',
      payment_method: inv.payment_method || '',
      location_id: inv.location_id || '',
    })
    setEditingId(inv.id)
    setShowAdd(true)
  }

  async function handleSave() {
    if (!form.patient_id) { alert('Please select a patient'); return }
    if (form.items.some(i => !i.treatment_name || !i.unit_price)) { alert('Fill treatment name and unit price for each item'); return }
    if (form.payment_status === 'paid' && !form.payment_method) { alert('Please select a payment method for paid invoices'); return }
    setSaving(true)
    const supabase = createClient()
    const itemsPayload = form.items.map((i, idx) => {
      const c = itemsComputed[idx]
      return {
        treatment_name: i.treatment_name,
        // Keep `description` populated so older PDFs / queries that read from
        // the legacy field still render the line.
        description: i.treatment_name,
        quantity: c.qty,
        unit_price: c.unit,
        amount: c.line,
      }
    })

    if (editingId) {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          patient_id: form.patient_id,
          invoice_date: form.date,
          items: itemsPayload,
          subtotal, discount: discountAmt, gst_amount: gstAmt, total,
          notes: form.notes || null,
          payment_status: form.payment_status,
          payment_method: form.payment_method || null,
          location_id: form.location_id || null,
        })
        .eq('id', editingId)
        .select('*, patients(name, phone), clinic_locations(id, clinic_name)')
        .single()
      setSaving(false)
      if (error || !data) {
        setActionError(error?.message || 'Update failed — your changes were not saved.')
        return
      }
      setInvoices(prev => prev.map(x => x.id === editingId ? data : x))
      setShowAdd(false)
      resetForm()
      return
    }

    const invNo = `INV-${Date.now().toString().slice(-6)}`
    const { data } = await supabase.from('invoices').insert({
      invoice_no: invNo, dentist_id: dentistId, patient_id: form.patient_id,
      invoice_date: form.date,
      items: itemsPayload,
      subtotal, discount: discountAmt, gst_amount: gstAmt, total,
      notes: form.notes || null, payment_status: form.payment_status,
      payment_method: form.payment_method || null,
      location_id: form.location_id || null,
    }).select('*, patients(name, phone), clinic_locations(id, clinic_name)').single()
    if (data) setInvoices(prev => [data, ...prev])
    setShowAdd(false)
    resetForm()
    setSaving(false)
  }

  async function updatePaymentStatus(id: string, status: string) {
    setActionError(null)
    const supabase = createClient()
    // .select() so we know the DB actually accepted the write — RLS denial
    // returns no error and no rows. Marking an invoice as paid is the kind
    // of action where a fake-success would be especially damaging.
    const { data, error } = await supabase
      .from('invoices').update({ payment_status: status }).eq('id', id).select('id')
    if (error) {
      setActionError(error.message)
      return
    }
    if (!data || data.length === 0) {
      setActionError('Payment status update rejected — you may not have permission to edit this invoice.')
      return
    }
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, payment_status: status } : inv))
  }

  // Create a Razorpay payment link for this invoice, then hand it off via
  // wa.me. The patient pays, Razorpay fires payment_link.paid, our webhook
  // (/api/payments/razorpay-webhook) flips payment_status to 'paid'. We
  // optimistically refetch is skipped here — the dentist sees status update
  // on next refresh.
  async function sendPaymentLink(inv: any) {
    // Defence-in-depth tenant check. /api/payments/create-link verifies the
    // invoice belongs to the signed-in dentist before issuing the link, but
    // a UI that POSTs cross-tenant ids — even by accident, e.g. a stale row
    // in state — would generate a Razorpay link in the wrong clinic's name
    // and the patient would see another clinic's note text. This guard
    // catches that locally before the request ever leaves the browser.
    if (!dentistId || (inv.dentist_id && inv.dentist_id !== dentistId)) {
      alert('This invoice does not belong to your account.')
      return
    }
    const rawPhone = String(inv.patients?.phone || '').replace(/\D/g, '')
    if (!rawPhone) { alert('Patient phone is missing — add it before sending a payment link.'); return }
    setLinkLoading(inv.id)
    try {
      const res = await fetch('/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: inv.id }),
      })
      const data = await res.json()
      if (!res.ok || !data?.short_url) {
        alert('Failed to create payment link: ' + (data?.detail || data?.error || 'Unknown error'))
        return
      }
      const clinic = dentist?.clinic_name || dentist?.name || 'your clinic'
      const lines = [
        `Hi ${inv.patients?.name || ''},`.trim(),
        ``,
        `Here is the payment link for invoice ${inv.invoice_no} of ₹${Number(inv.total).toLocaleString('en-IN')}:`,
        data.short_url,
        ``,
        `Thank you,`,
        clinic,
      ]
      const waUrl = `https://wa.me/91${rawPhone.slice(-10)}?text=${encodeURIComponent(lines.join('\n'))}`
      window.open(waUrl, '_blank', 'noopener,noreferrer')
    } catch {
      alert('Network error creating payment link')
    } finally {
      setLinkLoading(null)
    }
  }

  function downloadPdf(inv: any) {
    if (!dentist) return
    downloadInvoicePdf(inv, dentist)
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, display: 'block' as const, marginBottom: 4 }

  const STATUS_COLORS: Record<string, any> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    paid: { bg: '#DCFCE7', text: '#166534' },
    overdue: { bg: '#FEE2E2', text: '#991B1B' },
  }

  // Branch-scoped slice — drives both the stats tiles and the visible list,
  // so "Total Collected" reads as "Total Collected at the selected branch"
  // when a branch is picked.
  const branchScopedInvoices = invoices.filter(inv => {
    if (branchFilter === 'all') return true
    if (branchFilter === 'unassigned') return !inv.location_id
    return inv.location_id === branchFilter
  })
  const totalRevenue = branchScopedInvoices.filter(i => i.payment_status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0)
  const pendingRevenue = branchScopedInvoices.filter(i => i.payment_status === 'pending').reduce((sum, i) => sum + (i.total || 0), 0)

  // All-time revenue per branch — small breakdown card that surfaces only
  // when the dentist has ≥2 branches. Includes a synthetic "Unassigned"
  // bucket so legacy rows aren't silently dropped from the total.
  const revenueByBranch = (() => {
    if (locations.length < 2) return [] as Array<{ id: string; name: string; revenue: number; count: number }>
    const map = new Map<string, { revenue: number; count: number }>()
    for (const inv of invoices.filter(i => i.payment_status === 'paid')) {
      const key = inv.location_id || '__unassigned__'
      const prev = map.get(key) ?? { revenue: 0, count: 0 }
      map.set(key, { revenue: prev.revenue + Number(inv.total || 0), count: prev.count + 1 })
    }
    const rows = locations.map(l => ({
      id: l.id,
      name: l.name || 'Branch',
      revenue: map.get(l.id)?.revenue ?? 0,
      count: map.get(l.id)?.count ?? 0,
    }))
    const u = map.get('__unassigned__')
    if (u && u.count > 0) rows.push({ id: '__unassigned__', name: 'Unassigned', revenue: u.revenue, count: u.count })
    return rows
  })()

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Billing</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Invoices and payments</p>
        </div>
        <button onClick={() => { resetForm(); setShowAdd(true) }} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ New Invoice</button>
      </div>

      {actionError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Branch filter — only renders when the dentist has more than one
          clinic_locations row. Drives the stats tiles and the invoice list
          below. */}
      {locations.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Branch:</span>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', background: '#fff', cursor: 'pointer', outline: 'none' }}>
            <option value="all">All branches</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name || 'Branch'}{l.is_primary ? ' · primary' : ''}</option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Collected', value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: '#00A878', icon: '✅' },
          { label: 'Pending', value: `₹${pendingRevenue.toLocaleString('en-IN')}`, color: '#F59E0B', icon: '⏳' },
          { label: 'Total Invoices', value: branchScopedInvoices.length, color: 'var(--blue)', icon: '📄' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '18px' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Per-branch revenue card — only when the dentist has ≥2 branches.
          Shows paid revenue + invoice count per branch so a dentist running
          two clinics can see at a glance which one's pulling the numbers. */}
      {revenueByBranch.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Revenue by Branch · all time</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {revenueByBranch.map(r => (
              <div key={r.id} style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>🏥 {r.name}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#00A878' }}>₹{r.revenue.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.count} {r.count === 1 ? 'invoice' : 'invoices'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Invoice Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '28px', width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20 }}>{editingId ? 'Edit Invoice' : 'New Invoice'}</h2>
              <button onClick={() => { setShowAdd(false); resetForm() }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Patient *</label>
                <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select patient</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name} — {p.phone}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
              </div>
              {locations.length > 0 && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Branch</label>
                  <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">— Not assigned to a branch</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name || 'Branch'}{l.is_primary ? ' (primary)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <label style={labelStyle}>Treatment Items *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 0.6fr 1fr 1fr auto', gap: 8, marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
              <span>Treatment</span>
              <span>Qty</span>
              <span>Unit ₹</span>
              <span>Total ₹</span>
              <span></span>
            </div>
            {form.items.map((item, i) => {
              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.2fr 0.6fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={item.treatment_name} onChange={e => { const items = [...form.items]; items[i].treatment_name = e.target.value; setForm(f => ({ ...f, items })) }} placeholder="e.g. Root Canal Treatment" style={inputStyle} />
                  <input type="number" min="1" value={item.quantity} onChange={e => { const items = [...form.items]; items[i].quantity = e.target.value; setForm(f => ({ ...f, items })) }} placeholder="1" style={inputStyle} />
                  <input type="number" value={item.unit_price} onChange={e => { const items = [...form.items]; items[i].unit_price = e.target.value; setForm(f => ({ ...f, items })) }} placeholder="0" style={inputStyle} />
                  <div style={{ padding: '9px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>₹{lineTotal.toLocaleString('en-IN')}</div>
                  {form.items.length > 1
                    ? <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))} style={{ padding: '8px 10px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, cursor: 'pointer' }}>✕</button>
                    : <span style={{ width: 32 }} />}
                </div>
              )
            })}
            <button onClick={() => setForm(f => ({ ...f, items: [...f.items, { treatment_name: '', quantity: '1', unit_price: '' }] }))} style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', marginBottom: 14 }}>+ Add item</button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Discount (₹)</label>
                <input type="number" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} placeholder="0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Payment Status</label>
                <select value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">— Not specified —</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>GST (18%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff' }}>
                  <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, flexShrink: 0 }}>
                    <input type="checkbox" checked={form.gst_enabled} onChange={e => setForm(f => ({ ...f, gst_enabled: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span onClick={() => setForm(f => ({ ...f, gst_enabled: !f.gst_enabled }))} style={{ position: 'absolute', inset: 0, background: form.gst_enabled ? 'var(--blue)' : '#CBD5E1', borderRadius: 20, cursor: 'pointer', transition: '0.2s' }}>
                      <span style={{ position: 'absolute', height: 14, width: 14, left: form.gst_enabled ? 19 : 3, top: 3, background: '#fff', borderRadius: '50%', transition: '0.2s' }} />
                    </span>
                  </label>
                  <span style={{ fontSize: 13, color: form.gst_enabled ? 'var(--blue)' : 'var(--muted)' }}>{form.gst_enabled ? 'Apply GST' : 'No GST'}</span>
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment instructions, follow-up notes..." style={inputStyle} />
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px', margin: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                <span>₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              {discountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>Discount</span>
                <span style={{ color: '#00A878' }}>-₹{discountAmt.toLocaleString('en-IN')}</span>
              </div>}
              {form.gst_enabled && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>GST (18%)</span>
                <span>₹{gstAmt.toLocaleString('en-IN')}</span>
              </div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 6 }}>
                <span>Grand Total</span>
                <span style={{ color: 'var(--blue)' }}>₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdd(false); resetForm() }} style={{ padding: '10px 20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : (editingId ? 'Update Invoice' : 'Create Invoice')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No invoices yet</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Create your first invoice to start tracking payments</p>
          <button onClick={() => { resetForm(); setShowAdd(true) }} style={{ padding: '11px 24px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ New Invoice</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Invoice #', 'Patient', 'Date', 'Amount', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branchScopedInvoices.map(inv => {
                const sc = STATUS_COLORS[inv.payment_status] || STATUS_COLORS.pending
                return (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>
                      {inv.invoice_no}
                      {locations.length > 1 && inv.clinic_locations?.clinic_name && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, marginTop: 2 }}>🏥 {inv.clinic_locations.clinic_name}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      {/* Patient name is a link straight to the patient file
                          so the dentist can edit the patient or open
                          prescriptions/treatment plans without going via
                          the Patients tab. */}
                      {inv.patient_id ? (
                        <Link href={`/for-dentists/dashboard/patients/${inv.patient_id}`}
                          title="Open the patient's full file"
                          style={{ fontWeight: 600, color: 'var(--blue)', textDecoration: 'none' }}>
                          👤 {inv.patients?.name}
                        </Link>
                      ) : (
                        <div style={{ fontWeight: 500 }}>{inv.patients?.name}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.patients?.phone}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700 }}>₹{inv.total?.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>{inv.payment_status}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {inv.payment_status === 'pending' && (
                          <button onClick={() => updatePaymentStatus(inv.id, 'paid')}
                            style={{ padding: '5px 10px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Mark Paid
                          </button>
                        )}
                        {inv.payment_status === 'pending' && inv.patients?.phone && (
                          <button onClick={() => sendPaymentLink(inv)} disabled={linkLoading === inv.id}
                            style={{ padding: '5px 10px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: linkLoading === inv.id ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', opacity: linkLoading === inv.id ? 0.6 : 1 }}>
                            {linkLoading === inv.id ? 'Creating…' : '💳 Payment Link'}
                          </button>
                        )}
                        <button onClick={() => downloadPdf(inv)}
                          style={{ padding: '5px 10px', background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          ⬇ PDF
                        </button>
                        <button onClick={() => openEdit(inv)}
                          title="Edit items, amounts, or payment info"
                          style={{ padding: '5px 10px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          ✏ Edit
                        </button>
                        {inv.patients?.phone && (
                          <a href={`https://wa.me/91${inv.patients.phone.replace(/\D/g,'')}?text=Dear ${inv.patients.name}, your invoice ${inv.invoice_no} of ₹${inv.total} from ${new Date(inv.invoice_date).toLocaleDateString('en-IN')} is due. Please make payment at your earliest. Thank you.`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ padding: '5px 10px', background: '#25D366', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                            WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
