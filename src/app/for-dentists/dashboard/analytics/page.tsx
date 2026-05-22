import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FeatureGate from '@/components/FeatureGate'
import { effectiveTier } from '@/lib/tier'
import AnalyticsTabs from './AnalyticsTabs'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/for-dentists/login')

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, name, tier, trial_started_at, profile_views, whatsapp_clicks, call_clicks, booking_clicks')
    .eq('email', user.email)
    .single()
  if (!dentist) redirect('/for-dentists/login')

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch stats
  const [
    { count: totalAppts },
    { count: pendingAppts },
    { count: completedAppts },
    { count: totalEnquiries },
    { count: totalReviews },
    { data: recentAppts },
    { data: recentEvents },
  ] = await Promise.all([
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'pending'),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'completed'),
    supabase.from('enquiries').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'approved'),
    supabase.from('appointments').select('appt_date, status').eq('dentist_id', dentist.id).order('appt_date', { ascending: false }).limit(30),
    supabase.from('analytics_events').select('event_type, created_at').eq('dentist_id', dentist.id).gte('created_at', sevenDaysAgoIso),
  ])

  // Build last-7-days matrix [{ dayLabel, profile_view, whatsapp_click, call_click, booking_click }]
  const EVENT_TYPES = ['profile_view', 'whatsapp_click', 'call_click', 'booking_click'] as const
  type EventType = (typeof EVENT_TYPES)[number]
  const dayBuckets: { key: string; label: string; counts: Record<EventType, number> }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
    dayBuckets.push({ key, label, counts: { profile_view: 0, whatsapp_click: 0, call_click: 0, booking_click: 0 } })
  }
  ;(recentEvents || []).forEach(ev => {
    const key = ev.created_at.slice(0, 10)
    const bucket = dayBuckets.find(b => b.key === key)
    if (bucket && EVENT_TYPES.includes(ev.event_type as EventType)) {
      bucket.counts[ev.event_type as EventType]++
    }
  })

  // Group appointments by week
  const weeklyData: Record<string, number> = {}
  ;(recentAppts || []).forEach(a => {
    const week = new Date(a.appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    weeklyData[week] = (weeklyData[week] || 0) + 1
  })
  const chartData = Object.entries(weeklyData).slice(0, 7).reverse()
  const maxVal = Math.max(...chartData.map(([, v]) => v), 1)

  // Use the effective tier so trial-period free dentists see Silver/Gold
  // stat cards as unlocked. Once the trial elapses they fall back to free.
  const tier = effectiveTier(dentist.tier, dentist.trial_started_at)

  // Three headline stats every dentist gets — these are the "real numbers"
  // the free tier sees so the page never feels empty even on the free plan.
  const FREE_STATS = [
    { icon: '👁️', label: 'Profile Views', value: dentist.profile_views || 0, color: 'var(--blue)' },
    { icon: '💬', label: 'Total Enquiries', value: totalEnquiries || 0, color: 'var(--orange)' },
    { icon: '💚', label: 'WhatsApp Clicks', value: dentist.whatsapp_clicks || 0, color: '#25D366' },
  ]

  // Six more stat cards revealed at Silver+ (appointment funnel + reviews +
  // call/booking channel breakdown).
  const SILVER_STATS = [
    { icon: '📅', label: 'Total Appointments', value: totalAppts || 0, color: 'var(--blue)' },
    { icon: '⏳', label: 'Pending', value: pendingAppts || 0, color: '#F59E0B' },
    { icon: '✅', label: 'Completed', value: completedAppts || 0, color: '#00A878' },
    { icon: '⭐', label: 'Reviews', value: totalReviews || 0, color: '#F59E0B' },
    { icon: '📞', label: 'Call Clicks', value: dentist.call_clicks || 0, color: '#0EA5E9' },
    { icon: '📅', label: 'Booking Clicks', value: dentist.booking_clicks || 0, color: '#92400E' },
  ]

  const EVENT_META: Record<EventType, { label: string; color: string }> = {
    profile_view:   { label: 'Views',     color: 'var(--blue)' },
    whatsapp_click: { label: 'WhatsApp',  color: '#25D366' },
    call_click:     { label: 'Calls',     color: '#0EA5E9' },
    booking_click:  { label: 'Bookings',  color: '#92400E' },
  }
  const hasAnyEvents = dayBuckets.some(b => EVENT_TYPES.some(t => b.counts[t] > 0))

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Analytics</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Profile performance + revenue, treatment mix, retention, appointment-flow metrics</p>
      </div>

      {/* Sub-tab switcher. The engagement JSX below is server-rendered
          inline as `children` so the headline stats stream with the
          first byte; the Reports view is a client component that
          mounts the first time the dentist clicks its tab. */}
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
        <AnalyticsTabs>
          <div>
      {/* Headline stats (visible to every tier) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 16 }}>
        {FREE_STATS.map(stat => (
          <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Silver-tier stat cards — appointment funnel + reviews + channel breakdown. */}
      <FeatureGate
        requiredTier="silver"
        featureName="Full stats grid"
        benefitText="Track appointments, conversions, reviews, and channel breakdown — not just headline numbers."
        dentistTier={tier}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
          {SILVER_STATS.map(stat => (
            <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </FeatureGate>

      {/* 30-day appointment trend — Silver+. */}
      {chartData.length > 0 && (
        <FeatureGate
          requiredTier="silver"
          featureName="30-day trend chart"
          benefitText="See how your bookings move week-by-week to spot momentum and slow patches."
          dentistTier={tier}
        >
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Appointments — Last 30 Days</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {chartData.map(([label, value]) => (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)' }}>{value}</span>
                  <div style={{ width: '100%', background: 'var(--blue)', borderRadius: '4px 4px 0 0', height: `${(value / maxVal) * 80}px`, minHeight: 4 }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureGate>
      )}

      {/* Weekly engagement breakdown — Gold-only (conversion-funnel adjacent). */}
      <FeatureGate
        requiredTier="gold"
        featureName="Engagement funnel"
        benefitText="Day-by-day breakdown of which channel — WhatsApp, call, or booking — actually converts your profile views."
        dentistTier={tier}
      >
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Engagement — Last 7 Days</h3>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>profile views, WhatsApp / call / booking clicks</span>
        </div>
        {!hasAnyEvents ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '16px 0' }}>No engagement events recorded in the last 7 days yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Day</th>
                  {EVENT_TYPES.map(t => (
                    <th key={t} style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: EVENT_META[t].color }}>
                      {EVENT_META[t].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayBuckets.map(b => (
                  <tr key={b.key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{b.label}</td>
                    {EVENT_TYPES.map(t => (
                      <td key={t} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: b.counts[t] > 0 ? 600 : 400, color: b.counts[t] > 0 ? EVENT_META[t].color : 'var(--muted)' }}>
                        {b.counts[t]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </FeatureGate>

      {/* Tips */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>💡 Tips to Get More Patients</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { tip: 'Complete your profile to 100%', action: 'Edit Profile', href: '/for-dentists/dashboard/profile' },
            { tip: 'Add at least 5 clinic photos', action: 'Upload Photos', href: '/for-dentists/dashboard/photos' },
            { tip: 'Add your WhatsApp number for direct leads', action: 'Add WhatsApp', href: '/for-dentists/dashboard/profile' },
            { tip: 'List all treatments with fees to show in search', action: 'Add Treatments', href: '/for-dentists/dashboard/treatments' },
          ].map(item => (
            <div key={item.tip} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>→ {item.tip}</span>
              <a href={item.href} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>{item.action}</a>
            </div>
          ))}
        </div>
      </div>
          </div>
        </AnalyticsTabs>
      </Suspense>
    </div>
  )
}
