import { createClient } from '@/lib/supabase/server'
import AdminPageClient from './AdminPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const weekAgoIso = new Date(now - 7 * dayMs).toISOString()
  const thirtyDaysAgoIso = new Date(now - 30 * dayMs).toISOString()

  const [
    { count: dentistCount },
    { count: appointmentCount },
    { count: enquiryCount },
    { data: dentists },
    { data: registrations },
    { data: appointments },
    { data: enquiries },
    { data: reviews },
    { data: areas },
    { data: foundingConfig },
    { data: reviewPending },
    { data: pendingRegs },
    // --- Analytics tab data ---
    { count: totalRegsCount },
    { count: regsThisWeekCount },
    { count: patientCount },
    { count: goldCount },
    { count: featuredCount },
    { data: pendingRegsForWait },
    { data: engagementEvents },
    { count: appointmentsLast30 },
    { count: weekApprovedCount },
    { count: weekRejectedCount },
    { data: topByViews },
    { data: topByWhatsApp },
    { data: apptDentistRowsAll },
    { data: apptDentistRows30 },
  ] = await Promise.all([
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('appointments').select('*', { count: 'exact', head: true }),
    supabase.from('enquiries').select('*', { count: 'exact', head: true }),
    supabase.from('dentists').select('id, slug, name, clinic_name, qualifications, phone, tier, is_verified, is_active, areas(name, slug)').order('created_at', { ascending: false }).limit(100),
    supabase.from('dentist_registrations').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('appointments').select('*, dentists(name), treatments(name)').order('created_at', { ascending: false }).limit(50),
    supabase.from('enquiries').select('*, dentists(name)').order('created_at', { ascending: false }).limit(50),
    supabase.from('reviews').select('*, dentists(name, clinic_name)').order('created_at', { ascending: false }).limit(100),
    supabase.from('areas').select('*').order('zone').order('name'),
    supabase.from('founding_config').select('*').eq('id', 1).single(),
    supabase.from('reviews').select('id', { count: 'exact', head: false }).eq('status', 'pending'),
    supabase.from('dentist_registrations').select('id', { count: 'exact', head: false }).eq('status', 'pending'),
    supabase.from('dentist_registrations').select('*', { count: 'exact', head: true }),
    supabase.from('dentist_registrations').select('*', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
    supabase.from('patients').select('*', { count: 'exact', head: true }),
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('tier', 'gold'),
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('tier', 'featured'),
    supabase.from('dentist_registrations').select('created_at').eq('status', 'pending'),
    supabase.from('analytics_events').select('event_type').gte('created_at', thirtyDaysAgoIso),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoIso),
    supabase.from('dentist_registrations').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', weekAgoIso),
    supabase.from('dentist_registrations').select('*', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', weekAgoIso),
    supabase.from('dentists').select('id, name, slug, clinic_name, profile_views, areas(name)').eq('is_active', true).order('profile_views', { ascending: false, nullsFirst: false }).limit(10),
    supabase.from('dentists').select('id, name, slug, clinic_name, whatsapp_clicks, areas(name)').eq('is_active', true).order('whatsapp_clicks', { ascending: false, nullsFirst: false }).limit(10),
    supabase.from('appointments').select('dentist_id, dentists(id, name, slug, clinic_name)').limit(5000),
    supabase.from('appointments').select('dentist_id, dentists(id, name, slug, clinic_name)').gte('created_at', thirtyDaysAgoIso).limit(5000),
  ])

  const dc = dentistCount || 0
  const stats = {
    dentistCount: dc,
    appointmentCount: appointmentCount || 0,
    enquiryCount: enquiryCount || 0,
    reviewPendingCount: reviewPending?.length || 0,
    registrationCount: pendingRegs?.length || 0,
    foundingPct: Math.min((dc / 250) * 100, 100),
  }

  // Avg wait time for pending registrations (hours)
  const pendingRows = (pendingRegsForWait || []) as Array<{ created_at: string }>
  const avgPendingWaitHrs = pendingRows.length === 0 ? 0 :
    pendingRows.reduce((sum, r) => sum + (now - new Date(r.created_at).getTime()), 0) / pendingRows.length / (60 * 60 * 1000)

  // Engagement totals from analytics_events (last 30 days)
  const ev = (engagementEvents || []) as Array<{ event_type: string }>
  const engagement = {
    profile_views: ev.filter(e => e.event_type === 'profile_view').length,
    whatsapp_clicks: ev.filter(e => e.event_type === 'whatsapp_click').length,
    booking_clicks: ev.filter(e => e.event_type === 'booking_click').length,
    appointments_last30: appointmentsLast30 || 0,
  }

  // Revenue
  const gold = goldCount || 0
  const featured = featuredCount || 0
  const mrr = gold * 999 + featured * 2499
  const arr = mrr * 12
  const paidCount = gold + featured
  const conversionPct = dc > 0 ? (paidCount / dc) * 100 : 0

  // Top by appointments — aggregate JS-side
  type ApptRow = { dentist_id: string; dentists: { id: string; name: string; slug: string; clinic_name: string | null } | null }
  function topDentistsByAppt(rows: ApptRow[], limit = 10) {
    const counts = new Map<string, { id: string; name: string; slug: string; clinic_name: string | null; count: number }>()
    for (const r of rows) {
      if (!r.dentist_id || !r.dentists) continue
      const existing = counts.get(r.dentist_id)
      if (existing) existing.count++
      else counts.set(r.dentist_id, { id: r.dentists.id, name: r.dentists.name, slug: r.dentists.slug, clinic_name: r.dentists.clinic_name, count: 1 })
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, limit)
  }
  const topByAppointments = topDentistsByAppt((apptDentistRowsAll || []) as unknown as ApptRow[])
  const topByAppointments30 = topDentistsByAppt((apptDentistRows30 || []) as unknown as ApptRow[])

  // Areas split — populated vs empty (opportunity)
  type AreaRow = { id: string; name: string; zone: string | null; slug: string; dentist_count: number | null }
  const allAreas = (areas || []) as AreaRow[]
  const populatedAreas = [...allAreas].filter(a => (a.dentist_count || 0) > 0).sort((a, b) => (b.dentist_count || 0) - (a.dentist_count || 0))
  const emptyAreas = allAreas.filter(a => !a.dentist_count)

  const analytics = {
    totalRegistrations: totalRegsCount || 0,
    registrationsThisWeek: regsThisWeekCount || 0,
    pendingApprovals: pendingRows.length,
    avgPendingWaitHrs,
    activeDentists: dc,
    totalPatients: patientCount || 0,
    paidDentists: paidCount,
    goldCount: gold,
    featuredCount: featured,
    mrr,
    arr,
    conversionPct,
    engagement,
    topByViews: topByViews || [],
    topByWhatsApp: topByWhatsApp || [],
    topByAppointments,
    topByAppointments30,
    funnel: {
      registeredThisWeek: regsThisWeekCount || 0,
      approvedThisWeek: weekApprovedCount || 0,
      pending: pendingRows.length,
      rejectedThisWeek: weekRejectedCount || 0,
    },
    areas: {
      populated: populatedAreas,
      empty: emptyAreas,
    },
  }

  return (
    <AdminPageClient
      stats={stats}
      dentists={dentists || []}
      registrations={registrations || []}
      appointments={appointments || []}
      enquiries={enquiries || []}
      reviews={reviews || []}
      areas={areas || []}
      foundingConfig={foundingConfig}
      analytics={analytics}
    />
  )
}
