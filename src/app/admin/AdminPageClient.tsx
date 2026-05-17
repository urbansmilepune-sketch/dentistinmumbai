'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminShell from './AdminShell'
import CommunicationsTab from './CommunicationsTab'
import { CITY_CONFIGS, cityOrigin, getCityBySlug } from '@/config/cities'

interface AdminPageClientProps {
  stats: any
  dentists: any[]
  registrations: any[]
  appointments: any[]
  enquiries: any[]
  reviews: any[]
  areas: any[]
  foundingConfig: any
  analytics: any
  cityFilter: string | null
  /** Global slim dentist list (every active dentist with an email) used
   * specifically by the Communications tab — independent of the cityFilter
   * URL param and not capped at 100 rows. */
  commsDentists: any[]
}

// User-requested display order for the city dropdown — All Cities first,
// then the 13 cities in the order they want to see them. Anything not in
// this list is appended at the end so an unexpected slug isn't dropped.
const CITY_DROPDOWN_ORDER = [
  'mumbai', 'pune', 'thane', 'nashik', 'nagpur', 'goa', 'surat',
  'kolhapur', 'sambhajinagar', 'rajkot', 'ahmedabad', 'jamnagar', 'navimumbai',
]

function CityFilterDropdown({ value }: { value: string | null }) {
  const router = useRouter()
  const params = useSearchParams()
  function onChange(next: string) {
    const sp = new URLSearchParams(params.toString())
    if (next === 'all') sp.delete('city')
    else sp.set('city', next)
    const qs = sp.toString()
    router.push(qs ? `/admin?${qs}` : '/admin')
  }
  const all = Object.keys(CITY_CONFIGS)
  const ordered = [
    ...CITY_DROPDOWN_ORDER.filter(s => all.includes(s)),
    ...all.filter(s => !CITY_DROPDOWN_ORDER.includes(s)),
  ]
  return (
    <select
      value={value ?? 'all'}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 32px 8px 12px', borderRadius: 8,
        border: '1px solid var(--border)', fontSize: 13,
        fontFamily: 'var(--font-body)', outline: 'none', background: '#fff',
        cursor: 'pointer', minWidth: 180,
      }}
    >
      <option value="all">All Cities</option>
      {ordered.map(slug => (
        <option key={slug} value={slug}>{(CITY_CONFIGS as any)[slug].cityName}</option>
      ))}
    </select>
  )
}

function CityFilterBar({ cityFilter, label }: { cityFilter: string | null; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20, padding: '10px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        🌆 {label || 'City filter'}
      </span>
      <CityFilterDropdown value={cityFilter} />
    </div>
  )
}

function CityBadge({ slug }: { slug: string | null | undefined }) {
  if (!slug) return null
  const cfg = (CITY_CONFIGS as any)[slug]
  if (!cfg) return null
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8',
      border: '1px solid #BFDBFE', textTransform: 'uppercase', letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>{cfg.cityName}</span>
  )
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--text)' }}>
      {children}
    </h2>
  )
}

function MetricCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, color: color || 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function LeaderboardCard({ title, rows, valueLabel }: { title: string; rows: { name: string; clinic: string | null; slug: string; value: number }[]; valueLabel: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{title}</h3>
        <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{valueLabel}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No data yet.</div>
      ) : (
        <div>
          {rows.map((r, i) => (
            <div key={r.slug + i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', gap: 10, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: i < 3 ? '#F59E0B' : 'var(--muted)', textAlign: 'center' }}>#{i + 1}</span>
              <a href={`/dentist/${r.slug}`} target="_blank" style={{ minWidth: 0, textDecoration: 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                {r.clinic && <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.clinic}</div>}
              </a>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--blue)' }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
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

// Sits below the approved Badge to disambiguate the two paths a registration
// can take to approved: the public POST /api/registrations auto-approval gate
// vs. an admin clicking Approve in the panel. Legacy rows from before the
// auto_approved column existed default to false → render as "Manually approved",
// which is accurate for any pre-feature row (only the admin button could
// flip status='approved' at the time).
function ApprovalSourceBadge({ autoApproved }: { autoApproved: boolean }) {
  return autoApproved ? (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>
      ⚡ Auto-approved
    </span>
  ) : (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>
      👤 Manually approved
    </span>
  )
}

export default function AdminPageClient({ stats, dentists, registrations, appointments, enquiries, reviews, areas, foundingConfig, analytics, cityFilter, commsDentists }: AdminPageClientProps) {
  const [section, setSection] = useState('dashboard')
  const [dentistList, setDentistList] = useState(dentists)
  const [reviewList, setReviewList] = useState(reviews)
  const [regList, setRegList] = useState(registrations)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  // Per-dentist transient state for the "Login Link" action. Keyed by
  // dentist id; auto-clears after 4–6s via setTimeout in sendLoginLink so
  // the row reverts to its idle button.
  const [linkStatus, setLinkStatus] = useState<Record<string, { state: 'sending' | 'sent' | 'error'; error?: string }>>({})

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

  // Manual escape hatch for dentists who registered before the auto-login
  // fix landed — they have a dentists row but no auth.users record, so they
  // can't sign in until this button mints them a magic link. POST → branded
  // Resend email with a one-click dashboard URL. Feedback is inline on the
  // button itself (no alert / confirm dialogs) so the admin can fire several
  // in a row without dismissing modals.
  async function sendLoginLink(d: any) {
    if (!d.email) {
      setLinkStatus(s => ({ ...s, [d.id]: { state: 'error', error: 'No email on file' } }))
      setTimeout(() => setLinkStatus(s => { const next = { ...s }; delete next[d.id]; return next }), 5000)
      return
    }
    setLinkStatus(s => ({ ...s, [d.id]: { state: 'sending' } }))
    try {
      const res = await fetch('/api/auth/send-login-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: d.email }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setLinkStatus(s => ({ ...s, [d.id]: { state: 'sent' } }))
        setTimeout(() => setLinkStatus(s => { const next = { ...s }; delete next[d.id]; return next }), 4000)
      } else {
        setLinkStatus(s => ({ ...s, [d.id]: { state: 'error', error: data?.error || 'Send failed' } }))
        setTimeout(() => setLinkStatus(s => { const next = { ...s }; delete next[d.id]; return next }), 6000)
      }
    } catch {
      setLinkStatus(s => ({ ...s, [d.id]: { state: 'error', error: 'Network error' } }))
      setTimeout(() => setLinkStatus(s => { const next = { ...s }; delete next[d.id]; return next }), 6000)
    }
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
    // Require a non-empty reason. The decline email lands in the dentist's
    // inbox verbatim — an empty reason produces "We've declined your
    // registration. Reason: " with a trailing space and no explanation,
    // which is worse UX than no email at all. prompt() returns null on
    // Cancel; a whitespace-only string is rejected with a re-try alert
    // and we bail (admin clicks Decline again).
    const reason = prompt('Reason for declining (emailed to dentist — required):')
    if (reason === null) return
    if (!reason.trim()) { alert('A reason is required to decline a registration.'); return }
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration_id: id, action: 'decline', reason: reason.trim() }) })
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
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            <Badge status={r.status} />
                            {r.status === 'approved' && <ApprovalSourceBadge autoApproved={!!r.auto_approved} />}
                          </div>
                        </td>
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

        {/* ANALYTICS */}
        {section === 'analytics' && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Analytics</h1>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>Platform health, revenue, engagement, and growth — all in one place.</p>
            </div>

            <CityFilterBar cityFilter={cityFilter} label="Scope metrics to city" />

            {/* CITY OVERVIEW — always all-cities, regardless of the filter above. */}
            <SectionTitle>City Overview <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· every city, all-time</span></SectionTitle>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['City', 'Registered', 'Active', 'Pending', 'Patients'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'City' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(analytics.cityOverview as Array<{ slug: string; cityName: string; domain: string; registered: number; active: number; pending: number; patients: number }>).map((c, i) => (
                    <tr key={c.slug} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{c.cityName}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.domain}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'right', fontWeight: 600 }}>{c.registered}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'right', fontWeight: 700, color: c.active > 0 ? 'var(--green)' : 'var(--muted)' }}>{c.active}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'right', fontWeight: 700, color: c.pending > 0 ? '#F59E0B' : 'var(--muted)' }}>{c.pending}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'right', color: 'var(--text-secondary)' }}>{c.patients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ROW 1 — Platform Health */}
            <SectionTitle>Platform Health</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
              <MetricCard
                icon="📋"
                label="Total Registrations"
                value={analytics.totalRegistrations}
                sub={`+${analytics.registrationsThisWeek} this week`}
                color="var(--blue)"
              />
              <MetricCard
                icon="⏳"
                label="Pending Approvals"
                value={analytics.pendingApprovals}
                sub={analytics.pendingApprovals > 0 ? `Avg wait ${analytics.avgPendingWaitHrs.toFixed(1)} h` : 'All caught up'}
                color="#F59E0B"
              />
              <MetricCard
                icon="🦷"
                label="Active Dentists"
                value={analytics.activeDentists}
                sub={`${stats.foundingPct.toFixed(0)}% of 250 founding slots`}
                color="var(--green)"
              />
              <MetricCard
                icon="👥"
                label="Total Patients"
                value={analytics.totalPatients}
                sub="Across all clinics"
                color="#7C3AED"
              />
            </div>

            {/* ROW 2 — Revenue */}
            <SectionTitle>Revenue</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
              <MetricCard
                icon="💰"
                label="Paid Dentists"
                value={analytics.paidDentists}
                sub={`${analytics.goldCount} gold · ${analytics.featuredCount} featured`}
                color="#D97706"
              />
              <MetricCard
                icon="📅"
                label="MRR"
                value={`₹${analytics.mrr.toLocaleString('en-IN')}`}
                sub="Monthly recurring"
                color="var(--green)"
              />
              <MetricCard
                icon="🚀"
                label="ARR"
                value={`₹${analytics.arr.toLocaleString('en-IN')}`}
                sub="Annual recurring"
                color="var(--blue)"
              />
              <MetricCard
                icon="🎯"
                label="Conversion Rate"
                value={`${analytics.conversionPct.toFixed(1)}%`}
                sub="Paid / active dentists"
                color="#EC4899"
              />
            </div>

            {/* ROW 3 — Engagement (last 30 days) */}
            <SectionTitle>Engagement <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· last 30 days</span></SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
              <MetricCard
                icon="👁️"
                label="Profile Views"
                value={analytics.engagement.profile_views}
                sub="Across all dentists"
                color="var(--blue)"
              />
              <MetricCard
                icon="💚"
                label="WhatsApp Clicks"
                value={analytics.engagement.whatsapp_clicks}
                sub="Direct lead clicks"
                color="#25D366"
              />
              <MetricCard
                icon="📲"
                label="Booking Clicks"
                value={analytics.engagement.booking_clicks}
                sub="Clicked Book Now"
                color="#92400E"
              />
              <MetricCard
                icon="📅"
                label="Appointments Booked"
                value={analytics.engagement.appointments_last30}
                sub="Submitted via platform"
                color="#0EA5E9"
              />
            </div>

            {/* ROW 4 — Top Performers */}
            <SectionTitle>Top Performers</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 28 }}>
              <LeaderboardCard
                title="Top 10 by Profile Views"
                rows={(analytics.topByViews as any[]).map(d => ({
                  name: d.name, clinic: d.clinic_name, slug: d.slug, value: d.profile_views || 0,
                }))}
                valueLabel="views"
              />
              <LeaderboardCard
                title="Top 10 by Appointments"
                rows={(analytics.topByAppointments as any[]).map(d => ({
                  name: d.name, clinic: d.clinic_name, slug: d.slug, value: d.count,
                }))}
                valueLabel="appts"
              />
              <LeaderboardCard
                title="Top 10 by WhatsApp Clicks"
                rows={(analytics.topByWhatsApp as any[]).map(d => ({
                  name: d.name, clinic: d.clinic_name, slug: d.slug, value: d.whatsapp_clicks || 0,
                }))}
                valueLabel="clicks"
              />
            </div>

            {/* ROW 5 — Registration Funnel */}
            <SectionTitle>Registration Funnel <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· this week</span></SectionTitle>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 28 }}>
              {(() => {
                const f = analytics.funnel
                const stages: { label: string; value: number; color: string }[] = [
                  { label: 'Registered this week', value: f.registeredThisWeek, color: 'var(--blue)' },
                  { label: 'Approved this week',   value: f.approvedThisWeek,   color: '#00A878' },
                  { label: 'Pending approval',     value: f.pending,            color: '#F59E0B' },
                  { label: 'Rejected this week',   value: f.rejectedThisWeek,   color: '#DC2626' },
                ]
                const maxVal = Math.max(1, ...stages.map(s => s.value))
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {stages.map(s => (
                      <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 60px', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{s.label}</span>
                        <div style={{ height: 22, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ height: '100%', width: `${(s.value / maxVal) * 100}%`, background: s.color, borderRadius: 6, transition: 'width 0.4s', minWidth: s.value > 0 ? 4 : 0 }} />
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: s.color, textAlign: 'right' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* ROW 6 — Area Coverage */}
            <SectionTitle>Area Coverage <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· dentists per area</span></SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 28 }}>
              {/* Top areas */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>📍 Most Populated</h3>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(analytics.areas.populated as any[]).length} areas live</span>
                </div>
                {(analytics.areas.populated as any[]).length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No active areas yet.</div>
                ) : (
                  <div>
                    {(() => {
                      const top = (analytics.areas.populated as any[]).slice(0, 10)
                      const maxCount = Math.max(1, ...top.map(a => a.dentist_count || 0))
                      return top.map(a => (
                        <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px', alignItems: 'center', gap: 10, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                          <div style={{ height: 14, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${((a.dentist_count || 0) / maxCount) * 100}%`, background: 'var(--blue)', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', textAlign: 'right' }}>{a.dentist_count || 0}</span>
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>

              {/* Opportunity (empty) areas */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>🎯 Opportunity Map</h3>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(analytics.areas.empty as any[]).length} areas with 0 dentists</span>
                </div>
                {(analytics.areas.empty as any[]).length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Every area has at least one dentist 🎉</div>
                ) : (
                  <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(analytics.areas.empty as any[]).map(a => (
                      <span key={a.id} style={{ fontSize: 12, padding: '4px 10px', background: '#FEF3C7', color: '#92400E', borderRadius: 12, fontWeight: 600 }}>
                        {a.name}{a.zone ? ` · ${a.zone}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* REGISTRATIONS */}
        {section === 'registrations' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 16 }}>Dentist Registrations</h1>
            <CityFilterBar cityFilter={cityFilter} />
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{['Ref', 'Name', 'Clinic', 'City', 'Area', 'Phone', 'Qualification', 'MCI No.', 'Spot #', 'Status', 'Actions'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {regList.map(r => (
                    <tr key={r.id}>
                      <td style={tableCellStyle}><span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{r.ref_no}</span></td>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.email}</div></td>
                      <td style={tableCellStyle}>{r.clinic_name}</td>
                      <td style={tableCellStyle}><CityBadge slug={r.city} /></td>
                      <td style={tableCellStyle}>{r.area}</td>
                      <td style={tableCellStyle}><a href={`tel:${r.phone}`} style={{ color: 'var(--blue)' }}>{r.phone}</a></td>
                      <td style={tableCellStyle}>{r.qualification}</td>
                      <td style={tableCellStyle}>{r.mci_registration}</td>
                      <td style={tableCellStyle}><span style={{ fontWeight: 700, color: '#F59E0B' }}>#{r.founding_number}</span></td>
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <Badge status={r.status} />
                          {r.status === 'approved' && <ApprovalSourceBadge autoApproved={!!r.auto_approved} />}
                        </div>
                      </td>
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
                  {regList.length === 0 && <tr><td colSpan={11} style={{ ...tableCellStyle, textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No registrations yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DENTISTS */}
        {section === 'dentists' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>Dentists</h1>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or clinic..." style={{ ...inputStyle, width: 280 }} />
            </div>
            <CityFilterBar cityFilter={cityFilter} />
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{['Name', 'Clinic', 'City', 'Area', 'Phone', 'Tier', 'Verified', 'Actions'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredDentists.map(d => (
                    <tr key={d.id}>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{d.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.qualifications}</div></td>
                      <td style={tableCellStyle}>{d.clinic_name}</td>
                      <td style={tableCellStyle}><CityBadge slug={d.city} /></td>
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
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <a href={`${cityOrigin(getCityBySlug(d.city))}/dentist/${d.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>View →</a>
                          {(() => {
                            const status = linkStatus[d.id]
                            const sending = status?.state === 'sending'
                            const sent = status?.state === 'sent'
                            const errored = status?.state === 'error'
                            // Three visual states drive one button: idle = blue,
                            // sent = green "✓ Sent!", error = red with the upstream
                            // message tucked into title= for hover. setTimeout
                            // in sendLoginLink restores the idle look.
                            const palette = sent
                              ? { bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' }
                              : errored
                                ? { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' }
                                : { bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' }
                            const label = sending ? 'Sending…' : sent ? '✓ Sent!' : errored ? '✕ Failed' : '📧 Login Link'
                            return (
                              <button
                                onClick={() => sendLoginLink(d)}
                                disabled={sending || !d.email}
                                title={errored ? status?.error : d.email ? `Send a fresh magic link to ${d.email}` : 'No email on file'}
                                style={{ padding: '4px 10px', background: palette.bg, color: palette.color, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: sending || !d.email ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: !d.email ? 0.5 : 1, whiteSpace: 'nowrap', transition: 'background 0.2s, color 0.2s' }}
                              >
                                {label}
                              </button>
                            )
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredDentists.length === 0 && <tr><td colSpan={8} style={{ ...tableCellStyle, textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No dentists found</td></tr>}
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

            <CityFilterBar cityFilter={cityFilter} />

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
                        {(r as any).dentists.city && <span style={{ marginLeft: 6 }}><CityBadge slug={(r as any).dentists.city} /></span>}
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

        {/* COMMUNICATIONS */}
        {section === 'communications' && (
          <CommunicationsTab dentists={commsDentists} />
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
