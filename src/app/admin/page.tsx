import { createClient } from '@/lib/supabase/server'
import AdminPageClient from './AdminPageClient'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

export const dynamic = 'force-dynamic'

// `?city=<slug>` narrows every list/count on the page to that one city.
// Unknown values fall back to `null` ("All Cities"). The whitelist mirrors
// CITY_CONFIGS so a typo in the URL bar can't accidentally hide real rows.
function normalizeCityFilter(v: string | string[] | undefined): CitySlug | null {
  if (typeof v !== 'string' || !v) return null
  return Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? (v as CitySlug) : null
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const supabase = await createClient()
  const sp = await searchParams
  const cityFilter = normalizeCityFilter(sp.city)

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const weekAgoIso = new Date(now - 7 * dayMs).toISOString()
  const thirtyDaysAgoIso = new Date(now - 30 * dayMs).toISOString()

  // Small ergonomic helper so every query reads `applyCity(q)` instead of
  // duplicating the conditional .eq('city', …) on each line. Typed loosely
  // because Supabase's deeply-chained builder types blow past TS's recursion
  // budget when wrapped in a generic.
  const applyCity = (q: any): any => (cityFilter ? q.eq('city', cityFilter) : q)

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
    // --- City Overview (always all cities, ignores cityFilter) ---
    { data: allDentistSlim },
    { data: allRegistrationsSlim },
    { data: allPatientDentistIds },
  ] = await Promise.all([
    applyCity(supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true)),
    applyCity(supabase.from('appointments').select('*, dentists!inner(city)', { count: 'exact', head: true })),
    applyCity(supabase.from('enquiries').select('*, dentists!inner(city)', { count: 'exact', head: true })),
    applyCity(supabase.from('dentists').select('id, slug, name, clinic_name, qualifications, phone, tier, is_verified, is_active, city, areas(name, slug)').order('created_at', { ascending: false }).limit(100)),
    applyCity(supabase.from('dentist_registrations').select('*').order('created_at', { ascending: false }).limit(100)),
    applyCity(supabase.from('appointments').select('*, dentists!inner(name, city), treatments(name)').order('created_at', { ascending: false }).limit(50)),
    applyCity(supabase.from('enquiries').select('*, dentists!inner(name, city)').order('created_at', { ascending: false }).limit(50)),
    // Reviews don't carry city — filter via the joined dentist.
    cityFilter
      ? supabase.from('reviews').select('*, dentists!inner(name, clinic_name, city)').eq('dentists.city', cityFilter).order('created_at', { ascending: false }).limit(100)
      : supabase.from('reviews').select('*, dentists(name, clinic_name, city)').order('created_at', { ascending: false }).limit(100),
    supabase.from('areas').select('*').order('zone').order('name'),
    supabase.from('founding_config').select('*').eq('id', 1).single(),
    cityFilter
      ? supabase.from('reviews').select('id, dentists!inner(city)', { count: 'exact', head: false }).eq('status', 'pending').eq('dentists.city', cityFilter)
      : supabase.from('reviews').select('id', { count: 'exact', head: false }).eq('status', 'pending'),
    applyCity(supabase.from('dentist_registrations').select('id', { count: 'exact', head: false }).eq('status', 'pending')),
    applyCity(supabase.from('dentist_registrations').select('*', { count: 'exact', head: true })),
    applyCity(supabase.from('dentist_registrations').select('*', { count: 'exact', head: true }).gte('created_at', weekAgoIso)),
    cityFilter
      ? supabase.from('patients').select('*, dentists!inner(city)', { count: 'exact', head: true }).eq('dentists.city', cityFilter)
      : supabase.from('patients').select('*', { count: 'exact', head: true }),
    applyCity(supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('tier', 'gold')),
    applyCity(supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('tier', 'featured')),
    applyCity(supabase.from('dentist_registrations').select('created_at').eq('status', 'pending')),
    // analytics_events isn't city-tagged; join through dentists when filtering.
    cityFilter
      ? supabase.from('analytics_events').select('event_type, dentists!inner(city)').eq('dentists.city', cityFilter).gte('created_at', thirtyDaysAgoIso)
      : supabase.from('analytics_events').select('event_type').gte('created_at', thirtyDaysAgoIso),
    applyCity(supabase.from('appointments').select('*, dentists!inner(city)', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoIso)),
    applyCity(supabase.from('dentist_registrations').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', weekAgoIso)),
    applyCity(supabase.from('dentist_registrations').select('*', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', weekAgoIso)),
    applyCity(supabase.from('dentists').select('id, name, slug, clinic_name, profile_views, city, areas(name)').eq('is_active', true).order('profile_views', { ascending: false, nullsFirst: false }).limit(10)),
    applyCity(supabase.from('dentists').select('id, name, slug, clinic_name, whatsapp_clicks, city, areas(name)').eq('is_active', true).order('whatsapp_clicks', { ascending: false, nullsFirst: false }).limit(10)),
    applyCity(supabase.from('appointments').select('dentist_id, dentists!inner(id, name, slug, clinic_name, city)').limit(5000)),
    applyCity(supabase.from('appointments').select('dentist_id, dentists!inner(id, name, slug, clinic_name, city)').gte('created_at', thirtyDaysAgoIso).limit(5000)),
    // City overview — always global, never filtered.
    supabase.from('dentists').select('id, city, is_active'),
    supabase.from('dentist_registrations').select('city, status'),
    supabase.from('patients').select('dentist_id'),
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

  // -------------------------------------------------------------------------
  // City Overview — global aggregation, one row per known city. Done JS-side
  // because Postgres group-by needs an RPC and our totals (≤ a few thousand
  // dentists / regs / patients) are trivial to fold in memory.
  // -------------------------------------------------------------------------
  type DentSlim = { id: string; city: string | null; is_active: boolean | null }
  type RegSlim = { city: string | null; status: string | null }
  type PatSlim = { dentist_id: string | null }
  const dentSlim = (allDentistSlim || []) as DentSlim[]
  const regSlim = (allRegistrationsSlim || []) as RegSlim[]
  const patSlim = (allPatientDentistIds || []) as PatSlim[]

  // dentist_id → city map for the patients pivot
  const dentistCityById = new Map<string, string>()
  for (const d of dentSlim) {
    if (d.id && d.city) dentistCityById.set(d.id, d.city)
  }

  const patientCountByCity = new Map<string, number>()
  for (const p of patSlim) {
    const c = p.dentist_id ? dentistCityById.get(p.dentist_id) : undefined
    if (!c) continue
    patientCountByCity.set(c, (patientCountByCity.get(c) ?? 0) + 1)
  }

  const cityOverview = (Object.keys(CITY_CONFIGS) as CitySlug[]).map(slug => {
    const cfg = CITY_CONFIGS[slug]
    const dentistsHere = dentSlim.filter(d => d.city === slug)
    const regsHere = regSlim.filter(r => r.city === slug)
    return {
      slug,
      cityName: cfg.cityName,
      domain: cfg.domain,
      registered: regsHere.length,
      active: dentistsHere.filter(d => d.is_active).length,
      pending: regsHere.filter(r => r.status === 'pending').length,
      patients: patientCountByCity.get(slug) ?? 0,
    }
  }).sort((a, b) => b.active - a.active)

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
    cityOverview,
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
      cityFilter={cityFilter}
    />
  )
}
