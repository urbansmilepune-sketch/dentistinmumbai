'use client'

// Admin sidebar. Light-slate panel sitting against the white content area —
// matches the SaaS-admin aesthetic the redesign targets (Vercel / Linear).
// Mobile collapses behind a slide-over drawer triggered from a sticky top
// bar that doubles as the page-section heading host on small screens.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCityByDomain, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

// Nav order matches the redesign brief: the six "core" tabs (Overview,
// Dentists, Registrations, Reviews, Communications, Analytics) lead, with
// operational tabs (Appointments, Enquiries, Areas, Blog, Settings) trailing.
// `id` keys mirror the section state keys in AdminPageClient — don't rename
// without updating both sides.
const NAV_ITEMS = [
  { id: 'dashboard',      label: 'Overview',       icon: '📊' },
  { id: 'dentists',       label: 'Dentists',       icon: '🦷' },
  { id: 'registrations',  label: 'Registrations',  icon: '📋' },
  { id: 'reviews',        label: 'Reviews',        icon: '⭐' },
  { id: 'communications', label: 'Communications', icon: '📣' },
  { id: 'outreach',       label: 'Outreach',       icon: '📧' },
  { id: 'visit-logs',     label: 'Visit Logs',     icon: '🗒️' },
  { id: 'analytics',      label: 'Analytics',      icon: '📈' },
  { id: 'dentist-health', label: 'Dentist Health', icon: '🩺' },
  { id: 'cases',          label: 'Cases',          icon: '🦷' },
  { id: 'appointments',   label: 'Appointments',   icon: '📅' },
  { id: 'enquiries',      label: 'Enquiries',      icon: '💬' },
  { id: 'areas',          label: 'Areas',          icon: '📍' },
  { id: 'blog',           label: 'Blog',           icon: '✍️' },
  { id: 'settings',       label: 'Settings',       icon: '⚙️' },
]

interface AdminShellProps {
  activeSection: string
  onSectionChange: (s: string) => void
  stats: {
    dentistCount: number
    registrationCount: number
    appointmentCount: number
    reviewPendingCount: number
    enquiryCount: number
    foundingPct: number
  }
}

export default function AdminShell({ activeSection, onSectionChange, stats }: AdminShellProps) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [cityConfig, setCityConfig] = useState<CityConfig>(CITY_CONFIGS[DEFAULT_CITY])
  useEffect(() => { setCityConfig(getCityByDomain(window.location.hostname)) }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const activeLabel = NAV_ITEMS.find(n => n.id === activeSection)?.label ?? 'Admin'

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>
      {/* Brand header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#0F1923' }}>
          {cityConfig.domain}
        </div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: 500 }}>Admin Panel</div>
      </div>

      {/* Nav list. Active row gets a soft blue tint + a 2px left rail so it
          reads as "selected" without the heavy filled-pill treatment that
          made the old dark sidebar feel cramped. */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => { onSectionChange(item.id); setSidebarOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                background: active ? '#EFF6FF' : 'transparent',
                color: active ? '#1D4ED8' : '#475569',
                border: 'none',
                borderLeft: `3px solid ${active ? '#1D4ED8' : 'transparent'}`,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                fontSize: 14, fontWeight: active ? 600 : 500,
                textAlign: 'left', transition: 'background 0.15s, color 0.15s',
                paddingLeft: 9,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F1F5F9' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.id === 'reviews' && stats.reviewPendingCount > 0 && (
                <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, minWidth: 18, textAlign: 'center' }}>
                  {stats.reviewPendingCount}
                </span>
              )}
              {item.id === 'registrations' && stats.registrationCount > 0 && (
                <span style={{ background: '#F59E0B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, minWidth: 18, textAlign: 'center' }}>
                  {stats.registrationCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: '12px', borderTop: '1px solid #E2E8F0' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: '#fff', color: '#475569',
            border: '1px solid #E2E8F0',
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          }}
        >🚪 Logout</button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div
        style={{
          width: 240, flexShrink: 0,
          position: 'fixed', left: 0, top: 0, bottom: 0,
          zIndex: 50,
          borderRight: '1px solid #E2E8F0',
        }}
        className="admin-sidebar"
      >
        {sidebar}
      </div>

      {/* Mobile sticky header — shows the current section name and the
          hamburger that opens the slide-over. Sits flush at the top so the
          page header inside the content scrolls under it. */}
      <div
        style={{
          display: 'none',
          alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky', top: 0, zIndex: 50,
        }}
        className="admin-mobile-header"
      >
        <div>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#0F1923', fontSize: 15 }}>{activeLabel}</div>
        </div>
        <button
          aria-label="Open menu"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            color: '#0F1923', background: '#F1F5F9',
            border: '1px solid #E2E8F0', borderRadius: 8,
            width: 40, height: 40, fontSize: 18, cursor: 'pointer',
          }}
        >☰</button>
      </div>

      {/* Mobile slide-over */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(15, 25, 35, 0.45)' }}
          />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260, boxShadow: '0 10px 40px rgba(0,0,0,0.18)' }}>
            {sidebar}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .admin-sidebar { display: none !important; }
          .admin-mobile-header { display: flex !important; }
        }
      `}</style>
    </>
  )
}
