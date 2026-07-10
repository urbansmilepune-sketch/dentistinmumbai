'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminShell from './AdminShell'
import CommunicationsTab from './CommunicationsTab'
import OutreachTab from './OutreachTab'
import VisitLogsTab from './VisitLogsTab'
import AutoRefresh from '@/components/AutoRefresh'
import { CITY_CONFIGS, cityOrigin, getCityBySlug } from '@/config/cities'

// Shared style tokens. Inline-styled cards reach for these so spacing,
// borders, and the SaaS-flat shadow stack stay consistent across tabs.
const CARD_BORDER = '#E2E8F0'
// Bumped from a barely-visible 1px shadow to a soft two-layer elevation
// so cards read as actual cards on the white admin background rather than
// flat boxes. Still subtle — closer to Vercel/Linear than to Material.
const CARD_SHADOW = '0 4px 12px rgba(15, 25, 35, 0.04), 0 1px 3px rgba(15, 25, 35, 0.06)'
const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 14,
  boxShadow: CARD_SHADOW,
}

// ----- Toast + Confirm modal primitives -----------------------------------
// Native alert()/prompt() were what made the admin feel like a "child site" —
// they're OS popups, unstyleable, and break the SaaS aesthetic the rest of
// the panel is going for. These two primitives replace them. ConfirmModal
// renders a backdropped, centered dialog with an optional reason field;
// ToastStack stacks transient feedback in the top-right corner.

type ToastVariant = 'success' | 'error' | 'info'
interface ToastItem { id: number; variant: ToastVariant; message: string }

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="admin-toast-stack" style={{ position: 'fixed', top: 20, right: 20, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
      {toasts.map(t => {
        const palette = t.variant === 'success'
          ? { bg: '#F0FDF4', border: '#BBF7D0', accent: '#15803D', icon: '✓' }
          : t.variant === 'error'
            ? { bg: '#FEF2F2', border: '#FECACA', accent: '#B91C1C', icon: '✕' }
            : { bg: '#EFF6FF', border: '#BFDBFE', accent: '#1D4ED8', icon: 'ℹ' }
        return (
          <div key={t.id} role="status" style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            minWidth: 280, maxWidth: 380,
            background: palette.bg, border: `1px solid ${palette.border}`,
            borderRadius: 12, padding: '12px 14px',
            boxShadow: '0 12px 32px rgba(15, 25, 35, 0.12)',
            animation: 'admin-toast-in 0.18s ease-out',
          }}>
            <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', background: palette.accent, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{palette.icon}</span>
            <div style={{ flex: 1, fontSize: 13, color: palette.accent, fontWeight: 600, lineHeight: 1.5, wordBreak: 'break-word' }}>{t.message}</div>
            <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.accent, opacity: 0.65, fontSize: 18, lineHeight: 1, padding: 0, marginTop: -2 }}>×</button>
          </div>
        )
      })}
    </div>
  )
}

interface ConfirmModalProps {
  title: string
  description?: string
  confirmLabel: string
  confirmVariant?: 'primary' | 'danger'
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}

function ConfirmModal({
  title, description, confirmLabel, confirmVariant = 'primary',
  requireReason = false, reasonLabel = 'Reason', reasonPlaceholder,
  onCancel, onConfirm,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  // Esc closes, body scroll locks while the dialog is open so the page
  // behind the backdrop doesn't move under the user.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel])

  function handleConfirm() {
    if (requireReason && !reason.trim()) {
      setError('A reason is required.')
      return
    }
    onConfirm(reason.trim())
  }

  const confirmBg = confirmVariant === 'danger' ? '#DC2626' : 'var(--blue)'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 25, 35, 0.5)' }} />
      <div role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" style={{
        position: 'relative', width: '100%', maxWidth: 440,
        background: '#fff', borderRadius: 16, padding: 24,
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.18)',
        animation: 'admin-modal-in 0.18s ease-out',
      }}>
        <h3 id="admin-modal-title" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, marginBottom: 6, color: 'var(--text)' }}>{title}</h3>
        {description && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.6 }}>{description}</p>}
        {requireReason && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>{reasonLabel}</label>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); if (error) setError('') }}
              autoFocus
              rows={3}
              placeholder={reasonPlaceholder ?? 'Add a short explanation…'}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${error ? '#DC2626' : '#E2E8F0'}`, fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical', minHeight: 72, background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }}
            />
            {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>{error}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '9px 18px', minHeight: 40, background: '#fff', color: 'var(--text-secondary)', border: '1px solid #E2E8F0', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleConfirm} style={{ padding: '9px 18px', minHeight: 40, background: confirmBg, color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// PageHeader — consistent top-of-tab pattern: bigger H1, subtle muted
// subtitle line below, and a right-aligned slot for actions like the
// Dentists search input. Replaces the ad-hoc `<h1>` blocks each tab was
// writing independently.
function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="admin-page-header" style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
      marginBottom: 24, paddingBottom: 18,
      borderBottom: '1px solid #E2E8F0',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.15, color: 'var(--text)', marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {actions && <div className="admin-page-header-actions" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>{actions}</div>}
    </div>
  )
}

interface DentistHealthRow {
  id: string
  slug: string
  name: string
  clinic_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  city: string | null
  tier: string | null
  tier_expires_at: string | null
  created_at: string
  area: string | null
  completion: number
  flags: { zeroBookings30d: boolean; lowCompletion: boolean; noPhoto: boolean; noMaps: boolean; noGallery: boolean }
  gallery_count: number
  risk_score: number
}

type ActivityStatus = 'never' | 'inactive' | 'dormant' | 'active'

interface DentistActivityRow {
  id: string
  name: string
  slug: string
  city: string | null
  phone: string | null
  whatsapp: string | null
  lastLogin: string | null
  sessions: number
  status: ActivityStatus
}

interface DentistActivity {
  cards: {
    totalActive: number
    loggedIn7d: number
    loggedIn30d: number
    neverUsed: number
    notLoggedIn30plus: number
  }
  features: { section: string; label: string; count: number }[]
  rows: DentistActivityRow[]
  regTrend: { label: string; count: number }[]
}

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
  /** Active-roster health snapshot used by the new "Dentist Health" tab
   * + the analytics rollup. Pre-computed on the server so the client tab
   * just sorts / filters; no extra round-trip. */
  dentistHealth: DentistHealthRow[]
  /** Dashboard activity rollup (logins, sessions, feature usage, registration
   * trend) rendered alongside the at-risk roster in the Dentist Health tab.
   * Pre-aggregated server-side from the dashboard_* analytics events. */
  dentistActivity: DentistActivity
  /** Clinical-case moderation queue + reports. Server pre-joins the
   *  case + dentist + first photo so the tab renders without extra
   *  client-side fetches. */
  pendingCases: any[]
  openReports: any[]
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
    <div style={{ ...cardStyle, padding: '20px 24px' }}>
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
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
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
    <div style={{ ...cardStyle, borderRadius: 16, overflow: 'hidden' }}>
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

// ────────────────────────────────────────────────────────────────────────
// Dentist Health tab
//
// Surfaces every active dentist with at-risk signals from the server-side
// rollup (zero bookings in 30d, sub-60% completion, missing photo/maps/
// gallery). Inline so the rest of the admin stays in one client component;
// the data is pre-aggregated server-side so this just sorts/filters.
// Quick actions are mailto: + wa.me links — no extra API endpoints needed.
// ────────────────────────────────────────────────────────────────────────
type HealthSort = 'risk' | 'recent' | 'alpha'

function buildWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input) return null
  // Strip everything but digits; if 10 digits assume India (+91), else trust
  // the caller supplied an already-prefixed international number.
  const digits = input.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return '91' + digits
  return digits
}

function flagChip(label: string, color: string, bg: string, border: string) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
      background: bg, color, border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// Visual treatment for the four activity buckets — green / orange / red / grey
// per the brief. Shared by the activity table rows + status pills.
const ACTIVITY_STATUS_STYLE: Record<ActivityStatus, { label: string; color: string; bg: string; border: string }> = {
  active:   { label: 'Active',     color: '#166534', bg: '#DCFCE7', border: '#BBF7D0' },
  dormant:  { label: 'Dormant',    color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  inactive: { label: 'Inactive',   color: '#991B1B', bg: '#FEE2E2', border: '#FECACA' },
  never:    { label: 'Never Used', color: '#475569', bg: '#F1F5F9', border: '#E2E8F0' },
}

function DentistHealthTab({ dentists, activity, cityFilter }: { dentists: DentistHealthRow[]; activity: DentistActivity; cityFilter: string | null }) {
  const [sort, setSort] = useState<HealthSort>('risk')
  const [atRiskOnly, setAtRiskOnly] = useState(true)

  // Dormant / inactive dentists get a one-click WhatsApp nudge with the
  // re-engagement copy from the brief. Returns null when there's no usable
  // number so the caller renders a disabled affordance instead of a dead link.
  function activityWaHref(row: DentistActivityRow): string | null {
    const num = buildWhatsAppNumber(row.whatsapp || row.phone)
    if (!num) return null
    // Strip a leading "Dr." so re-prefixing doesn't produce "Dr. Dr.".
    const bare = String(row.name || '').replace(/^\s*dr\.?\s+/i, '').trim()
    const message =
      `Hi Dr. ${bare}, we noticed you haven't logged into your DentistIn dashboard recently. ` +
      `Your clinic profile is live and patients are finding you! ` +
      `Login at dentistinpune.in/for-dentists/login - Team DentistIn`
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
  }

  const maxFeature = Math.max(1, ...activity.features.map(f => f.count))
  const maxReg = Math.max(1, ...activity.regTrend.map(w => w.count))

  const list = useMemo(() => {
    const base = atRiskOnly ? dentists.filter(d => d.risk_score > 0) : dentists
    const sorted = [...base]
    if (sort === 'risk') {
      // Tie-break by name so the order is stable across renders.
      sorted.sort((a, b) => b.risk_score - a.risk_score || a.name.localeCompare(b.name))
    } else if (sort === 'recent') {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
    return sorted
  }, [dentists, sort, atRiskOnly])

  const totalAtRisk = dentists.filter(d => d.risk_score > 0).length
  const zeroBookings = dentists.filter(d => d.flags.zeroBookings30d).length
  const incomplete = dentists.filter(d => d.flags.lowCompletion).length

  // Pre-baked outreach templates so the admin can fire a personal nudge in
  // a single click. Subject/body intentionally short — they're conversation
  // openers, not pitches.
  function emailHref(d: DentistHealthRow): string {
    if (!d.email) return '#'
    const reasons: string[] = []
    if (d.flags.zeroBookings30d) reasons.push('boost your bookings')
    if (d.flags.lowCompletion) reasons.push('complete your profile')
    if (d.flags.noPhoto) reasons.push('add a profile photo')
    if (d.flags.noMaps) reasons.push('plug in your Google Maps')
    if (d.flags.noGallery) reasons.push('upload a few clinic photos')
    const why = reasons.length > 0 ? reasons.join(', ') : 'help you get more from your listing'
    const subject = encodeURIComponent(`Quick win for ${d.clinic_name || d.name}`)
    const body = encodeURIComponent(
      `Hi Dr. ${d.name.split(' ').slice(-1)[0]},\n\n` +
      `Saw a couple of things on your listing we can ${why}. ` +
      `Want me to walk you through it on a 5-minute call?\n\n` +
      `— the platform team`,
    )
    return `mailto:${d.email}?subject=${subject}&body=${body}`
  }

  function waHref(d: DentistHealthRow): string | null {
    const num = buildWhatsAppNumber(d.whatsapp || d.phone)
    if (!num) return null
    const text = encodeURIComponent(
      `Hi Dr. ${d.name.split(' ').slice(-1)[0]}, this is the platform team. ` +
      `Spotted a quick win on your listing — got 2 minutes?`,
    )
    return `https://wa.me/${num}?text=${text}`
  }

  const sortPillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999,
    fontSize: 12, fontWeight: 600,
    background: active ? 'var(--blue)' : '#fff',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: `1px solid ${active ? 'var(--blue)' : '#E2E8F0'}`,
    cursor: 'pointer', fontFamily: 'var(--font-body)',
  })

  const actionBtn = (variant: 'primary' | 'secondary' | 'muted'): React.CSSProperties => ({
    padding: '6px 10px', minHeight: 32,
    fontSize: 12, fontWeight: 600,
    borderRadius: 7,
    textDecoration: 'none',
    fontFamily: 'var(--font-body)',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    whiteSpace: 'nowrap',
    background: variant === 'primary' ? 'var(--blue)' : variant === 'secondary' ? '#25D366' : '#fff',
    color: variant === 'muted' ? 'var(--text-secondary)' : '#fff',
    border: variant === 'muted' ? '1px solid #E2E8F0' : 'none',
  })

  return (
    <div>
      <PageHeader
        title="Dentist Health"
        subtitle="Dashboard activity + at-risk signals across the active roster. Spot dentists who've gone quiet or never logged in, see which features get used, and nudge them back before they churn."
      />
      <CityFilterBar cityFilter={cityFilter} label="Scope to city" />

      {/* ───────── SECTION 1 — Activity overview ───────── */}
      <SectionTitle>Activity overview <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· dashboard logins</span></SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon="🧑‍⚕️" label="Total active dentists" value={activity.cards.totalActive} color="var(--blue)" />
        <StatCard icon="✅" label="Logged in · last 7 days" value={activity.cards.loggedIn7d} color="var(--green)" />
        <StatCard icon="🗓️" label="Logged in · last 30 days" value={activity.cards.loggedIn30d} color="#0EA5E9" />
        <StatCard icon="🚫" label="Never used dashboard" value={activity.cards.neverUsed} color="#64748B" />
        <StatCard icon="😴" label="Not logged in · 30+ days" value={activity.cards.notLoggedIn30plus} color="#DC2626" />
      </div>

      {/* ───────── SECTION 2 — Most used features ───────── */}
      <SectionTitle>Most used features <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· dashboard sections opened</span></SectionTitle>
      <div style={{ ...cardStyle, borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
        {activity.features.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No dashboard usage recorded yet — this fills in as dentists open dashboard sections.
          </div>
        ) : activity.features.map((f, i) => (
          <div key={f.section} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 60px', alignItems: 'center', gap: 12, padding: '10px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.label}</span>
            <div style={{ height: 14, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(f.count / maxFeature) * 100}%`, background: 'var(--blue)', borderRadius: 4, minWidth: f.count > 0 ? 4 : 0 }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--blue)', textAlign: 'right' }}>{f.count}</span>
          </div>
        ))}
      </div>

      {/* ───────── SECTION 3 — Dentist activity table ───────── */}
      <SectionTitle>Dentist activity <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· {activity.rows.length} on the active roster · most-dormant first</span></SectionTitle>
      <div style={{ ...cardStyle, borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) minmax(120px, 1fr) 90px 130px minmax(150px, auto)', gap: 12, alignItems: 'center', padding: '10px 18px', background: '#F8FAFC', borderBottom: `1px solid ${CARD_BORDER}` }}>
          {['Dentist', 'Last login', 'Sessions', 'Status', 'Action'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
        {activity.rows.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No dentists in this scope.</div>
        ) : activity.rows.map((r, i) => {
          const s = ACTIVITY_STATUS_STYLE[r.status]
          const wa = activityWaHref(r)
          const needsNudge = r.status === 'dormant' || r.status === 'inactive'
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) minmax(120px, 1fr) 90px 130px minmax(150px, auto)', gap: 12, alignItems: 'center', padding: '12px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                <div style={{ marginTop: 3 }}><CityBadge slug={r.city} /></div>
              </div>
              <span style={{ fontSize: 12, color: r.lastLogin ? 'var(--text-secondary)' : 'var(--muted)' }}>
                {r.lastLogin ? new Date(r.lastLogin).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.sessions > 0 ? 'var(--text)' : 'var(--muted)' }}>{r.sessions}</span>
              <span>
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{s.label}</span>
              </span>
              <span>
                {needsNudge ? (
                  wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', minHeight: 32, background: '#25D366', color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>💬 Send WhatsApp</a>
                  ) : (
                    <span title="No phone/whatsapp on file" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', minHeight: 32, background: '#fff', color: 'var(--text-secondary)', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>💬 Send WhatsApp</span>
                  )
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {/* ───────── SECTION 4 — Registration trend ───────── */}
      <SectionTitle>Registration trend <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· new sign-ups per week · last 8 weeks</span></SectionTitle>
      <div style={{ ...cardStyle, borderRadius: 16, padding: '24px 24px 18px', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
          {activity.regTrend.map((w, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>{w.count}</span>
              <div style={{ width: '100%', maxWidth: 48, height: `${(w.count / maxReg) * 100}%`, minHeight: w.count > 0 ? 4 : 2, background: w.count > 0 ? 'linear-gradient(180deg, #3B82F6, #1D4ED8)' : 'var(--bg)', borderRadius: '6px 6px 0 0', transition: 'height 0.4s' }} />
              <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ───────── Existing: profile & booking risk roster ───────── */}
      <SectionTitle>Profile &amp; booking risk <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· completion + engagement gaps</span></SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon="🧑‍⚕️" label="Active dentists" value={dentists.length} color="var(--blue)" />
        <StatCard icon="⚠️" label="At risk" value={totalAtRisk} color="#DC2626" />
        <StatCard icon="📉" label="0 bookings · 30d" value={zeroBookings} color="#DC2626" />
        <StatCard icon="🧩" label="Incomplete < 60%" value={incomplete} color="#F59E0B" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 8 }}>Sort</span>
        <button onClick={() => setSort('risk')}   style={sortPillStyle(sort === 'risk')}>Most at risk</button>
        <button onClick={() => setSort('recent')} style={sortPillStyle(sort === 'recent')}>Recently joined</button>
        <button onClick={() => setSort('alpha')}  style={sortPillStyle(sort === 'alpha')}>Alphabetical</button>
        <span style={{ width: 1, height: 18, background: '#E2E8F0', margin: '0 6px' }} />
        <button onClick={() => setAtRiskOnly(v => !v)} style={sortPillStyle(atRiskOnly)}>
          {atRiskOnly ? '✓ At-risk only' : 'Show all dentists'}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{list.length} shown</span>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
        {list.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            {atRiskOnly ? 'Everyone looks healthy 🎉 No at-risk dentists in this scope.' : 'No dentists in this scope.'}
          </div>
        ) : list.map((d, i) => {
          const wa = waHref(d)
          const initials = d.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'D'
          return (
            <div key={d.id} style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1.6fr) minmax(280px, 2fr) minmax(140px, auto) auto',
              gap: 16, alignItems: 'center',
              padding: '14px 18px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.clinic_name || '—'}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <CityBadge slug={d.city} />
                    {d.area && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{d.area}</span>}
                    <Badge status={d.tier || 'free'} />
                  </div>
                </div>
              </div>

              {/* Flags + completion */}
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {d.flags.zeroBookings30d && flagChip('0 bookings · 30d', '#991B1B', '#FEE2E2', '#FECACA')}
                  {d.flags.lowCompletion   && flagChip(`Incomplete ${d.completion}%`, '#92400E', '#FEF3C7', '#FDE68A')}
                  {d.flags.noPhoto         && flagChip('No photo', '#92400E', '#FEF3C7', '#FDE68A')}
                  {d.flags.noMaps          && flagChip('No maps', '#92400E', '#FEF3C7', '#FDE68A')}
                  {d.flags.noGallery       && flagChip('No gallery', '#92400E', '#FEF3C7', '#FDE68A')}
                  {d.risk_score === 0      && flagChip('Healthy', '#166534', '#DCFCE7', '#BBF7D0')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 100, height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${d.completion}%`, background: d.completion >= 80 ? 'var(--green)' : d.completion >= 60 ? '#F59E0B' : '#DC2626', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{d.completion}% complete</span>
                </div>
              </div>

              {/* Joined / risk score */}
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ fontWeight: 700, color: d.risk_score >= 5 ? '#DC2626' : d.risk_score >= 3 ? '#D97706' : 'var(--text-secondary)' }}>
                  Risk score: {d.risk_score}
                </div>
                <div>Joined {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {d.email
                  ? <a href={emailHref(d)} style={actionBtn('primary')}>📧 Email</a>
                  : <span style={actionBtn('muted')} title="No email on file">📧 Email</span>}
                {wa
                  ? <a href={wa} target="_blank" rel="noopener noreferrer" style={actionBtn('secondary')}>💚 WhatsApp</a>
                  : <span style={actionBtn('muted')} title="No phone/whatsapp on file">💚 WhatsApp</span>}
                <a href={`/dentist/${d.slug}`} target="_blank" rel="noopener noreferrer" style={actionBtn('muted')}>↗ Profile</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Cases moderation tab
//
// Pre-loaded with the pending cases + open reports the server fetched
// in admin/page.tsx. All state changes are optimistic — once the API
// call returns ok we drop the row out of the list rather than refetch.
// ────────────────────────────────────────────────────────────────────────

interface CasesModerationProps {
  initialPending: any[]
  initialReports: any[]
  onToast: (variant: 'success' | 'error' | 'info', message: string) => void
}

function CasesModerationTab({ initialPending, initialReports, onToast }: CasesModerationProps) {
  const [pending, setPending] = useState<any[]>(initialPending)
  const [reports, setReports] = useState<any[]>(initialReports)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ id: string; title: string } | null>(null)

  async function approveCase(id: string) {
    setBusy(id)
    const res = await fetch('/api/admin/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: id, action: 'approve' }) })
    setBusy(null)
    if (!res.ok) { onToast('error', 'Could not approve case.'); return }
    setPending(p => p.filter(c => c.id !== id))
    onToast('success', 'Case approved and live.')
  }

  async function performReject(reason: string) {
    if (!rejectTarget) return
    const id = rejectTarget.id
    setRejectTarget(null)
    setBusy(id)
    const res = await fetch('/api/admin/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: id, action: 'reject', reason }) })
    setBusy(null)
    if (!res.ok) { onToast('error', 'Could not reject case.'); return }
    setPending(p => p.filter(c => c.id !== id))
    onToast('success', 'Case rejected.')
  }

  async function resolveReport(id: string, action: 'resolve' | 'dismiss') {
    setBusy(id)
    const res = await fetch('/api/admin/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: id, action }) })
    setBusy(null)
    if (!res.ok) { onToast('error', 'Could not update report.'); return }
    setReports(r => r.filter(rep => rep.id !== id))
    onToast('success', action === 'resolve' ? 'Report resolved.' : 'Report dismissed.')
  }

  function firstThumb(photos: any[] | undefined | null): string | null {
    if (!photos || photos.length === 0) return null
    // Prefer a clinical photo; fall back to whatever's first by display_order.
    const sorted = [...photos].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    const clinical = sorted.find(p => p.kind === 'before' || p.kind === 'after')
    return (clinical || sorted[0])?.url ?? null
  }

  return (
    <div>
      <PageHeader title="Clinical Cases" subtitle="Approve, reject, and resolve reports on the clinical-case feed." />

      <SectionTitle>
        Pending review <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· {pending.length} {pending.length === 1 ? 'case' : 'cases'}</span>
      </SectionTitle>
      <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden', marginBottom: 28 }}>
        {pending.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Queue empty — every case has been reviewed.</div>
        ) : pending.map((c, i) => {
          const thumb = firstThumb(c.case_photos)
          const dentistName = c.dentists?.name || '—'
          return (
            <div key={c.id} style={{
              display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 16, alignItems: 'center',
              padding: '14px 18px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ width: 88, height: 66, borderRadius: 8, overflow: 'hidden', background: '#F1F5F9' }}>
                {thumb && <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{c.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Dr. {dentistName}{c.dentists?.city ? ' · ' + c.dentists.city : ''} · {c.specialty} · {'★'.repeat(c.complexity)}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Submitted {new Date(c.created_at).toLocaleDateString('en-IN')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={`https://dentistinindia.in/cases/${c.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 12px', minHeight: 32, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>Preview</a>
                <button onClick={() => approveCase(c.id)} disabled={busy === c.id} style={{ padding: '7px 12px', minHeight: 32, background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: busy === c.id ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>✓ Approve</button>
                <button onClick={() => setRejectTarget({ id: c.id, title: c.title })} disabled={busy === c.id} style={{ padding: '7px 12px', minHeight: 32, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: busy === c.id ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>✕ Reject</button>
              </div>
            </div>
          )
        })}
      </div>

      <SectionTitle>
        Open reports <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· {reports.length}</span>
      </SectionTitle>
      <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden', marginBottom: 28 }}>
        {reports.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>No open reports.</div>
        ) : reports.map((r, i) => (
          <div key={r.id} style={{ padding: '14px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {r.case?.title || 'Case'}{r.case?.dentist?.name ? <span style={{ color: '#64748B', fontWeight: 500 }}> · by Dr. {r.case.dentist.name}</span> : null}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>
                Reported by Dr. {r.reporter?.name || '—'} · {new Date(r.created_at).toLocaleDateString('en-IN')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px' }}>
                {r.reason}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <a href={`https://dentistinindia.in/cases/${r.case_id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 12px', minHeight: 32, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569', textDecoration: 'none', textAlign: 'center' }}>View case</a>
              <button onClick={() => resolveReport(r.id, 'resolve')} disabled={busy === r.id} style={{ padding: '7px 12px', minHeight: 32, background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: busy === r.id ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>Resolve</button>
              <button onClick={() => resolveReport(r.id, 'dismiss')} disabled={busy === r.id} style={{ padding: '7px 12px', minHeight: 32, background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: busy === r.id ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>

      {rejectTarget && (
        <ConfirmModal
          title={`Reject case: ${rejectTarget.title}`}
          description="The dentist will see this case as 'rejected' in their portfolio. The reason below is stored for audit but not currently emailed."
          confirmLabel="Reject case"
          confirmVariant="danger"
          requireReason
          reasonLabel="Reason for rejection"
          reasonPlaceholder="e.g. Photos don't match the described treatment / unverified outcome / non-clinical content"
          onCancel={() => setRejectTarget(null)}
          onConfirm={performReject}
        />
      )}
    </div>
  )
}

export default function AdminPageClient({ stats, dentists, registrations, appointments, enquiries, reviews, areas, foundingConfig, analytics, cityFilter, commsDentists, dentistHealth, dentistActivity, pendingCases, openReports }: AdminPageClientProps) {
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
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [declineTarget, setDeclineTarget] = useState<{ regId: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  function pushToast(variant: ToastVariant, message: string) {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, variant, message }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500)
  }
  function dismissToast(id: number) { setToasts(t => t.filter(x => x.id !== id)) }

  // Returns { ok, error } so callers can gate optimistic state updates on
  // the actual server response. Previously this swallowed the response and
  // every caller updated local state unconditionally — a 4xx/5xx from the
  // admin API would leave the UI showing the new value while the DB still
  // held the old, and the admin would only notice after a hard refresh.
  async function adminAction(endpoint: string, body: any, id: string): Promise<{ ok: boolean; error?: string }> {
    setActionLoading(id)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { ok: false, error: data?.error || `Request failed (${res.status})` }
      }
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error' }
    } finally {
      setActionLoading(null)
    }
  }

  async function verifyDentist(id: string, verified: boolean) {
    const result = await adminAction('/api/admin/dentists', { id, is_verified: !verified }, id)
    if (!result.ok) { pushToast('error', result.error || 'Could not update verification status.'); return }
    setDentistList(prev => prev.map(d => d.id === id ? { ...d, is_verified: !verified } : d))
  }

  async function changeTier(id: string, tier: string) {
    const result = await adminAction('/api/admin/dentists', { id, tier }, id)
    if (!result.ok) { pushToast('error', result.error || 'Could not update tier.'); return }
    setDentistList(prev => prev.map(d => d.id === id ? { ...d, tier } : d))
  }

  // Hard-delete: opens the confirm modal, then on confirm hits DELETE
  // /api/admin/dentists which clears child tables (appointments, patients,
  // invoices, reviews), removes the dentists row (cascades cover newer
  // children), and removes the matching auth.users row. Local state drops
  // the row optimistically only after the server returns ok so a 4xx/5xx
  // leaves the table accurate.
  async function performDeleteDentist(id: string, name: string) {
    setDeleteTarget(null)
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/dentists', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        pushToast('error', data?.error || 'Could not delete dentist.')
        return
      }
      setDentistList(prev => prev.filter(d => d.id !== id))
      if (data.auth_warning) {
        pushToast('info', `Dr. ${name} deleted, but auth user cleanup failed: ${data.auth_warning}`)
      } else {
        pushToast('success', `Dr. ${name} deleted.`)
      }
    } catch {
      pushToast('error', 'Network error — please try again.')
    } finally {
      setActionLoading(null)
    }
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

  // Opens web.whatsapp.com (or the WhatsApp app on mobile) with the pre-filled
  // welcome message via wa.me. No state in this admin: just a URL launch —
  // the admin still has to hit "send" in the WhatsApp tab, which is the
  // point (manual review of the personalised greeting). Prefers the dedicated
  // whatsapp column, falls back to the phone column. Number is normalised by
  // buildWhatsAppNumber (10-digit → +91, anything else passed through).
  function sendWelcomeWhatsApp(d: any) {
    const num = buildWhatsAppNumber(d.whatsapp || d.phone)
    if (!num) return
    const origin = cityOrigin(getCityBySlug(d.city))
    // Some dentist rows store the name with the "Dr." honorific baked in
    // ("Dr. Tarika"), others store the bare name. Strip a leading "Dr." /
    // "dr." (with or without the dot) so re-prefixing produces a single
    // "Dr. Tarika", not "Dr. Dr. Tarika".
    const bareName = String(d.name || '').replace(/^\s*dr\.?\s+/i, '').trim()
    const drName = `Dr. ${bareName}`
    const message =
      `Hi ${drName}! 👋\n\n` +
      `Welcome to DentistIn — your free clinic profile is now LIVE! 🎉\n\n` +
      `Your profile: ${origin}/dentist/${d.slug}\n\n` +
      `Complete your profile in 5 minutes to start getting patients:\n` +
      `✅ Add your photo\n` +
      `✅ Add treatments + fees\n` +
      `✅ Set working hours\n` +
      `✅ Add clinic address\n\n` +
      `Login to dashboard:\n${origin}/for-dentists/login\n\n` +
      `Your dashboard includes:\n` +
      `📅 Online appointment booking\n` +
      `👥 Patient records\n` +
      `📊 Profile analytics\n` +
      `💰 Billing & invoices\n\n` +
      `Any questions? Reply here.\n— DentistIn Team`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, '_blank')
  }

  async function reviewAction(id: string, status: string) {
    const result = await adminAction('/api/admin/reviews', { id, status }, id)
    if (!result.ok) { pushToast('error', result.error || 'Could not update review status.'); return }
    setReviewList(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  async function approveReg(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration_id: id, action: 'approve' }) })
      const data = await res.json()
      if (data.success) {
        setRegList(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r))
        pushToast('success', `Approved. Public profile is live at /dentist/${data.slug}`)
      } else {
        pushToast('error', data.error || 'Approval failed.')
      }
    } catch { pushToast('error', 'Network error — please try again.') }
    setActionLoading(null)
  }

  // The decline button no longer triggers a native prompt(). It opens the
  // ConfirmModal, which collects the required reason in a proper styled
  // textarea, validates non-empty, and then calls performDecline below.
  async function performDecline(regId: string, reason: string) {
    setDeclineTarget(null)
    setActionLoading(regId)
    try {
      const res = await fetch('/api/admin/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration_id: regId, action: 'decline', reason }) })
      const data = await res.json()
      if (data.success) {
        setRegList(prev => prev.map(r => r.id === regId ? { ...r, status: 'rejected' } : r))
        pushToast('success', 'Declined. Email with your reason has been sent to the dentist.')
      } else {
        pushToast('error', data.error || 'Decline failed.')
      }
    } catch { pushToast('error', 'Network error — please try again.') }
    setActionLoading(null)
  }

  const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }
  const tableHeaderStyle = { padding: '10px 16px', textAlign: 'left' as const, fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--bg)', whiteSpace: 'nowrap' as const }
  const tableCellStyle = { padding: '12px 16px', fontSize: 13, borderTop: '1px solid var(--border)', verticalAlign: 'middle' as const }

  const filteredDentists = dentistList.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.clinic_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="admin-root" style={{ display: 'flex', minHeight: '100vh', background: '#FFFFFF' }}>
      <AdminShell activeSection={section} onSectionChange={setSection} stats={stats} />

      {/* Main content. `admin-content` is the scoping class for the global
          CSS at the bottom — table zebra, table hover, etc. */}
      <div className="admin-main admin-content" style={{ flex: 1, marginLeft: 240, padding: '32px 36px', minWidth: 0 }}>

        {/* DASHBOARD */}
        {section === 'dashboard' && (
          <div>
            <PageHeader
              title="Overview"
              subtitle="Welcome back. Here's what's happening across the platform today."
              actions={<AutoRefresh />}
            />

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
              <StatCard icon="📆" label="Bookings Today" value={stats.bookingsToday ?? 0} color="var(--green)" />
              <StatCard icon="🆕" label="New Registrations Today" value={stats.newRegistrationsToday ?? 0} color="#F59E0B" />
              <StatCard icon="🦷" label="Active Dentists" value={stats.dentistCount} color="var(--blue)" />
              <StatCard icon="📋" label="Pending Registrations" value={stats.registrationCount} color="#F59E0B" />
              <StatCard icon="📅" label="Total Appointments" value={stats.appointmentCount} color="var(--green)" />
              <StatCard icon="⭐" label="Reviews Pending" value={stats.reviewPendingCount} color="var(--orange)" />
              <StatCard icon="💬" label="Enquiries" value={stats.enquiryCount} color="var(--blue)" />
            </div>

            {/* Recent registrations */}
            {registrations.slice(0, 5).length > 0 && (
              <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden', marginBottom: 24 }}>
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
              <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
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
                      <button onClick={() => reviewAction(r.id, 'approved')} style={{ padding: '7px 14px', background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>✓ Approve</button>
                      <button onClick={() => reviewAction(r.id, 'rejected')} style={{ padding: '7px 14px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>✕ Reject</button>
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
            <PageHeader title="Analytics" subtitle="Platform health, revenue, engagement, and growth — all in one place." />
            <CityFilterBar cityFilter={cityFilter} label="Scope metrics to city" />

            {/* CITY OVERVIEW — always all-cities, regardless of the filter above. */}
            <SectionTitle>City Overview <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· every city, all-time</span></SectionTitle>
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden', marginBottom: 28 }}>
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
                sub={`${analytics.silverCount} silver · ${analytics.goldCount} gold · ${analytics.featuredCount} featured`}
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
              <MetricCard
                icon="💎"
                label="Avg Revenue / Paid Dentist"
                value={`₹${Math.round(analytics.avgRevenuePerPaid).toLocaleString('en-IN')}`}
                sub="MRR ÷ paid dentists"
                color="#0EA5E9"
              />
              <MetricCard
                icon="⚠️"
                label="Churn Risk · 7 days"
                value={(analytics.churnRisk7d as any[]).length}
                sub={(analytics.churnRisk7d as any[]).length > 0 ? 'Tier expires within a week' : 'No imminent expiries'}
                color={(analytics.churnRisk7d as any[]).length > 0 ? '#DC2626' : 'var(--muted)'}
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
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, padding: '24px', marginBottom: 28 }}>
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
              <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
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
              <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
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

            {/* ROW 7 — Booking Funnel */}
            <SectionTitle>Booking Funnel <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· last 30 days · profile views → bookings</span></SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
              <MetricCard
                icon="📅"
                label="Bookings This Month"
                value={analytics.booking.thisMonth}
                sub="Submitted via platform"
                color="#0EA5E9"
              />
              <MetricCard
                icon="🎯"
                label="View → Book Conversion"
                value={`${analytics.booking.conversionPct.toFixed(1)}%`}
                sub={`${analytics.engagement.profile_views.toLocaleString('en-IN')} views → ${analytics.engagement.appointments_last30.toLocaleString('en-IN')} bookings`}
                color="#7C3AED"
              />
              <MetricCard
                icon="📊"
                label="Avg Bookings / Dentist"
                value={analytics.booking.avgPerDentist.toFixed(1)}
                sub="All-time across active roster"
                color="var(--blue)"
              />
              <MetricCard
                icon="💚"
                label="WhatsApp Lead Rate"
                value={analytics.engagement.profile_views > 0 ? `${((analytics.engagement.whatsapp_clicks / analytics.engagement.profile_views) * 100).toFixed(1)}%` : '—'}
                sub="WhatsApp clicks per profile view"
                color="#25D366"
              />
            </div>
            {/* Bookings-by-city table — only show cities that have at least
                one booking this month so we don't pad the table with zero rows
                for cities that aren't live yet. */}
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden', marginBottom: 28 }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Bookings by City · this month</h3>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(analytics.booking.byCity as any[]).filter(c => c.bookings > 0).length} cities active</span>
              </div>
              {(() => {
                const rows = (analytics.booking.byCity as Array<{ slug: string; cityName: string; bookings: number }>).filter(r => r.bookings > 0)
                if (rows.length === 0) {
                  return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No bookings yet this month.</div>
                }
                const max = Math.max(1, ...rows.map(r => r.bookings))
                return (
                  <div>
                    {rows.map(r => (
                      <div key={r.slug} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 60px', alignItems: 'center', gap: 12, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{r.cityName}</span>
                        <div style={{ height: 14, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(r.bookings / max) * 100}%`, background: '#0EA5E9', borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0369A1', textAlign: 'right' }}>{r.bookings}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* ROW 8 — Patient Metrics */}
            <SectionTitle>Patient Metrics</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
              <MetricCard
                icon="👥"
                label="Unique Patients"
                value={analytics.patients.total}
                sub="All clinics combined"
                color="#7C3AED"
              />
              <MetricCard
                icon="🆕"
                label="New Patients This Month"
                value={analytics.patients.newThisMonth}
                sub="Created since 1st"
                color="var(--green)"
              />
              <MetricCard
                icon="🔁"
                label="Returning Patient Rate"
                value={`${analytics.patients.returningRatePct.toFixed(1)}%`}
                sub="Patients with ≥2 visits"
                color="#D97706"
              />
              <MetricCard
                icon="📈"
                label="Avg Appointments / Patient"
                value={analytics.patients.avgAppointmentsPerPatient.toFixed(2)}
                sub="Among patients with ≥1 visit"
                color="var(--blue)"
              />
            </div>

            {/* ROW 9 — Content & Profile Health */}
            <SectionTitle>Content & Profile Health</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
              <MetricCard
                icon="📊"
                label="Avg Profile Completion"
                value={`${analytics.content.avgCompletionPct.toFixed(0)}%`}
                sub="Across active dentists"
                color="var(--blue)"
              />
              <MetricCard
                icon="🖼️"
                label="No Gallery Photos"
                value={analytics.content.noGallery}
                sub="Dentists with 0 photos"
                color="#F59E0B"
              />
              <MetricCard
                icon="🗺️"
                label="No Maps Embed"
                value={analytics.content.noMapsEmbed}
                sub="Missing location iframe"
                color="#F59E0B"
              />
              <MetricCard
                icon="⭐"
                label="With Reviews"
                value={analytics.content.withReviews}
                sub={`${analytics.content.withoutReviews} dentists have none yet`}
                color="#10B981"
              />
            </div>

            {/* ROW 10 — Dentist Health overview (full detail in the Dentist Health tab) */}
            <SectionTitle>Dentist Health <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· at-risk signals</span></SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 12 }}>
              <MetricCard
                icon="📉"
                label="0 Bookings · 30 days"
                value={analytics.health.noBookings30}
                sub={`Out of ${analytics.health.totalActive} active`}
                color="#DC2626"
              />
              <MetricCard
                icon="🧩"
                label="Incomplete Profiles"
                value={analytics.health.incompleteProfile}
                sub="< 60% completion"
                color="#F59E0B"
              />
              <MetricCard
                icon="📷"
                label="No Profile Photo"
                value={analytics.health.noPhoto}
                sub="Headshot missing"
                color="#F59E0B"
              />
              <MetricCard
                icon="🗺️"
                label="No Maps Embed"
                value={analytics.content.noMapsEmbed}
                sub="Location iframe missing"
                color="#F59E0B"
              />
            </div>
            <div style={{ marginBottom: 28 }}>
              <button
                onClick={() => setSection('dentist-health')}
                style={{ padding: '9px 16px', minHeight: 38, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >Open Dentist Health tab →</button>
            </div>

            {/* ROW 11 — Outreach */}
            <SectionTitle>Outreach <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· cold-email funnel</span></SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
              <MetricCard
                icon="📇"
                label="Contacts Uploaded"
                value={analytics.outreach.contactsTotal}
                sub="Lifetime, all campaigns"
                color="var(--blue)"
              />
              <MetricCard
                icon="📤"
                label="Emails Sent This Month"
                value={analytics.outreach.sentThisMonth}
                sub={`${analytics.outreach.sentAll} all-time`}
                color="var(--blue)"
              />
              <MetricCard
                icon="👁️"
                label="Open Rate"
                value={`${analytics.outreach.openRatePct.toFixed(1)}%`}
                sub={`${analytics.outreach.opened.toLocaleString('en-IN')} opens / ${analytics.outreach.sentAll.toLocaleString('en-IN')} sent`}
                color="#7C3AED"
              />
              <MetricCard
                icon="🎯"
                label="Registration Conversions"
                value={analytics.outreach.registered}
                sub={`${analytics.outreach.conversionPct.toFixed(2)}% of sent`}
                color="var(--green)"
              />
            </div>
          </div>
        )}

        {/* DENTIST HEALTH (new tab) */}
        {section === 'dentist-health' && (
          <DentistHealthTab dentists={dentistHealth} activity={dentistActivity} cityFilter={cityFilter} />
        )}

        {/* CASES MODERATION */}
        {section === 'cases' && (
          <CasesModerationTab
            initialPending={pendingCases}
            initialReports={openReports}
            onToast={pushToast}
          />
        )}

        {/* REGISTRATIONS */}
        {section === 'registrations' && (
          <div>
            <PageHeader title="Dentist Registrations" subtitle="Review incoming sign-ups, verify their State Dental Council numbers, and approve or decline with a reason." />
            <CityFilterBar cityFilter={cityFilter} />
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{['Ref', 'Referred By', 'Name', 'Clinic', 'City', 'Area', 'Phone', 'Qualification', 'State Dental Council No.', 'Spot #', 'Status', 'Actions'].map(h => <th key={h} style={tableHeaderStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {regList.map(r => (
                    <tr key={r.id}>
                      <td style={tableCellStyle}><span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{r.ref_no}</span></td>
                      <td style={tableCellStyle}>{r.ref_code ? <span style={{ display: 'inline-block', padding: '2px 8px', background: '#EDE9FE', color: '#5B21B6', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{r.ref_code}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
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
                            <button onClick={() => approveReg(r.id)} disabled={actionLoading === r.id} style={{ padding: '7px 14px', background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: actionLoading === r.id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', opacity: actionLoading === r.id ? 0.6 : 1 }}>✓ Approve</button>
                            <button onClick={() => setDeclineTarget({ regId: r.id, name: r.name })} disabled={actionLoading === r.id} style={{ padding: '7px 14px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: actionLoading === r.id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', opacity: actionLoading === r.id ? 0.6 : 1 }}>✕ Decline</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {regList.length === 0 && <tr><td colSpan={12} style={{ ...tableCellStyle, textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No registrations yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DENTISTS */}
        {section === 'dentists' && (
          <div>
            <PageHeader
              title="Dentists"
              subtitle={`${filteredDentists.length} of ${dentistList.length} listed dentists${search ? ' matching your search' : ''}.`}
              actions={
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="🔍  Search by name or clinic…"
                  style={{ ...inputStyle, width: 320, padding: '10px 14px', fontSize: 14, borderRadius: 10 }}
                />
              }
            />
            <CityFilterBar cityFilter={cityFilter} />
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'auto' }}>
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
                          <a href={`/admin/dentists/${d.id}/edit`} style={{ padding: '4px 10px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>✏️ Edit</a>
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
                          {/* Welcome WhatsApp — opens wa.me in a new tab with a
                              pre-filled onboarding message templated against
                              this dentist's name, city, and slug. Hidden when
                              no usable phone/whatsapp is on file so we never
                              render a dead button. */}
                          {buildWhatsAppNumber(d.whatsapp || d.phone) && (
                            <button
                              onClick={() => sendWelcomeWhatsApp(d)}
                              title={`Open WhatsApp with welcome message for ${d.name}`}
                              style={{ padding: '4px 10px', background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
                            >
                              💬 Welcome
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget({ id: d.id, name: String(d.name || '').replace(/^\s*dr\.?\s+/i, '').trim() })}
                            disabled={actionLoading === d.id}
                            title={`Permanently delete ${d.name}`}
                            style={{ padding: '4px 10px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: actionLoading === d.id ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
                          >
                            🗑 Delete
                          </button>
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
            <PageHeader title="Appointments" subtitle="Every appointment booked through the platform, newest first." />
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'auto' }}>
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
            <PageHeader title="Enquiries" subtitle="Patient messages submitted via clinic profile pages." />
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'auto' }}>
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
            <PageHeader title="Reviews" subtitle="Moderate patient reviews before they appear on public dentist profiles." />
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

        {/* OUTREACH — cold-email funnel against CSV-imported prospect lists. */}
        {section === 'outreach' && (
          <OutreachTab />
        )}

        {/* VISIT LOGS — read-only admin view of field visits logged by
            employees in the dentauraprime.com platform. */}
        {section === 'visit-logs' && (
          <VisitLogsTab />
        )}

        {/* AREAS */}
        {section === 'areas' && (
          <div>
            <PageHeader title="Areas" subtitle="Geographic coverage areas across all city websites." />
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
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
            <PageHeader title="Settings" subtitle="Platform-wide configuration and shortcuts." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
              <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, padding: '24px' }}>
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

              <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 16, boxShadow: CARD_SHADOW, padding: '24px' }}>
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
            <PageHeader title="Blog" subtitle="Content management for the public blog." />
            <div style={{ textAlign: 'center', padding: '80px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✍️</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Blog Editor Coming Soon</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Create and manage blog posts for SEO.</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        /* Tables: every tbody row gets a hover state, even-numbered rows
           get a subtle alternate background. We override inline-styled
           tbody cells (which set their own borderTop) with !important so
           the zebra wins consistently across the existing tables. */
        .admin-content table { border-collapse: collapse; }
        .admin-content table tbody tr { transition: background 0.12s; }
        .admin-content table tbody tr:nth-child(even) { background: #FAFBFC; }
        .admin-content table tbody tr:hover { background: #EFF6FF; }

        /* Style for the th cells that come from the inline tableHeaderStyle
           constant — give them a sticky top border treatment so the head
           reads as a distinct band. */
        .admin-content table thead th {
          border-bottom: 1px solid ${CARD_BORDER};
          background: #F8FAFC !important;
        }

        /* Generic action-button hover for the inline-styled .approve / .reject
           buttons — they don't have a class, so we target every button inside
           a tbody and bump the brightness slightly on hover. Cards / nav
           buttons aren't in tbody, so they aren't affected. */
        .admin-content table tbody button:not(:disabled):hover { filter: brightness(0.96); }

        /* Modal animation */
        @keyframes admin-modal-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes admin-toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @media (max-width: 768px) {
          .admin-main { margin-left: 0 !important; padding: 16px !important; }
          .admin-content h1 { font-size: 22px !important; }
          .admin-page-header { padding-bottom: 14px !important; margin-bottom: 18px !important; }
          .admin-page-header-actions { width: 100%; }
          .admin-page-header-actions > input { width: 100% !important; }
          .admin-toast-stack { top: 12px !important; right: 12px !important; left: 12px !important; }
          .admin-toast-stack > * { min-width: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      {/* Confirm modals + toast stack live at the root of the admin tree so
          they overlay everything (sidebar, mobile header) regardless of
          which tab is rendering. */}
      {declineTarget && (
        <ConfirmModal
          title={`Decline ${declineTarget.name}'s registration?`}
          description="The dentist will receive an email with your reason. This cannot be undone from the panel."
          confirmLabel="Decline & Send Email"
          confirmVariant="danger"
          requireReason
          reasonLabel="Reason for declining"
          reasonPlaceholder="e.g. State Dental Council number could not be verified. Please re-register with a clear photo of your council registration certificate."
          onCancel={() => setDeclineTarget(null)}
          onConfirm={(reason) => performDecline(declineTarget.regId, reason)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title={`Delete Dr. ${deleteTarget.name}?`}
          description={`Are you sure you want to delete Dr. ${deleteTarget.name}? This will permanently remove their profile, all patient data, appointments, and invoices. This cannot be undone.`}
          confirmLabel="Delete permanently"
          confirmVariant="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => performDeleteDentist(deleteTarget.id, deleteTarget.name)}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
