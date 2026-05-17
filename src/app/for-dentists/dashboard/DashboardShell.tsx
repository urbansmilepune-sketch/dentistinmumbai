'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCityByDomain, getCityBySlug, type CityConfig } from '@/config/cities'

const NAV = [
  { href: '/for-dentists/dashboard',              icon: '📊', label: 'Overview'      },
  { href: '/for-dentists/dashboard/profile',      icon: '✏️', label: 'Edit Profile'  },
  { href: '/for-dentists/dashboard/hours',        icon: '🕐', label: 'Working Hours' },
  { href: '/for-dentists/dashboard/locations',    icon: '🏥', label: 'Locations'     },
  { href: '/for-dentists/dashboard/staff',        icon: '👥', label: 'Staff'         },
  { href: '/for-dentists/dashboard/appointments', icon: '📅', label: 'Appointments'  },
  { href: '/for-dentists/dashboard/calendar',     icon: '📆', label: 'Calendar'      },
  { href: '/for-dentists/dashboard/patients',     icon: '👥', label: 'Patients'      },
  { href: '/for-dentists/dashboard/billing',      icon: '💰', label: 'Billing'       },
  { href: '/for-dentists/dashboard/enquiries',    icon: '💬', label: 'Enquiries'     },
  { href: '/for-dentists/dashboard/communications', icon: '📣', label: 'Communications' },
  { href: '/for-dentists/dashboard/photos',       icon: '📸', label: 'Photos'        },
  { href: '/for-dentists/dashboard/treatments',   icon: '🦷', label: 'Treatments'    },
  { href: '/for-dentists/dashboard/emr-templates', icon: '📋', label: 'EMR Templates' },
  { href: '/for-dentists/dashboard/analytics',    icon: '📈', label: 'Analytics',    gold: true },
  { href: '/for-dentists/dashboard/upgrade',      icon: '⭐', label: 'Upgrade Plan'  },
]

const MOBILE_NAV = [
  { href: '/for-dentists/dashboard',              icon: '📊', label: 'Overview'     },
  { href: '/for-dentists/dashboard/appointments', icon: '📅', label: 'Appointments' },
  { href: '/for-dentists/dashboard/patients',     icon: '👥', label: 'Patients'     },
  { href: '/for-dentists/dashboard/enquiries',    icon: '💬', label: 'Enquiries'    },
]

const TIER_COLORS: Record<string, string> = {
  free: '#6B7280', silver: '#475569', gold: '#92400E', featured: '#C2410C',
}

interface Props {
  dentist: any
  completionPct: number
  children: React.ReactNode
}

export default function DashboardShell({ dentist, completionPct, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)
  const isGold = dentist.tier === 'gold' || dentist.tier === 'featured'
  // Logo/brand follow the dentist's own city (set on the row, source of truth).
  // window.location.hostname is only used as a last-resort fallback for pre-
  // city-column legacy rows where dentist.city might be null.
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

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/for-dentists/login')
  }

  const initials = dentist.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'D'

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRight: '1px solid var(--border)' }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src={cityConfig.logoPath} alt={cityConfig.domain} style={{ height: 40, width: 'auto', display: 'block' }} />
        </Link>
      </div>

      {/* Dentist info */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--blue)', flexShrink: 0, overflow: 'hidden' }}>
            {dentist.profile_photo ? <img src={dentist.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dentist.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dentist.clinic_name}</div>
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#FEF3C7', color: TIER_COLORS[dentist.tier] || '#6B7280', border: '1px solid #FDE68A', textTransform: 'capitalize' }}>
          {dentist.tier || 'free'} plan
        </span>

        {/* Completion bar */}
        {completionPct < 100 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              <span>Profile completion</span><span style={{ fontWeight: 600, color: 'var(--blue)' }}>{completionPct}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${completionPct}%`, background: 'var(--blue)', borderRadius: 2, transition: 'width 0.5s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
        {NAV.map(item => {
          const isActive = pathname === item.href || (item.href !== '/for-dentists/dashboard' && pathname.startsWith(item.href))
          const locked = item.gold && !isGold
          return (
            <Link
              key={item.href}
              href={locked ? '/for-dentists/dashboard/upgrade' : item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                borderRadius: 8, marginBottom: 2, textDecoration: 'none', fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--blue-light)' : 'transparent',
                color: isActive ? 'var(--blue)' : locked ? '#CBD5E1' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              <span>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {locked && <span style={{ fontSize: 10 }}>🔒</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <a href={`/dentist/${dentist.slug}`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          🔗 View my profile
        </a>
        <button onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%', textAlign: 'left' }}>
          🚪 Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <div style={{ width: 240, flexShrink: 0, height: '100%' }} className="dash-sidebar">
        {sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260 }}>
            {sidebar}
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div className="dash-header" style={{ height: 56, background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, position: 'relative', zIndex: 60 }}>
          <div style={{ flex: 1 }} />
          {/* Quick-add */}
          <div ref={addRef} style={{ position: 'relative' }}>
            <button type="button" onClick={() => setAddOpen(v => !v)} aria-haspopup="menu" aria-expanded={addOpen}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 40, minHeight: 40, padding: '0 16px',
                background: 'var(--blue)', color: '#fff',
                border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              <span>Add</span>
              <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.85 }}>▾</span>
            </button>
            {addOpen && (
              <div role="menu"
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: '#fff', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  minWidth: 220, zIndex: 70,
                }}>
                <Link href="/for-dentists/dashboard/patients?new=1" role="menuitem"
                  onClick={() => setAddOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', minHeight: 48,
                    borderRadius: 8, textDecoration: 'none',
                    fontSize: 14, fontWeight: 600, color: 'var(--text)',
                    background: '#fff',
                  }}>
                  <span style={{ fontSize: 18 }}>👤</span>
                  Add Patient
                </Link>
                <Link href="/for-dentists/dashboard/appointments?new=1" role="menuitem"
                  onClick={() => setAddOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', minHeight: 48,
                    borderRadius: 8, textDecoration: 'none',
                    fontSize: 14, fontWeight: 600, color: 'var(--text)',
                    background: '#fff',
                  }}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  Add Appointment
                </Link>
              </div>
            )}
          </div>
          <a href={`/dentist/${dentist.slug}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>View Profile →</a>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--blue)', overflow: 'hidden' }}>
            {dentist.profile_photo ? <img src={dentist.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
        </div>

        {/* Content */}
        <div className="dash-content" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="dash-bottom-nav" aria-label="Dashboard mobile navigation">
        {MOBILE_NAV.map(item => {
          const isActive = pathname === item.href || (item.href !== '/for-dentists/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} className={`dash-bottom-item${isActive ? ' is-active' : ''}`}>
              <span className="dash-bottom-icon">{item.icon}</span>
              <span className="dash-bottom-label">{item.label}</span>
            </Link>
          )
        })}
        <button type="button" onClick={() => setMobileOpen(true)} className="dash-bottom-item dash-bottom-more">
          <span className="dash-bottom-icon">☰</span>
          <span className="dash-bottom-label">More</span>
        </button>
      </nav>

      <style>{`
        .dash-sidebar { display: flex !important; }
        .dash-bottom-nav { display: none; }
        @media (max-width: 768px) {
          .dash-sidebar { display: none !important; }
          .dash-content { padding: 16px !important; padding-bottom: 88px !important; }
          .dash-bottom-nav {
            display: flex;
            position: fixed; left: 0; right: 0; bottom: 0;
            height: 64px;
            background: #fff;
            border-top: 1px solid var(--border);
            z-index: 150;
            box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
            padding: 4px 0 max(4px, env(safe-area-inset-bottom));
          }
          .dash-bottom-item {
            flex: 1;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 2px;
            min-height: 56px;
            background: none; border: none;
            color: var(--muted);
            text-decoration: none;
            cursor: pointer;
            font-family: var(--font-body);
            padding: 4px;
          }
          .dash-bottom-item.is-active { color: var(--blue); }
          .dash-bottom-icon { font-size: 20px; line-height: 1; }
          .dash-bottom-label { font-size: 11px; font-weight: 600; line-height: 1; }
        }
      `}</style>
    </div>
  )
}
