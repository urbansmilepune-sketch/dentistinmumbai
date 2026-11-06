'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCityByDomain, getCityBySlug, type CityConfig } from '@/config/cities'
import { ADMIN_WHATSAPP } from '@/components/SupportButton'
import { NAVY, TEAL, TEAL_DARK, TEAL_SOFT } from '@/app/dentist/[slug]/profileTheme'
import BugReportButton from './BugReportButton'
import { HomeIcon, CalendarIcon, PatientsIcon, RupeeIcon, MenuIcon, PlusIcon, ChevronIcon, CloseIcon } from './dashIcons'
export type StaffRole = 'owner' | 'associate_dentist' | 'reception'

type NavItem = {
  href: string
  label: string
  hint?: string
  // Roles allowed to see the item when a staff member (not the clinic owner)
  // is signed in. The clinic owner (staffRole = null) always sees everything.
  staffRoles?: StaffRole[]
}

type NavGroup = { label: string | null; items: NavItem[] }

const D = '/for-dentists/dashboard'
const ALL: StaffRole[] = ['owner', 'associate_dentist', 'reception']

// The four daily pages. Shown at the top of the desktop sidebar and as the
// mobile bottom bar (with "More" as the fifth slot).
const PRIMARY: NavItem[] = [
  { href: D,                   label: 'Home',         staffRoles: ALL },
  { href: `${D}/appointments`, label: 'Appointments', staffRoles: ALL },
  { href: `${D}/patients`,     label: 'Patients',     staffRoles: ALL },
  { href: `${D}/billing`,      label: 'Billing',      staffRoles: ['owner', 'reception'] },
]

// Everything else, grouped so a dentist can find a page by what it is for.
// The Enquiries page still exists at its URL but is not linked: nothing in
// the app writes to the enquiries table, so it always showed 0.
const GROUPS: NavGroup[] = [
  { label: 'My clinic profile', items: [
    { href: `${D}/profile`,    label: 'Edit profile', hint: 'Name, bio, fees, phone', staffRoles: ['owner'] },
    { href: `${D}/photos`,     label: 'Photos', staffRoles: ['owner', 'associate_dentist'] },
    { href: `${D}/treatments`, label: 'Treatments and fees', staffRoles: ['owner', 'associate_dentist'] },
    { href: `${D}/hours`,      label: 'Working hours', staffRoles: ['owner'] },
    { href: `${D}/locations`,  label: 'Locations', staffRoles: ['owner'] },
  ] },
  { label: 'Patient care', items: [
    { href: `${D}/visit`,          label: "Today's visits", hint: 'Who is waiting, start a visit', staffRoles: ALL },
    { href: `${D}/pending-plans`,  label: 'Pending plans', hint: 'Treatment waiting for patients', staffRoles: ['owner', 'associate_dentist'] },
    { href: `${D}/calendar`,       label: 'Calendar', staffRoles: ALL },
    { href: `${D}/recalls`,        label: 'Recalls', hint: 'Patients due for a check-up', staffRoles: ['owner', 'reception'] },
    { href: `${D}/lab-work`,       label: 'Lab work', staffRoles: ['owner', 'associate_dentist'] },
    { href: `${D}/consent-forms`,  label: 'Consent forms', staffRoles: ALL },
    { href: `${D}/emr-templates`,  label: 'EMR templates', staffRoles: ['owner', 'associate_dentist'] },
    { href: `${D}/communications`, label: 'Messages to patients', staffRoles: ['owner'] },
  ] },
  { label: 'Money and stock', items: [
    { href: `${D}/expenses`,  label: 'Expenses', staffRoles: ['owner'] },
    { href: `${D}/inventory`, label: 'Inventory', staffRoles: ['owner'] },
    { href: `${D}/staff`,     label: 'Staff', staffRoles: ['owner'] },
  ] },
  { label: 'Grow', items: [
    { href: `${D}/reviews`,   label: 'Patient reviews', hint: 'Your rating, replies, ask for reviews', staffRoles: ALL },
    { href: `${D}/analytics`, label: 'Analytics', hint: 'Views and clicks over time', staffRoles: ['owner'] },
    { href: `${D}/articles`,  label: 'Articles', staffRoles: ['owner', 'associate_dentist'] },
    { href: `${D}/badge`,     label: 'Website badge', staffRoles: ['owner'] },
  ] },
]

const PRIMARY_ICONS: Record<string, React.ReactNode> = {
  [D]: <HomeIcon />,
  [`${D}/appointments`]: <CalendarIcon />,
  [`${D}/patients`]: <PatientsIcon />,
  [`${D}/billing`]: <RupeeIcon />,
}

function visible(items: NavItem[], staffRole: StaffRole | null): NavItem[] {
  if (!staffRole) return items
  return items.filter(item => !item.staffRoles || item.staffRoles.includes(staffRole))
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== D && pathname.startsWith(href))
}

interface Props {
  dentist: any
  completionPct: number
  staffRole?: StaffRole | null
  pendingCount?: number
  children: React.ReactNode
}

export default function DashboardShell({ dentist, completionPct, staffRole = null, pendingCount = 0, children }: Props) {
  const primary = visible(PRIMARY, staffRole)
  const groups = GROUPS
    .map(g => ({ ...g, items: visible(g.items, staffRole) }))
    .filter(g => g.items.length > 0)
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)
  // Logo follows the dentist's own city (row is the source of truth); the
  // hostname is only a fallback for legacy rows with no city.
  const dentistCity = getCityBySlug(dentist.city)
  const [cityConfig, setCityConfig] = useState<CityConfig>(dentistCity)
  useEffect(() => {
    if (!dentist.city) setCityConfig(getCityByDomain(window.location.hostname))
  }, [dentist.city])

  useEffect(() => {
    if (!addOpen) return
    function onDoc(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setAddOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [addOpen])

  useEffect(() => {
    if (!moreOpen) return
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [moreOpen])

  async function handleLogout() {
    // Clear the client session, then hit the server route so the httpOnly
    // "remember me" cookie is cleared and its DB token revoked. Hard-navigate
    // so the reloaded page reads no session.
    const supabase = createClient()
    await supabase.auth.signOut()
    try { await fetch('/auth/signout', { method: 'POST' }) } catch {}
    window.location.href = '/for-dentists/login'
  }

  const initials = dentist.name?.replace(/^\s*dr\.?\s*/i, '').split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'D'
  const supportHref = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(`Hi, I need help with my DentistIn dashboard (${dentist.clinic_name || dentist.name || ''}).`)}`

  const avatar = (size: number) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(135deg, ${NAVY}, ${TEAL_DARK})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.34, fontWeight: 700, fontFamily: 'var(--font-heading)', flexShrink: 0, overflow: 'hidden' }}>
      {dentist.profile_photo ? <img src={dentist.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  )

  const pendingPill = (n: number) => n > 0 ? (
    <span style={{ background: '#EF4444', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '0 7px', lineHeight: '18px' }}>{n}</span>
  ) : null

  // ── Desktop sidebar ──────────────────────────────────────────────
  const sidebarLink = (item: NavItem) => {
    const active = isActivePath(pathname, item.href)
    return (
      <Link key={item.href} href={item.href}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 14,
          fontWeight: active ? 700 : 500,
          background: active ? TEAL_SOFT : 'transparent',
          color: active ? TEAL_DARK : 'var(--text)',
        }}>
        <span>{item.label}</span>
        {item.href === `${D}/appointments` && pendingPill(pendingCount)}
      </Link>
    )
  }

  const groupLabel = (label: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0 12px 4px' }}>{label}</div>
  )

  const sidebar = (
    <div className="dash-sidebar" style={{ width: 248, minWidth: 248, flexShrink: 0, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', borderRight: '1px solid var(--border)' }}>
      <div style={{ padding: '18px 20px 14px', flexShrink: 0 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src={cityConfig.logoPath} alt={cityConfig.domain} style={{ height: 48, width: 'auto', display: 'block' }} />
        </Link>
      </div>
      <nav aria-label="Dashboard" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 16, scrollbarWidth: 'none' as any }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{primary.map(sidebarLink)}</div>
        {groups.map(g => (
          <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {g.label && groupLabel(g.label)}
            {g.items.map(sidebarLink)}
          </div>
        ))}
      </nav>
      <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <a href={`/dentist/${dentist.slug}`} target="_blank" rel="noopener noreferrer"
          style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
          View my public profile
        </a>
        <BugReportButton />
        <button onClick={handleLogout}
          style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
          Log out
        </button>
      </div>
    </div>
  )

  // ── Mobile "More" sheet ──────────────────────────────────────────
  const moreRow = (key: string, content: React.ReactNode, first: boolean) => (
    <div key={key} style={{ borderTop: first ? 'none' : '1px solid var(--border)' }}>{content}</div>
  )
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', minHeight: 48,
    textDecoration: 'none', color: 'var(--text)', background: 'none', border: 'none', width: '100%',
    fontFamily: 'var(--font-body)', fontSize: 15, textAlign: 'left', cursor: 'pointer',
  }
  const rowText = (label: string, hint?: string, color?: string) => (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontWeight: 600, color: color || 'var(--text)' }}>{label}</span>
      {hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{hint}</span>}
    </span>
  )
  const chev = <span style={{ color: '#94A3B8', display: 'flex' }}><ChevronIcon /></span>
  const card = (children: React.ReactNode) => (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>{children}</div>
  )

  const moreSheet = moreOpen && (
    <div role="dialog" aria-modal="true" aria-label="More" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {avatar(40)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dentist.clinic_name || dentist.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{completionPct < 100 ? `Profile ${completionPct}% complete` : dentist.name}</div>
        </div>
        <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close menu"
          style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text)' }}>
          <CloseIcon />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map(g => (
          <div key={g.label}>
            {g.label && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0 4px 6px' }}>{g.label}</div>}
            {card(g.items.map((item, i) => moreRow(item.href,
              <Link href={item.href} onClick={() => setMoreOpen(false)} style={rowStyle}>{rowText(item.label, item.hint)}{chev}</Link>, i === 0)))}
          </div>
        ))}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0 4px 6px' }}>Help</div>
          {card(<>
            {moreRow('profile', <a href={`/dentist/${dentist.slug}`} target="_blank" rel="noopener noreferrer" style={rowStyle}>{rowText('View my public profile', 'See what patients see')}{chev}</a>, true)}
            {moreRow('support', <a href={supportHref} target="_blank" rel="noopener noreferrer" style={rowStyle}>{rowText('Help and support', 'Chat with the DentistIn team on WhatsApp')}{chev}</a>, false)}
            {moreRow('bug', <div style={{ padding: '6px 2px' }}><BugReportButton /></div>, false)}
            {moreRow('logout', <button type="button" onClick={handleLogout} style={rowStyle}>{rowText('Log out', undefined, '#B91C1C')}</button>, false)}
          </>)}
        </div>
      </div>
    </div>
  )

  // ── Mobile bottom bar ────────────────────────────────────────────
  const bottomBar = (
    <nav className="dash-bottom-nav" aria-label="Dashboard mobile navigation">
      {primary.map(item => {
        const active = isActivePath(pathname, item.href) && !moreOpen
        return (
          <Link key={item.href} href={item.href} className="dash-bottom-item" aria-current={active ? 'page' : undefined}
            style={{ color: active ? TEAL_DARK : 'var(--muted)' }}>
            {active && <span style={{ position: 'absolute', top: 0, width: 28, height: 3, borderRadius: '0 0 3px 3px', background: TEAL }} />}
            {item.href === `${D}/appointments` && pendingCount > 0 && (
              <span style={{ position: 'absolute', top: 6, left: 'calc(50% + 4px)', background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>
            )}
            {PRIMARY_ICONS[item.href]}
            <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>{item.label}</span>
          </Link>
        )
      })}
      <button type="button" onClick={() => setMoreOpen(true)} className="dash-bottom-item"
        style={{ color: moreOpen ? TEAL_DARK : 'var(--muted)' }} aria-expanded={moreOpen}>
        {moreOpen && <span style={{ position: 'absolute', top: 0, width: 28, height: 3, borderRadius: '0 0 3px 3px', background: TEAL }} />}
        <MenuIcon />
        <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>More</span>
      </button>
    </nav>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {sidebar}
      {moreSheet}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Desktop-only header: quick add + public profile link. On phones the
            bottom bar and each page's own heading do this job. */}
        <div className="dash-header" style={{ height: 56, background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, flexShrink: 0, position: 'relative', zIndex: 60 }}>
          <div style={{ flex: 1 }} />
          <div ref={addRef} style={{ position: 'relative' }}>
            <button type="button" onClick={() => setAddOpen(v => !v)} aria-haspopup="menu" aria-expanded={addOpen}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', background: TEAL, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <PlusIcon size={16} /> Add
            </button>
            {addOpen && (
              <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 210, zIndex: 70 }}>
                {[
                  { href: `${D}/patients?new=1`, label: 'Walk-in patient' },
                  { href: `${D}/appointments?new=1`, label: 'Book appointment' },
                ].map(o => (
                  <Link key={o.href} href={o.href} role="menuitem" onClick={() => setAddOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', minHeight: 44, borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {o.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <a href={`/dentist/${dentist.slug}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: TEAL_DARK, fontWeight: 700, textDecoration: 'none' }}>View profile</a>
          {avatar(32)}
        </div>

        <div className="dash-content" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </div>
      </div>

      {bottomBar}

      <style>{`
        .dash-bottom-nav { display: none; }
        @media (max-width: 768px) {
          .dash-sidebar { display: none !important; }
          .dash-header { display: none !important; }
          .dash-support-fab { display: none !important; }
          .dash-content { padding: 16px !important; padding-bottom: 92px !important; }
          .dash-bottom-nav {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
            position: fixed; left: 0; right: 0; bottom: 0;
            background: #fff; border-top: 1px solid var(--border);
            z-index: 150; box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
            padding: 0 0 env(safe-area-inset-bottom);
          }
          .dash-bottom-item {
            position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 3px; min-height: 60px; background: none; border: none; text-decoration: none;
            cursor: pointer; font-family: var(--font-body); padding: 4px 0;
          }
        }
      `}</style>
    </div>
  )
}
