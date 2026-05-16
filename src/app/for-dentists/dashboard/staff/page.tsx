'use client'

import { useEffect, useState } from 'react'

type Role = 'owner' | 'associate_dentist' | 'reception'

interface StaffRow {
  id: string
  email: string
  name: string | null
  role: Role
  status: 'invited' | 'active' | 'removed'
  invited_at: string
  joined_at: string | null
}

const ROLE_META: Record<Role, { label: string; color: string; bg: string; border: string; permissions: string[] }> = {
  reception: {
    label: 'Reception',
    color: '#1D4ED8', bg: '#DBEAFE', border: '#BFDBFE',
    permissions: [
      'Book and reschedule appointments',
      'Check-in patients at the front desk',
      'Create invoices and record payments',
    ],
  },
  associate_dentist: {
    label: 'Associate Dentist',
    color: '#7E22CE', bg: '#F3E8FF', border: '#E9D5FF',
    permissions: [
      'Write EMR notes and treatment plans',
      'Issue prescriptions',
      'View patient history and timelines',
    ],
  },
  owner: {
    label: 'Owner',
    color: '#92400E', bg: '#FEF3C7', border: '#FDE68A',
    permissions: ['Full access — everything Reception and Associate Dentist can do, plus billing, staff, and clinic settings'],
  },
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('reception')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/dentist/staff', { cache: 'no-store' })
    const data = await res.json().catch(() => ({ staff: [] }))
    setStaff(data.staff ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function flashToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  async function submitInvite() {
    if (!inviteEmail.trim()) { setError('Email is required'); return }
    setSubmitting(true); setError(null)
    const res = await fetch('/api/dentist/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim() || null, role: inviteRole }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error || 'Invite failed')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    setInviteOpen(false)
    setInviteEmail(''); setInviteName(''); setInviteRole('reception')
    flashToast(data?.warning ? `Invite recorded but: ${data.warning}` : 'Invite sent — they’ll get an email shortly.')
    await load()
  }

  async function removeStaff(id: string) {
    if (!confirm('Remove this staff member? They will lose access immediately.')) return
    const res = await fetch(`/api/dentist/staff/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      flashToast(`Remove failed: ${data?.error || 'unknown error'}`)
      return
    }
    flashToast('Staff member removed')
    await load()
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Staff Access</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Invite your reception desk and associate dentists. Each gets their own login with the right permissions.</p>
        </div>
        <button onClick={() => { setError(null); setInviteOpen(true) }} style={primaryBtn}>+ Invite Staff</button>
      </div>

      {/* Permissions cheat-sheet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(['reception', 'associate_dentist', 'owner'] as Role[]).map(r => {
          const meta = ROLE_META[r]
          return (
            <div key={r} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
              <span style={{ ...rolePill, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, marginBottom: 10, display: 'inline-block' }}>
                {meta.label}
              </span>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                {meta.permissions.map(p => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Staff list */}
      {loading ? (
        <p style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading…</p>
      ) : staff.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>No staff yet</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 18px' }}>
            Invite your reception desk so they can book appointments, and your associate dentists so they can write EMRs.
          </p>
          <button onClick={() => setInviteOpen(true)} style={primaryBtn}>+ Invite First Staff Member</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Person', 'Role', 'Status', 'Invited', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(s => {
                const meta = ROLE_META[s.role]
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name || s.email.split('@')[0]}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.email}</div>
                    </td>
                    <td style={cell}>
                      <span style={{ ...rolePill, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>{meta.label}</span>
                    </td>
                    <td style={cell}>
                      {s.status === 'active'
                        ? <span style={{ ...statusPill, background: '#DCFCE7', color: '#166534' }}>● Active</span>
                        : <span style={{ ...statusPill, background: '#FEF3C7', color: '#92400E' }}>● Invited</span>}
                    </td>
                    <td style={{ ...cell, color: 'var(--muted)', fontSize: 12 }}>
                      {new Date(s.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <button onClick={() => removeStaff(s.id)} style={dangerBtn}>Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <div style={modalBackdrop} onClick={() => !submitting && setInviteOpen(false)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Invite Staff Member</h2>
              <button onClick={() => !submitting && setInviteOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Email *">
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={inputStyle} placeholder="them@example.com" autoFocus />
              </Field>
              <Field label="Name (optional)">
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} style={inputStyle} placeholder="As you'd like it to appear in their portal" />
              </Field>
              <Field label="Role *">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(['reception', 'associate_dentist', 'owner'] as Role[]).map(r => (
                    <label key={r} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: 12, borderRadius: 10,
                      border: `1.5px solid ${inviteRole === r ? 'var(--blue)' : 'var(--border)'}`,
                      background: inviteRole === r ? 'var(--blue-light)' : '#fff',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="radio" name="role" value={r}
                        checked={inviteRole === r} onChange={() => setInviteRole(r)}
                        style={{ accentColor: 'var(--blue)', marginTop: 2 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{ROLE_META[r].label}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ROLE_META[r].permissions[0]}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </Field>

              {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !submitting && setInviteOpen(false)} style={subtleBtn} disabled={submitting}>Cancel</button>
              <button onClick={submitInvite} disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.7 : 1 }}>{submitting ? 'Sending…' : 'Send Invite'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: '#fff', padding: '12px 22px', borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14, outline: 'none',
  fontFamily: 'var(--font-body)', background: '#fff',
}
const primaryBtn: React.CSSProperties = {
  padding: '11px 22px', background: 'var(--blue)', color: '#fff',
  border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)',
  fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44,
}
const subtleBtn: React.CSSProperties = {
  padding: '8px 14px', background: '#fff', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 8,
  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  ...subtleBtn, color: '#991B1B', border: '1px solid #FECACA', background: '#FEF2F2',
}
const cell: React.CSSProperties = { padding: '12px 14px', fontSize: 13, verticalAlign: 'middle' }
const rolePill: React.CSSProperties = { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }
const statusPill: React.CSSProperties = { padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }
const emptyStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
  padding: 48, textAlign: 'center',
}
const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15, 25, 35, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 300, padding: 16,
}
const modalCard: React.CSSProperties = {
  background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560,
  maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
}
