'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function BillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [invoices, setInvoices] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    patient_id: '', date: new Date().toISOString().split('T')[0],
    items: [{ description: '', amount: '' }],
    discount: '', notes: '', payment_status: 'pending',
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) return
      setDentistId(dentist.id)
      const [{ data: inv }, { data: pat }] = await Promise.all([
        supabase.from('invoices').select('*, patients(name, phone)').eq('dentist_id', dentist.id).order('created_at', { ascending: false }),
        supabase.from('patients').select('id, name, phone').eq('dentist_id', dentist.id).order('name'),
      ])
      setInvoices(inv || [])
      setPatients(pat || [])
      setLoading(false)
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
    const supabase = createClient()
    await supabase.from('invoices').update({ payment_status: status }).eq('id', id)
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, payment_status: status } : inv))
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
                      <div style={{ display: 'flex', gap: 6 }}>
                        {inv.payment_status === 'pending' && (
                          <button onClick={() => updatePaymentStatus(inv.id, 'paid')}
                            style={{ padding: '5px 10px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Mark Paid
                          </button>
                        )}
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
