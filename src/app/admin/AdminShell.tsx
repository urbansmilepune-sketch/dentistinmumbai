'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCityByDomain, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'registrations', label: 'Registrations', icon: '📋' },
  { id: 'dentists', label: 'Dentists', icon: '🦷' },
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'enquiries', label: 'Enquiries', icon: '💬' },
  { id: 'reviews', label: 'Reviews', icon: '⭐' },
  { id: 'communications', label: 'Communications', icon: '📣' },
  { id: 'areas', label: 'Areas', icon: '📍' },
  { id: 'blog', label: 'Blog', icon: '✍️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
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

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#fff' }}>
          {cityConfig.domain}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Admin Panel</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => { onSectionChange(item.id); setSidebarOpen(false) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 2,
              background: activeSection === item.id ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: activeSection === item.id ? '#fff' : 'rgba(255,255,255,0.65)',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: 14, fontWeight: activeSection === item.id ? 600 : 400,
              textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'reviews' && stats.reviewPendingCount > 0 && (
              <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
                {stats.reviewPendingCount}
              </span>
            )}
            {item.id === 'registrations' && stats.registrationCount > 0 && (
              <span style={{ marginLeft: 'auto', background: '#F59E0B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
                {stats.registrationCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500 }}
        >🚪 Logout</button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div style={{ width: 220, background: '#0F1923', flexShrink: 0, position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50 }} className="admin-sidebar">
        {sidebar}
      </div>

      {/* Mobile header */}
      <div style={{ display: 'none', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#0F1923', position: 'sticky', top: 0, zIndex: 50 }} className="admin-mobile-header">
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#fff', fontSize: 15 }}>Admin</span>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ color: '#fff', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>☰</button>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 240, background: '#0F1923' }}>
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
