'use client'

// Visit Logs — admin-only, read-only view of the visit_logs table.
//
// The employee-facing UI for CREATING visit logs lives in the
// dentauraprime.com platform, NOT here. This tab is purely for admins to
// see what field employees have logged: who visited which dentist, when,
// the outcome, and any notes. Data comes from /api/admin/visit-logs (service
// role read, dentist name/city hydrated server-side). City filter is local
// to this tab — it re-fetches scoped to the selected city.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

interface VisitLog {
  id: string
  dentist_id: string | null
  employee_ref: string
  visit_date: string | null
  notes: string | null
  outcome: string | null
  created_at: string
  dentist_name: string | null
  dentist_clinic: string | null
  dentist_city: string | null
}

// Mirror of the city order used elsewhere in the admin (Outreach tab) so the
// dropdown reads the same everywhere.
const CITY_ORDER: CitySlug[] = [
  'mumbai', 'pune', 'thane', 'nashik', 'nagpur', 'goa', 'surat',
  'kolhapur', 'sambhajinagar', 'rajkot', 'ahmedabad', 'jamnagar', 'navimumbai',
]

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14,
  boxShadow: '0 4px 12px rgba(15, 25, 35, 0.04), 0 1px 3px rgba(15, 25, 35, 0.06)',
}
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0F1923', verticalAlign: 'top' }

// Outcome → pill palette. Matches the vocabulary the migration constrains
// (registered / interested / not_interested / follow_up); anything else
// (incl. null) renders as a neutral chip.
const OUTCOME_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  registered:     { bg: '#DCFCE7', fg: '#166534', label: 'Registered' },
  interested:     { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Interested' },
  not_interested: { bg: '#FEE2E2', fg: '#991B1B', label: 'Not interested' },
  follow_up:      { bg: '#FEF3C7', fg: '#92400E', label: 'Follow up' },
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span style={{ fontSize: 12, color: '#94A3B8' }}>—</span>
  const s = OUTCOME_STYLE[outcome] || { bg: '#F1F5F9', fg: '#475569', label: outcome }
  return <span style={{ background: s.bg, color: s.fg, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>
}

function cityDisplayName(slug: string | null | undefined): string {
  if (!slug) return '—'
  if (Object.prototype.hasOwnProperty.call(CITY_CONFIGS, slug)) return CITY_CONFIGS[slug as CitySlug].cityName
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const t = new Date(value)
  if (Number.isNaN(t.getTime())) return '—'
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function VisitLogsTab() {
  const [logs, setLogs] = useState<VisitLog[]>([])
  const [city, setCity] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (citySlug: string) => {
    setLoading(true); setError(null)
    try {
      const qs = citySlug ? `?city=${encodeURIComponent(citySlug)}` : ''
      const res = await fetch(`/api/admin/visit-logs${qs}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Failed to load visit logs.')
        setLogs([])
      } else {
        setLogs(data.logs || [])
      }
    } catch {
      setError('Network error loading visit logs.')
      setLogs([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(city) }, [city, load])

  // Server already returns newest-first; re-assert here so the UI is stable
  // regardless of how the payload arrives.
  const sorted = useMemo(
    () => [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [logs],
  )

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, marginBottom: 6 }}>🗒️ Visit Logs</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
        Read-only view of field visits logged by outreach employees. Logging happens in the dentauraprime.com employee platform — this is for admin visibility only.
      </p>

      {/* City filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20, padding: '10px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          🌆 City filter
        </span>
        <select
          value={city}
          onChange={e => setCity(e.target.value)}
          style={{ padding: '8px 32px 8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 180 }}
        >
          <option value="">All Cities</option>
          {CITY_ORDER.filter(s => Object.prototype.hasOwnProperty.call(CITY_CONFIGS, s)).map(slug => (
            <option key={slug} value={slug}>{CITY_CONFIGS[slug].cityName}</option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ ...cardStyle, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={th}>Employee</th>
                <th style={th}>Dentist</th>
                <th style={th}>Visit date</th>
                <th style={th}>Outcome</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>
                  {city ? 'No visit logs in this city yet.' : 'No visit logs recorded yet.'}
                </td></tr>
              ) : sorted.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.employee_ref}</td>
                  <td style={td}>
                    {l.dentist_name ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{l.dentist_name}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          {l.dentist_clinic ? l.dentist_clinic + ' · ' : ''}{cityDisplayName(l.dentist_city)}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Prospect / unlinked</span>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(l.visit_date)}</td>
                  <td style={td}><OutcomeBadge outcome={l.outcome} /></td>
                  <td style={{ ...td, minWidth: 220, maxWidth: 420, whiteSpace: 'pre-wrap', color: l.notes ? '#0F1923' : '#94A3B8' }}>
                    {l.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && sorted.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>{sorted.length} visit{sorted.length === 1 ? '' : 's'} shown</div>
      )}
    </div>
  )
}
