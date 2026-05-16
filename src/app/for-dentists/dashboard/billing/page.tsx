'use client'

import { useState, useEffect } from 'react'
import jsPDF from 'jspdf'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getCityBySlug } from '@/config/cities'

type DentistMeta = {
  id: string
  name: string | null
  clinic_name: string | null
  phone: string | null
  whatsapp: string | null
  city: string | null
  areas: { name: string | null } | null
}

export default function BillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [dentist, setDentist] = useState<DentistMeta | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linkLoading, setLinkLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [form, setForm] = useState({
    patient_id: '', date: new Date().toISOString().split('T')[0],
    items: [{ description: '', amount: '' }],
    discount: '', notes: '', payment_status: 'pending',
  })

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const { data: dentistRow } = await supabase
          .from('dentists')
          .select('id, name, clinic_name, phone, whatsapp, city, areas(name)')
          .eq('email', user.email)
          .single()
        if (!dentistRow) return
        setDentistId(dentistRow.id)
        setDentist(dentistRow as unknown as DentistMeta)
        const [{ data: inv }, { data: pat }] = await Promise.all([
          supabase.from('invoices').select('*, patients(name, phone)').eq('dentist_id', dentistRow.id).order('created_at', { ascending: false }),
          supabase.from('patients').select('id, name, phone').eq('dentist_id', dentistRow.id).order('name'),
        ])
        setInvoices(inv || [])
        setPatients(pat || [])
      } finally {
        // Always release the spinner so RLS denial or a missing dentist row
        // doesn't strand the page on "Loading…".
        setLoading(false)
      }
    }
    load()
  }, [])

  const subtotal = form.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
  const discountAmt = parseFloat(form.discount) || 0
  const total = subtotal - discountAmt

  async function handleSave() {
    if (!form.patient_id) { alert('Please select a patient'); return }
    if (form.items.some(i => !i.description || !i.amount)) { alert('Fill all item fields'); return }
    setSaving(true)
    const supabase = createClient()
    const invNo = `INV-${Date.now().toString().slice(-6)}`
    const { data } = await supabase.from('invoices').insert({
      invoice_no: invNo, dentist_id: dentistId, patient_id: form.patient_id,
      invoice_date: form.date,
      items: form.items.map(i => ({ description: i.description, amount: parseFloat(i.amount) })),
      subtotal, discount: discountAmt, total,
      notes: form.notes || null, payment_status: form.payment_status,
    }).select('*, patients(name, phone)').single()
    if (data) setInvoices(prev => [data, ...prev])
    setShowAdd(false)
    setForm({ patient_id: '', date: new Date().toISOString().split('T')[0], items: [{ description: '', amount: '' }], discount: '', notes: '', payment_status: 'pending' })
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
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const PAGE_W = doc.internal.pageSize.getWidth()
    const PAGE_H = doc.internal.pageSize.getHeight()
    const MARGIN = 48

    // Clinic header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(0, 87, 168) // var(--blue)
    doc.text(dentist.clinic_name || dentist.name || 'Clinic', MARGIN, MARGIN + 8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(60, 60, 60)
    const subtitleLines: string[] = []
    if (dentist.name && dentist.clinic_name) subtitleLines.push(dentist.name)
    const cityName = getCityBySlug(dentist.city).cityName
    const locale = dentist.areas?.name ? `${dentist.areas.name}, ${cityName}` : cityName
    subtitleLines.push(locale)
    const contact = dentist.phone || dentist.whatsapp
    if (contact) subtitleLines.push(`Phone: ${contact}`)
    subtitleLines.forEach((line, i) => {
      doc.text(line, MARGIN, MARGIN + 28 + (i * 14))
    })

    // Invoice meta (right side)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(15, 25, 35)
    doc.text('INVOICE', PAGE_W - MARGIN, MARGIN + 4, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(`# ${inv.invoice_no}`, PAGE_W - MARGIN, MARGIN + 22, { align: 'right' })
    const date = new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    doc.text(`Date: ${date}`, PAGE_W - MARGIN, MARGIN + 38, { align: 'right' })

    // Divider
    let cursorY = MARGIN + 90
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(1)
    doc.line(MARGIN, cursorY, PAGE_W - MARGIN, cursorY)
    cursorY += 22

    // Patient block
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('BILL TO', MARGIN, cursorY)
    cursorY += 14
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(15, 25, 35)
    doc.text(inv.patients?.name || 'Patient', MARGIN, cursorY)
    cursorY += 16
    if (inv.patients?.phone) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(80, 80, 80)
      doc.text(`Phone: ${inv.patients.phone}`, MARGIN, cursorY)
      cursorY += 14
    }

    // Items table
    cursorY += 18
    const COL_AMT_X = PAGE_W - MARGIN
    doc.setFillColor(245, 247, 252)
    doc.rect(MARGIN, cursorY - 14, PAGE_W - MARGIN * 2, 24, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('DESCRIPTION', MARGIN + 8, cursorY + 2)
    doc.text('AMOUNT', COL_AMT_X - 8, cursorY + 2, { align: 'right' })
    cursorY += 22

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(30, 41, 59)
    const items: { description: string; amount: number }[] = Array.isArray(inv.items) ? inv.items : []
    for (const item of items) {
      const desc = String(item.description ?? '')
      const wrapped = doc.splitTextToSize(desc, PAGE_W - MARGIN * 2 - 110) as string[]
      wrapped.forEach((line, idx) => {
        doc.text(line, MARGIN + 8, cursorY)
        if (idx === 0) {
          doc.text(`₹${Number(item.amount || 0).toLocaleString('en-IN')}`, COL_AMT_X - 8, cursorY, { align: 'right' })
        }
        cursorY += 16
      })
      doc.setDrawColor(238, 240, 244)
      doc.line(MARGIN, cursorY - 4, PAGE_W - MARGIN, cursorY - 4)
      cursorY += 6
    }

    // Totals
    cursorY += 12
    const totalLabelX = PAGE_W - MARGIN - 160
    const totalValueX = PAGE_W - MARGIN
    function row(label: string, value: string, bold = false, color: [number, number, number] = [30, 41, 59]) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(bold ? 14 : 11)
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(label, totalLabelX, cursorY)
      doc.text(value, totalValueX, cursorY, { align: 'right' })
      cursorY += bold ? 22 : 16
    }
    row('Subtotal', `₹${Number(inv.subtotal || 0).toLocaleString('en-IN')}`)
    if (Number(inv.discount) > 0) {
      row('Discount', `- ₹${Number(inv.discount).toLocaleString('en-IN')}`, false, [22, 101, 52])
    }
    doc.setDrawColor(200, 200, 200)
    doc.line(totalLabelX, cursorY - 2, totalValueX, cursorY - 2)
    cursorY += 6
    row('Total', `₹${Number(inv.total || 0).toLocaleString('en-IN')}`, true, [0, 87, 168])

    // Status badge
    cursorY += 6
    const status = (inv.payment_status || 'pending') as 'pending' | 'paid' | 'overdue'
    const badge: Record<string, { fill: [number, number, number]; text: [number, number, number]; label: string }> = {
      paid:    { fill: [220, 252, 231], text: [22, 101, 52],  label: 'PAID'    },
      pending: { fill: [254, 243, 199], text: [146, 64, 14],  label: 'PENDING' },
      overdue: { fill: [254, 226, 226], text: [153, 27, 27],  label: 'OVERDUE' },
    }
    const b = badge[status] ?? badge.pending
    const badgeW = 90
    const badgeX = PAGE_W - MARGIN - badgeW
    doc.setFillColor(b.fill[0], b.fill[1], b.fill[2])
    doc.roundedRect(badgeX, cursorY - 14, badgeW, 22, 11, 11, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(b.text[0], b.text[1], b.text[2])
    doc.text(b.label, badgeX + badgeW / 2, cursorY, { align: 'center' })
    cursorY += 16

    // Notes (optional)
    if (inv.notes) {
      cursorY += 16
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(100, 116, 139)
      doc.text('NOTES', MARGIN, cursorY)
      cursorY += 14
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(50, 50, 50)
      const wrapped = doc.splitTextToSize(String(inv.notes), PAGE_W - MARGIN * 2) as string[]
      wrapped.forEach(line => { doc.text(line, MARGIN, cursorY); cursorY += 14 })
    }

    // Footer
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(140, 140, 140)
    doc.text(`Powered by ${getCityBySlug(dentist.city).domain}`, PAGE_W / 2, PAGE_H - MARGIN / 2, { align: 'center' })

    doc.save(`Invoice-${inv.invoice_no}.pdf`)
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, display: 'block' as const, marginBottom: 4 }

  const STATUS_COLORS: Record<string, any> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    paid: { bg: '#DCFCE7', text: '#166534' },
    overdue: { bg: '#FEE2E2', text: '#991B1B' },
  }

  const totalRevenue = invoices.filter(i => i.payment_status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0)
  const pendingRevenue = invoices.filter(i => i.payment_status === 'pending').reduce((sum, i) => sum + (i.total || 0), 0)

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Billing</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Invoices and payments</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ New Invoice</button>
      </div>

      {actionError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Collected', value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: '#00A878', icon: '✅' },
          { label: 'Pending', value: `₹${pendingRevenue.toLocaleString('en-IN')}`, color: '#F59E0B', icon: '⏳' },
          { label: 'Total Invoices', value: invoices.length, color: 'var(--blue)', icon: '📄' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '18px' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* New Invoice Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '28px', width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20 }}>New Invoice</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
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
            </div>

            <label style={labelStyle}>Items *</label>
            {form.items.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, marginBottom: 8 }}>
                <input value={item.description} onChange={e => { const items = [...form.items]; items[i].description = e.target.value; setForm(f => ({ ...f, items })) }} placeholder="Treatment description" style={inputStyle} />
                <input type="number" value={item.amount} onChange={e => { const items = [...form.items]; items[i].amount = e.target.value; setForm(f => ({ ...f, items })) }} placeholder="₹ Amount" style={inputStyle} />
                {form.items.length > 1 && <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))} style={{ padding: '8px 10px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, cursor: 'pointer' }}>✕</button>}
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, items: [...f.items, { description: '', amount: '' }] }))} style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', marginBottom: 14 }}>+ Add item</button>

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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 6 }}>
                <span>Total</span>
                <span style={{ color: 'var(--blue)' }}>₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? 'Saving...' : 'Create Invoice'}</button>
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
          <button onClick={() => setShowAdd(true)} style={{ padding: '11px 24px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ New Invoice</button>
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
              {invoices.map(inv => {
                const sc = STATUS_COLORS[inv.payment_status] || STATUS_COLORS.pending
                return (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{inv.invoice_no}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      <div style={{ fontWeight: 500 }}>{inv.patients?.name}</div>
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
