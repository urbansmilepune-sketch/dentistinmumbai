'use client'

import { useState } from 'react'
import AdminShell from './AdminShell'

interface AdminPageClientProps {
  stats: any
  dentists: any[]
  registrations: any[]
  appointments: any[]
  enquiries: any[]
  reviews: any[]
  areas: any[]
  foundingConfig: any
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    approved: { bg: '#DCFCE7', text: '#166534' },
    rejected: { bg: '#FEE2E2', text: '#991B1B' },
    active: { bg: '#DCFCE7', text: '#166534' },
    confirmed: { bg: '#DBEAFE', text: '#1D4ED8' },
    completed: { bg: '#F3F4F6', text: '#374151' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B' },
    new: { bg: '#FEF3C7', text: '#92400E' },
    contacted: { bg: '#DBEAFE', text: '#1D4ED8' },
    closed: { bg: '#F3F4F6', text: '#374151' },
    free: { bg: '#F3F4F6', text: '#374151' },
    silver: { bg: '#F1F5F9', text: '#475569' },
    gold: { bg: '#FEF3C7', text: '#92400E' },
    featured: { bg: '#FFF7ED', text: '#C2410C' },
  }
  const c = colors[status] || { bg: '#F3F4F6', text: '#374151' }
  return (
    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}>
      {status}
    </span>
  )
}

export default function AdminPageClient({ stats, dentists, registrations, appointments, enquiries, reviews, areas, foundingConfig }: AdminPageClientProps) {
  const [section, setSection] = useState('dashboard')
  const [dentistList, setDentistList] = useState(dentists)
  const [reviewList, setReviewList] = useState(reviews)
  const [regList, setRegList] = useState(registrations)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')

  async function adminAction(endpoint: string, body: any, id: string) {
    setActionLoading(id)
    await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setActionLoading(null)
  }

  async function verifyDentist(id: string, verified: boolean) {
    await adminAction('/api/admin/dentists', { id, is_verified: !verified }, id)
    setDentistList(prev => prev.map(d => d.id === id ? { ...d, is_verified: !verified } : d))
  }

  async function changeTier(id: string, tier: string) {
    await adminAction('/api/admin/dentists', { id, tier }, id)
    setDentistList(prev => prev.map(d => d.id === id ? { ...d, tier } : d))
  }

  async function reviewAction(id: string, status: string) {
    await adminAction('/api/admin/reviews', { id, status }, id)
    setReviewList(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  async function approveReg(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration_id: id, action: 'approve' }) })
      const data = await res.json()
      if (data.success) { setRegList(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r)); alert('Approved! Profile: /dentist/' + data.slug) }
      else alert('Error: ' + (data.error || 'Unknown'))
    } catch { alert('Network error') }
    setActionLoading(null)
  }

  async function declineReg(id: string) {
    const reason = prompt('Reason for declining (emailed to dentist):')
    if (reason === null) return
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration_id: id, action: 'decline', reason }) })
      const data = await res.json()
      if (data.success) { setRegList(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r)); alert('Declined. Email sent.') }
      else alert('Error: ' + (data.error || 'Unknown'))
    } catch { alert('Network error') }
    setActionLoading(null)
  }

  const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }
  const tableHeaderStyle = { padding: '10px 16px', textAlign: 'left' as const, fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--bg)', whiteSpace: 'nowrap' as const }
  const tableCellStyle = { padding: '12px 16px', fontSize: 13, borderTop: '1px solid var(--border)', verticalAlign: 'middle' as const }

  const filteredDentists = dentistList.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.clinic_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <AdminShell activeSection={section} onSectionChange={setSection} stats={stats} />

      {/* Main content */}
      <div style={{ flex: 1, marginLeft: 220, padding: '28px', minWidth: 0 }} className="admin-main">

        {/* DASHBOARD */}
        {section === 'dashboard' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Dashboard</h1>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>Welcome back. Here's what's happening.</p>
            </div>

            {/* Founding counter */}
            <div style={{ background: 'linear-gradient(135deg, #003F7A, #0057A8)', borderRadius: 16, padding: '24px', marginBottom: 24, color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>🏅 Founding Member Progress</p>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36 }}>{stats.dentistCount} <span style={{ fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.6)' }}>/ 250</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#FBBF24' }}>{stats.foundingPct.toFixed(0)}%</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{250 - stats.dentistCount} spots left</div>
                </div>
              </div>
              <div style={{ marginTop: 16, height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #F59E0B, #FBBF24)', borderRadius: 4, width: `${stats.foundingPct}%`, transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
              <StatCard icon="🦷" label="Active Dentists" value={stats.dentistCount} color="var(--blue)" />
              <StatCard icon="📋" label="Pending Registrations" value={stats.registrationCount} color="#F59E0B" />
              <StatCard icon="📅" label="Total Appointments" value={stats.appointmentCount} color="var(--green)" />
              <StatCard icon="⭐" label="Reviews Pending" value={stats.reviewPendingCount} color="var(--orange)" />
              <StatCard icon="💬" label="Enquiries" value={stats.enquiryCount} color="var(--blue)" />
            </div>

            {/* Recent registrations */}
            {registrations.slice(0, 5).length > 0 && (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Latest Registrations</h3>
                  <button onClick={() => setSection('registrations')} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Name', 'Clinic', 'Area', 'Status', 'Date'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {registrations.slice(0, 5).map(r => (
                      <tr key={r.id}>
                        <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.ref_no}</div></td>
                        <td style={tableCellStyle}>{r.clinic_name}</td>
                        <td style={tableCellStyle}>{r.area}</td>
                        <td style={tableCellStyle}><Badge status={r.status} /></td>
                        <td style={tableCellStyle}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent reviews pending */}
            {reviews.filter(r => r.status === 'pending').slice(0, 3).length > 0 && (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>⭐ Reviews Awaiting Approval</h3>
                  <button onClick={() => setSection('reviews')} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
                </div>
                {reviews.filter(r => r.status === 'pending').slice(0, 3).map(r => (
                  <div key={r.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.patient_name} <span style={{ color: '#F59E0B' }}>{'★'.repeat(r.rating)}</span></div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{r.review_text?.slice(0, 80)}...</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => reviewAction(r.id, 'approved')} style={{ padding: '6px 12px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✓ Approve</button>
                      <button onClick={() => reviewAction(r.id, 'rejected')} style={{ padding: '6px 12px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✕ Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* REGISTRATIONS */}
        {section === 'registrations' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 24 }}>Dentist Registrations</h1>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Ref', 'Name', 'Clinic', 'Area', 'Phone', 'Qualification', 'MCI No.', 'Spot #', 'Status', 'Actions'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {regList.map(r => (
                    <tr key={r.id}>
                      <td style={tableCellStyle}><span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{r.ref_no}</span></td>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.email}</div></td>
                      <td style={tableCellStyle}>{r.clinic_name}</td>
                      <td style={tableCellStyle}>{r.area}</td>
                      <td style={tableCellStyle}><a href={`tel:${r.phone}`} style={{ color: 'var(--blue)' }}>{r.phone}</a></td>
                      <td style={tableCellStyle}>{r.qualification}</td>
                      <td style={tableCellStyle}>{r.mci_registration}</td>
                      <td style={tableCellStyle}><span style={{ fontWeight: 700, color: '#F59E0B' }}>#{r.founding_number}</span></td>
                      <td style={tableCellStyle}><Badge status={r.status} /></td>
                      <td style={tableCellStyle}>
                        {r.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => approveReg(r.id)} disabled={actionLoading === r.id} style={{ padding: '5px 10px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✓ Approve</button>
                            <button onClick={() => declineReg(r.id)} disabled={actionLoading === r.id} style={{ padding: '5px 10px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✕ Decline</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {regList.length === 0 && <tr><td colSpan={10} style={{ ...tableCellStyle, textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No registrations yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DENTISTS */}
        {section === 'dentists' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>Dentists</h1>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or clinic..." style={{ ...inputStyle, width: 280 }} />
            </div>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead><tr>{['Name', 'Clinic', 'Area', 'Phone', 'Tier', 'Verified', 'Actions'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredDentists.map(d => (
                    <tr key={d.id}>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{d.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.qualifications}</div></td>
                      <td style={tableCellStyle}>{d.clinic_name}</td>
                      <td style={tableCellStyle}>{(d.areas as any)?.name || '—'}</td>
                      <td style={tableCellStyle}><a href={`tel:${d.phone}`} style={{ color: 'var(--blue)' }}>{d.phone}</a></td>
                      <td style={tableCellStyle}>
                        <select value={d.tier} onChange={e => changeTier(d.id, e.target.value)} style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}>
                          {['free', 'silver', 'gold', 'featured'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={tableCellStyle}>
                        <button onClick={() => verifyDentist(d.id, d.is_verified)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: d.is_verified ? '#DCFCE7' : '#F3F4F6', color: d.is_verified ? '#166534' : 'var(--muted)' }}>
                          {d.is_verified ? '✓ Verified' : '○ Unverified'}
                        </button>
                      </td>
                      <td style={tableCellStyle}>
                        <a href={`/dentist/${d.slug}`} target="_blank" style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>View →</a>
                      </td>
                    </tr>
                  ))}
                  {filteredDentists.length === 0 && <tr><td colSpan={7} style={{ ...tableCellStyle, textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No dentists found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* APPOINTMENTS */}
        {section === 'appointments' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 24 }}>Appointments</h1>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{['Reference', 'Patient', 'Dentist', 'Date', 'Time', 'Treatment', 'Status'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {appointments.map(a => (
                    <tr key={a.id}>
                      <td style={tableCellStyle}><span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--blue)' }}>{a.reference_no}</span></td>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{a.patient_name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.patient_phone}</div></td>
                      <td style={tableCellStyle}>{(a.dentists as any)?.name || '—'}</td>
                      <td style={tableCellStyle}>{new Date(a.appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                      <td style={tableCellStyle}>{a.time_slot}</td>
                      <td style={tableCellStyle}>{(a.treatments as any)?.name || 'General'}</td>
                      <td style={tableCellStyle}><Badge status={a.status} /></td>
                    </tr>
                  ))}
                  {appointments.length === 0 && <tr><td colSpan={7} style={{ ...tableCellStyle, textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No appointments yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ENQUIRIES */}
        {section === 'enquiries' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 24 }}>Enquiries</h1>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{['Patient', 'Dentist', 'Treatment', 'Message', 'Source', 'Status', 'Date'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {enquiries.map(e => (
                    <tr key={e.id}>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{e.patient_name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{e.patient_phone}</div></td>
                      <td style={tableCellStyle}>{(e.dentists as any)?.name || '—'}</td>
                      <td style={tableCellStyle}>{e.treatment || '—'}</td>
                      <td style={tableCellStyle}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.message?.slice(0, 60)}{e.message?.length > 60 ? '...' : ''}</span></td>
                      <td style={tableCellStyle}><Badge status={e.source || 'form'} /></td>
                      <td style={tableCellStyle}><Badge status={e.status} /></td>
                      <td style={tableCellStyle}>{new Date(e.created_at).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                  {enquiries.length === 0 && <tr><td colSpan={7} style={{ ...tableCellStyle, textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No enquiries yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REVIEWS */}
        {section === 'reviews' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 16 }}>Reviews</h1>

            {/* Status filter pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {(['pending', 'approved', 'rejected'] as const).map(status => {
                const count = reviewList.filter(r => r.status === status).length
                const active = reviewFilter === status
                return (
                  <button
                    key={status}
                    onClick={() => setReviewFilter(status)}
                    style={{
                      padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                      fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s',
                      background: active ? 'var(--blue)' : '#fff',
                      color: active ? '#fff' : 'var(--text)',
                      border: `1.5px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                    }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)} <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reviewList.filter(r => r.status === reviewFilter).map(r => (
                <div key={r.id} style={{ background: '#fff', border: `1px solid ${r.status === 'pending' ? '#FDE68A' : 'var(--border)'}`, borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{r.patient_name}</span>
                      <span style={{ color: '#F59E0B' }}>{'★'.repeat(r.rating)}</span>
                      <Badge status={r.status} />
                    </div>
                    {(r as any).dentists?.name && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                        For <strong style={{ color: 'var(--text-secondary)' }}>{(r as any).dentists.name}</strong>
                        {(r as any).dentists.clinic_name ? ` · ${(r as any).dentists.clinic_name}` : ''}
                      </div>
                    )}
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{r.review_text}</p>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {r.treatment && <span>Treatment: {r.treatment} · </span>}
                      {new Date(r.created_at).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                  {r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => reviewAction(r.id, 'approved')} disabled={actionLoading === r.id} style={{ padding: '7px 16px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✓ Approve</button>
                      <button onClick={() => reviewAction(r.id, 'rejected')} disabled={actionLoading === r.id} style={{ padding: '7px 16px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>✕ Reject</button>
                    </div>
                  )}
                </div>
              ))}
              {reviewList.filter(r => r.status === reviewFilter).length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  No {reviewFilter} reviews
                </div>
              )}
            </div>
          </div>
        )}

        {/* AREAS */}
        {section === 'areas' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 24 }}>Areas</h1>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Area', 'Zone', 'Slug', 'Dentist Count', 'Area Page'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {areas.map(a => (
                    <tr key={a.id}>
                      <td style={{ ...tableCellStyle, fontWeight: 600 }}>{a.name}</td>
                      <td style={tableCellStyle}>{a.zone}</td>
                      <td style={tableCellStyle}><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{a.slug}</span></td>
                      <td style={tableCellStyle}>{a.dentist_count || 0}</td>
                      <td style={tableCellStyle}><a href={`/area/${a.slug}`} target="_blank" style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>View →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {section === 'settings' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 24 }}>Settings</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Founding Member Config</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg)', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Founding Unlock Limit</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pricing page shows after this many dentists</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--blue)' }}>{foundingConfig?.unlock_at || 250}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg)', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Pricing Page</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Current status</div>
                    </div>
                    <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: foundingConfig?.pricing_visible ? '#DCFCE7' : '#FEE2E2', color: foundingConfig?.pricing_visible ? '#166534' : '#991B1B' }}>
                      {foundingConfig?.pricing_visible ? 'Visible' : 'Hidden'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Site Links</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Homepage', href: '/' },
                    { label: 'Find Dentists', href: '/dentists' },
                    { label: 'For Dentists', href: '/for-dentists' },
                  ].map(link => (
                    <a key={link.href} href={link.href} target="_blank" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 14, color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>
                      {link.label} <span>→</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BLOG placeholder */}
        {section === 'blog' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 24 }}>Blog</h1>
            <div style={{ textAlign: 'center', padding: '80px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✍️</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Blog Editor Coming Soon</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Create and manage blog posts for SEO.</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .admin-main { margin-left: 0 !important; padding: 16px !important; }
        }
      `}</style>
    </div>
  )
}
