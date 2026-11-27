'use client'

// "My India profile" card at the top of the dashboard home (27 Nov 2026).
// One tap signs the dentist in on dentistinindia.in (one-time link, see
// /api/auth/india-handoff). When there are unseen alerts it shows the count
// and what happened, and opens the Alerts page instead of the home.
import { useIndiaAlerts, indiaHref } from './useIndiaAlerts'

export default function IndiaProfileCard() {
  const { unseen, line } = useIndiaAlerts()
  const has = unseen > 0
  return (
    <a href={indiaHref(has ? 'alerts' : 'home')}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: has ? '13px 16px' : '10px 16px', borderRadius: 14, textDecoration: 'none', color: '#fff', background: 'linear-gradient(135deg, #0B1B33 0%, #1D4ED8 100%)', boxShadow: '0 4px 14px rgba(29,78,216,.18)' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ flex: 'none' }}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14.5 }}>
          My India profile
          {has && <span style={{ background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 99 }}>{unseen} new</span>}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, opacity: 0.88, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {has && line ? line : 'Your cases, followers and alerts on DentistIn India'}
        </span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 20, flex: 'none' }}>›</span>
    </a>
  )
}
