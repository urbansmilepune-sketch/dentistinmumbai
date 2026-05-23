import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import AdminPageClient from './AdminPageClient'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'
import { completionPct, type CompletionFields } from '@/lib/profileCompletion'

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

  // Admin gate. The user-bound `supabase` client is only used to resolve
  // identity from the JWT — every actual data read below goes through
  // `adminClient` (service role) so RLS doesn't silently drop rows from
  // clinic-private tables (appointments, patients, reviews, outreach_*,
  // …) that the admin needs to see. The admin_users lookup also uses
  // the service-role client so we don't depend on a self-read RLS policy
  // existing on admin_users. Anyone who isn't in admin_users gets bounced
  // to the dentist login (not /admin/login) so we don't telegraph that an
  // admin surface even exists.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/for-dentists/login')
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: adminRow } = await adminClient
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!adminRow) redirect('/for-dentists/login')

  const sp = await searchParams
  const cityFilter = normalizeCityFilter(sp.city)

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const weekAgoIso = new Date(now - 7 * dayMs).toISOString()
  const thirtyDaysAgoIso = new Date(now - 30 * dayMs).toISOString()
  // "Today" anchors used by the today-bookings + new-registrations-today
  // tiles. todayIstIso is the YYYY-MM-DD comparison against appointments.appt_date;
  // todayStartIso is the UTC midnight ISO used against created_at columns.
  const todayIstIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const _ds = new Date()
  _ds.setUTCHours(0, 0, 0, 0)
  const todayStartIso = _ds.toISOString()
  // Calendar-month start (UTC) — used for "this month" metrics so the cards
  // line up with how a finance/ops user reads "this month" rather than a
  // rolling 30-day window. Day-of-month is reset to 1, time to 00:00:00Z.
  const _ms = new Date()
  _ms.setUTCDate(1); _ms.setUTCHours(0, 0, 0, 0)
  const monthStartIso = _ms.toISOString()
  // Churn window — paid dentists whose tier_expires_at falls in the next
  // 7 days. Iso lower bound is "now" so we don't catch already-expired rows.
  const sevenDaysAheadIso = new Date(now + 7 * dayMs).toISOString()
  const nowIso = new Date(now).toISOString()

  // Small ergonomic helper so every query reads `applyCity(q)` instead of
  // duplicating the conditional .eq('city', …) on each line. Typed loosely
  // because Supabase's deeply-chained builder types blow past TS's recursion
  // budget when wrapped in a generic.
  const applyCity = (q: any): any => (cityFilter ? q.eq('city', cityFilter) : q)

  // Dentists lookup — fetched once up front so the appointments queries
  // below can a) join in JS instead of relying on a `dentists!inner(…)`
  // FK resolution (the appointments table's dentist_id FK isn't
  // discoverable to PostgREST, which previously made every appointments
  // count + the Top-10 leaderboard come back empty), and b) translate
  // a `?city=` filter into an `.in('dentist_id', …)` clause since the
  // appointments row itself carries no city column. The select is slim
  // enough that fetching every dentist (active + inactive) stays cheap
  // at current scale and avoids juggling two dentists fetches.
  type DentLookup = {
    id: string
    name: string
    slug: string
    clinic_name: string | null
    city: string | null
    is_active: boolean | null
  }
  const { data: allDentistsLookupRaw } = await adminClient
    .from('dentists')
    .select('id, name, slug, clinic_name, city, is_active')
  const allDentistsLookup = (allDentistsLookupRaw || []) as DentLookup[]
  const dentistById = new Map(allDentistsLookup.map(d => [d.id, d]))
  // Null when no city filter is active. An empty array would otherwise
  // collapse `applyApptCity` into `.in('dentist_id', [])` which returns
  // zero rows — which is the right answer for a city with no dentists,
  // but the wrong answer for "no filter selected".
  const cityDentistIds: string[] | null = cityFilter
    ? allDentistsLookup.filter(d => d.city === cityFilter).map(d => d.id)
    : null
  // Appointments / enquiries / patients / gallery_photos / analytics_events
  // don't carry their own `city` column, so the URL `?city=` param has to
  // be translated into a dentist_id IN (…) clause via this helper. Plain
  // `applyCity` would wrongly chain `.eq('city', …)` on a non-existent
  // column for these tables.
  const applyApptCity = (q: any): any =>
    (cityDentistIds ? q.in('dentist_id', cityDentistIds) : q)

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
    { data: allRegistrationsSlim },
    { data: allPatientDentistIds },
    { data: commsDentists },
    // --- New analytics: revenue, booking funnel, patient + content health ---
    { count: silverCount },
    { count: appointmentsThisMonthCount },
    { count: newPatientsThisMonthCount },
    { data: appointmentsThisMonthSlim },
    { data: appointmentsAllPatientSlim },
    { data: gallerySlim },
    // Active dentists — fuller projection used for completion scoring, churn
    // risk, photo/maps gaps, and the new "Dentist Health" tab.
    { data: healthDentists },
    // --- Outreach metrics ---
    { count: outreachContactsTotal },
    { count: outreachSentThisMonthCount },
    { count: outreachSentAllCount },
    { count: outreachOpenedCount },
    { count: outreachRegisteredCount },
    // --- Cases moderation ---
    { data: pendingCases },
    { data: openReports },
    // --- Today metrics (admin overview) ---
    { count: bookingsTodayCount },
    { count: newRegsTodayCount },
  ] = await Promise.all([
    applyCity(adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true)),
    applyApptCity(adminClient.from('appointments').select('*', { count: 'exact', head: true })),
    applyCity(adminClient.from('enquiries').select('*, dentists!inner(city)', { count: 'exact', head: true })),
    applyCity(adminClient.from('dentists').select('id, slug, name, clinic_name, email, qualifications, phone, tier, is_verified, is_active, city, areas(name, slug)').order('created_at', { ascending: false }).limit(100)),
    applyCity(adminClient.from('dentist_registrations').select('*').order('created_at', { ascending: false }).limit(100)),
    applyApptCity(adminClient.from('appointments').select('*, treatments(name)').order('created_at', { ascending: false }).limit(50)),
    applyCity(adminClient.from('enquiries').select('*, dentists!inner(name, city)').order('created_at', { ascending: false }).limit(50)),
    // Reviews don't carry city — filter via the joined dentist.
    cityFilter
      ? adminClient.from('reviews').select('*, dentists!inner(name, clinic_name, city)').eq('dentists.city', cityFilter).order('created_at', { ascending: false }).limit(100)
      : adminClient.from('reviews').select('*, dentists(name, clinic_name, city)').order('created_at', { ascending: false }).limit(100),
    adminClient.from('areas').select('*').order('zone').order('name'),
    adminClient.from('founding_config').select('*').eq('id', 1).single(),
    cityFilter
      ? adminClient.from('reviews').select('id, dentists!inner(city)', { count: 'exact', head: false }).eq('status', 'pending').eq('dentists.city', cityFilter)
      : adminClient.from('reviews').select('id', { count: 'exact', head: false }).eq('status', 'pending'),
    applyCity(adminClient.from('dentist_registrations').select('id', { count: 'exact', head: false }).eq('status', 'pending')),
    applyCity(adminClient.from('dentist_registrations').select('*', { count: 'exact', head: true })),
    applyCity(adminClient.from('dentist_registrations').select('*', { count: 'exact', head: true }).gte('created_at', weekAgoIso)),
    cityFilter
      ? adminClient.from('patients').select('*, dentists!inner(city)', { count: 'exact', head: true }).eq('dentists.city', cityFilter)
      : adminClient.from('patients').select('*', { count: 'exact', head: true }),
    applyCity(adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('tier', 'gold')),
    applyCity(adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('tier', 'featured')),
    applyCity(adminClient.from('dentist_registrations').select('created_at').eq('status', 'pending')),
    // analytics_events isn't city-tagged; join through dentists when filtering.
    cityFilter
      ? adminClient.from('analytics_events').select('event_type, dentists!inner(city)').eq('dentists.city', cityFilter).gte('created_at', thirtyDaysAgoIso)
      : adminClient.from('analytics_events').select('event_type').gte('created_at', thirtyDaysAgoIso),
    applyApptCity(adminClient.from('appointments').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoIso)),
    applyCity(adminClient.from('dentist_registrations').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', weekAgoIso)),
    applyCity(adminClient.from('dentist_registrations').select('*', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', weekAgoIso)),
    applyCity(adminClient.from('dentists').select('id, name, slug, clinic_name, profile_views, city, areas(name)').eq('is_active', true).order('profile_views', { ascending: false, nullsFirst: false }).limit(10)),
    applyCity(adminClient.from('dentists').select('id, name, slug, clinic_name, whatsapp_clicks, city, areas(name)').eq('is_active', true).order('whatsapp_clicks', { ascending: false, nullsFirst: false }).limit(10)),
    applyApptCity(adminClient.from('appointments').select('dentist_id').limit(5000)),
    applyApptCity(adminClient.from('appointments').select('dentist_id').gte('created_at', thirtyDaysAgoIso).limit(5000)),
    // City overview — always global, never filtered. The dentists axis
    // comes from the up-front `allDentistsLookup` fetch, so only the
    // registrations + patients pivots stay in this Promise.all.
    adminClient.from('dentist_registrations').select('city, status'),
    adminClient.from('patients').select('dentist_id'),
    // Communications-tab dropdown — must show every dentist regardless of
    // the cityFilter URL param + above the 100-row cap that the dentists
    // table query uses. Slim columns so the payload stays small even at a
    // few thousand dentists.
    adminClient.from('dentists').select('id, name, clinic_name, email, city, tier').eq('is_active', true).not('email', 'is', null).order('clinic_name', { ascending: true }),

    // --- New: silver count (Revenue) ---
    applyCity(adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('tier', 'silver')),

    // --- New: booking funnel ---
    applyApptCity(adminClient.from('appointments').select('*', { count: 'exact', head: true }).gte('created_at', monthStartIso)),
    cityFilter
      ? adminClient.from('patients').select('*, dentists!inner(city)', { count: 'exact', head: true }).eq('dentists.city', cityFilter).gte('created_at', monthStartIso)
      : adminClient.from('patients').select('*', { count: 'exact', head: true }).gte('created_at', monthStartIso),
    // Slim "bookings this month" rows used for the by-city pivot. Limit
    // 5000 mirrors the existing apptDentistRows30 cap — comfortably above
    // realistic monthly volume at current scale.
    applyApptCity(adminClient.from('appointments').select('dentist_id').gte('created_at', monthStartIso).limit(5000)),
    // patient_id list across ALL appointments (city-filtered) for returning-
    // rate + avg-appts-per-patient computation. Excludes legacy rows with
    // no patient_id link.
    applyApptCity(adminClient.from('appointments').select('patient_id, dentist_id').not('patient_id', 'is', null).limit(20000)),

    // --- New: content health ---
    cityFilter
      ? adminClient.from('gallery_photos').select('dentist_id, dentists!inner(city)').eq('dentists.city', cityFilter).limit(20000)
      : adminClient.from('gallery_photos').select('dentist_id').limit(20000),
    applyCity(
      adminClient.from('dentists')
        .select('id, slug, name, clinic_name, email, phone, whatsapp, city, tier, tier_expires_at, profile_photo, cover_photo, bio, maps_embed, review_count, created_at, areas(name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(2000),
    ),

    // --- New: outreach metrics (admin-only tables — no city filter) ---
    adminClient.from('outreach_contacts').select('*', { count: 'exact', head: true }),
    adminClient.from('outreach_contacts').select('*', { count: 'exact', head: true }).gte('sent_at', monthStartIso),
    adminClient.from('outreach_contacts').select('*', { count: 'exact', head: true }).not('sent_at', 'is', null),
    adminClient.from('outreach_contacts').select('*', { count: 'exact', head: true }).not('opened_at', 'is', null),
    adminClient.from('outreach_contacts').select('*', { count: 'exact', head: true }).not('registered_at', 'is', null),

    // --- Cases moderation queue. RLS on cases / case_reports is built
    //     around the dentist owner; admins read via service role so the
    //     moderation tab sees every pending row regardless of who owns
    //     it. The same `adminClient` already gates the admin login.
    adminClient
      .from('cases')
      .select('id, title, specialty, complexity, created_at, dentists(name, slug, clinic_name, city), case_photos(url, kind, display_order)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50),
    adminClient
      .from('case_reports')
      .select('id, reason, created_at, case_id, reporter:reporter_dentist_id(name, slug), case:case_id(title, status, dentist:dentist_id(name, slug))')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(50),

    // --- Today metrics. appt_date is a date column so the IST-calendar
    //     comparison is the right one ("appointments scheduled for today"
    //     not "appointments created today"). Registrations don't carry an
    //     appt_date — we filter on created_at >= UTC-midnight to keep the
    //     today bucket consistent across server restarts.
    applyApptCity(adminClient.from('appointments').select('*', { count: 'exact', head: true }).eq('appt_date', todayIstIso)),
    applyCity(adminClient.from('dentist_registrations').select('*', { count: 'exact', head: true }).gte('created_at', todayStartIso)),
  ])

  const dc = dentistCount || 0
  const stats = {
    dentistCount: dc,
    appointmentCount: appointmentCount || 0,
    enquiryCount: enquiryCount || 0,
    reviewPendingCount: reviewPending?.length || 0,
    registrationCount: pendingRegs?.length || 0,
    foundingPct: Math.min((dc / 250) * 100, 100),
    bookingsToday: bookingsTodayCount || 0,
    newRegistrationsToday: newRegsTodayCount || 0,
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

  // Revenue. Silver is finally counted in MRR — previously the calc skipped
  // it because the upgrade flow didn't ship Silver pricing on launch. Pricing
  // mirrors PlanSelector: Silver ₹499/mo, Gold ₹999/mo, Featured ₹2,499/mo.
  const silver = silverCount || 0
  const gold = goldCount || 0
  const featured = featuredCount || 0
  const mrr = silver * 499 + gold * 999 + featured * 2499
  const arr = mrr * 12
  const paidCount = silver + gold + featured
  const conversionPct = dc > 0 ? (paidCount / dc) * 100 : 0
  const avgRevenuePerPaid = paidCount > 0 ? mrr / paidCount : 0

  // Top by appointments — aggregate JS-side. Rows come back as bare
  // dentist_id slugs (we dropped the `dentists!inner(…)` join because
  // PostgREST can't resolve the appointments→dentists FK) and the
  // display fields are stitched in from `dentistById`.
  type ApptRow = { dentist_id: string | null }
  function topDentistsByAppt(rows: ApptRow[], limit = 10) {
    const counts = new Map<string, { id: string; name: string; slug: string; clinic_name: string | null; count: number }>()
    for (const r of rows) {
      if (!r.dentist_id) continue
      const d = dentistById.get(r.dentist_id)
      if (!d) continue
      const existing = counts.get(r.dentist_id)
      if (existing) existing.count++
      else counts.set(r.dentist_id, { id: d.id, name: d.name, slug: d.slug, clinic_name: d.clinic_name, count: 1 })
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, limit)
  }
  const topByAppointments = topDentistsByAppt((apptDentistRowsAll || []) as ApptRow[])
  const topByAppointments30 = topDentistsByAppt((apptDentistRows30 || []) as ApptRow[])

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
  type RegSlim = { city: string | null; status: string | null }
  type PatSlim = { dentist_id: string | null }
  const regSlim = (allRegistrationsSlim || []) as RegSlim[]
  const patSlim = (allPatientDentistIds || []) as PatSlim[]

  const patientCountByCity = new Map<string, number>()
  for (const p of patSlim) {
    const c = p.dentist_id ? dentistById.get(p.dentist_id)?.city : undefined
    if (!c) continue
    patientCountByCity.set(c, (patientCountByCity.get(c) ?? 0) + 1)
  }

  // -------------------------------------------------------------------------
  // Booking funnel. Conversion rate is profile_views (30d) → appointments
  // (30d), which is the most actionable funnel ratio we have given that
  // analytics_events only carries last-30-day data after compaction. Avg
  // bookings per dentist is all-time over the active roster.
  // -------------------------------------------------------------------------
  const bookingsThisMonth = appointmentsThisMonthCount || 0
  const bookingConversionPct = engagement.profile_views > 0
    ? (engagement.appointments_last30 / engagement.profile_views) * 100
    : 0
  const avgBookingsPerDentist = dc > 0 ? (appointmentCount || 0) / dc : 0

  // Bookings-by-city — derived JS-side from the slim "this month" appt rows.
  // Looks up city via `dentistById` because the appointments row itself
  // doesn't carry a city column; rows whose dentist isn't in the map
  // (deleted dentist, stale join) just fall out instead of bucketing
  // into "unknown".
  type ApptCityRow = { dentist_id: string | null }
  const bookingsByCityMap = new Map<string, number>()
  for (const r of (appointmentsThisMonthSlim || []) as ApptCityRow[]) {
    const c = r.dentist_id ? dentistById.get(r.dentist_id)?.city : undefined
    if (!c) continue
    bookingsByCityMap.set(c, (bookingsByCityMap.get(c) ?? 0) + 1)
  }
  const bookingsByCity = (Object.keys(CITY_CONFIGS) as CitySlug[])
    .map(slug => ({
      slug,
      cityName: CITY_CONFIGS[slug].cityName,
      bookings: bookingsByCityMap.get(slug) ?? 0,
    }))
    .sort((a, b) => b.bookings - a.bookings)

  // -------------------------------------------------------------------------
  // Patient metrics. `appointmentsAllPatientSlim` is appointments.patient_id
  // (non-null) scoped to the cityFilter; group counts give us returning vs
  // one-visit splits and avg appointments per patient.
  // -------------------------------------------------------------------------
  const patientApptCounts = new Map<string, number>()
  for (const a of (appointmentsAllPatientSlim || []) as Array<{ patient_id: string | null }>) {
    if (!a.patient_id) continue
    patientApptCounts.set(a.patient_id, (patientApptCounts.get(a.patient_id) ?? 0) + 1)
  }
  const totalPatients = patientCount || 0
  // Returning = patients with ≥2 appointments. Denominator is total patients
  // (not just patients with ≥1 appt) because a brand-new patient row with
  // zero appointments is still a "non-returning" patient in product terms.
  let returningPatientCount = 0
  for (const cnt of patientApptCounts.values()) if (cnt >= 2) returningPatientCount++
  const returningPatientRatePct = totalPatients > 0 ? (returningPatientCount / totalPatients) * 100 : 0
  // Avg appointments per patient — only over patients that have at least one
  // appointment, because dividing by `totalPatients` would blend in rows
  // that exist solely from the patient-record CRUD with no booking history
  // and produce a misleading sub-1 number.
  const patientsWithAtLeastOne = patientApptCounts.size
  const totalApptsForPatients = Array.from(patientApptCounts.values()).reduce((a, b) => a + b, 0)
  const avgAppointmentsPerPatient = patientsWithAtLeastOne > 0
    ? totalApptsForPatients / patientsWithAtLeastOne
    : 0
  const newPatientsThisMonth = newPatientsThisMonthCount || 0

  // -------------------------------------------------------------------------
  // Gallery counts per dentist — used both by the "no gallery photos" content
  // health metric AND by the at-risk Dentist Health tab.
  // -------------------------------------------------------------------------
  const galleryByDentist = new Map<string, number>()
  for (const g of (gallerySlim || []) as Array<{ dentist_id: string | null }>) {
    if (!g.dentist_id) continue
    galleryByDentist.set(g.dentist_id, (galleryByDentist.get(g.dentist_id) ?? 0) + 1)
  }

  // dentists with ≥1 appointment in the last 30 days. Used to compute
  // "0 bookings in last 30 days" without an extra query.
  const dentistsWithBookings30 = new Set<string>()
  for (const r of (apptDentistRows30 || []) as Array<{ dentist_id: string | null }>) {
    if (r.dentist_id) dentistsWithBookings30.add(r.dentist_id)
  }

  // -------------------------------------------------------------------------
  // Dentist health scoring. One row per active dentist, projected to just
  // the signals the admin needs in the Health tab. `risk_score` is the
  // sum of weighted at-risk flags so the tab can sort "most at risk" first.
  // -------------------------------------------------------------------------
  type HealthDentRow = {
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
    profile_photo: string | null
    cover_photo: string | null
    bio: string | null
    maps_embed: string | null
    review_count: number | null
    created_at: string
    areas: { name: string } | null
  }
  const healthRows = (healthDentists || []) as unknown as HealthDentRow[]
  const dentistHealth = healthRows.map(d => {
    const fields: CompletionFields = {
      profile_photo: d.profile_photo,
      cover_photo: d.cover_photo,
      bio: d.bio,
      whatsapp: d.whatsapp,
      maps_embed: d.maps_embed,
    }
    const completion = completionPct(fields)
    const zeroBookings30d = !dentistsWithBookings30.has(d.id)
    const lowCompletion = completion < 60
    const noPhoto = !d.profile_photo
    const noMaps = !d.maps_embed
    const galleryCount = galleryByDentist.get(d.id) ?? 0
    const noGallery = galleryCount === 0
    // Weighted risk score — bookings drought is the loudest signal because
    // every other gap (photo, maps, gallery) can be fixed in minutes; a
    // dentist with zero bookings in 30 days is the one we should call.
    const risk_score =
      (zeroBookings30d ? 3 : 0) +
      (lowCompletion   ? 2 : 0) +
      (noPhoto         ? 1 : 0) +
      (noMaps          ? 1 : 0) +
      (noGallery       ? 1 : 0)
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      clinic_name: d.clinic_name,
      email: d.email,
      phone: d.phone,
      whatsapp: d.whatsapp,
      city: d.city,
      tier: d.tier,
      tier_expires_at: d.tier_expires_at,
      created_at: d.created_at,
      area: d.areas?.name ?? null,
      completion,
      flags: { zeroBookings30d, lowCompletion, noPhoto, noMaps, noGallery },
      gallery_count: galleryCount,
      risk_score,
    }
  })

  // Rollup counters powering the new content + revenue + booking cards.
  const avgCompletion = dentistHealth.length === 0
    ? 0
    : dentistHealth.reduce((sum, d) => sum + d.completion, 0) / dentistHealth.length
  const noBookings30Count = dentistHealth.filter(d => d.flags.zeroBookings30d).length
  const incompleteProfileCount = dentistHealth.filter(d => d.flags.lowCompletion).length
  const noPhotoCount = dentistHealth.filter(d => d.flags.noPhoto).length
  const noMapsCount = dentistHealth.filter(d => d.flags.noMaps).length
  const noGalleryCount = dentistHealth.filter(d => d.flags.noGallery).length
  const withReviewsCount = healthRows.filter(d => (d.review_count ?? 0) > 0).length
  const withoutReviewsCount = healthRows.length - withReviewsCount

  // Churn risk — paid dentists whose tier_expires_at falls in the next
  // 7 days. `tier !== 'free'` filter skips the trial-equivalent rows so
  // we only surface accounts that actually paid and are about to lapse.
  const churnRiskRows = healthRows.filter(d => {
    if (!d.tier_expires_at || d.tier === 'free' || !d.tier) return false
    const t = new Date(d.tier_expires_at).getTime()
    return Number.isFinite(t) && t >= now && t <= now + 7 * dayMs
  }).map(d => ({
    id: d.id, slug: d.slug, name: d.name, clinic_name: d.clinic_name,
    email: d.email, phone: d.phone, whatsapp: d.whatsapp, tier: d.tier,
    tier_expires_at: d.tier_expires_at,
  }))

  // -------------------------------------------------------------------------
  // Outreach rollup. open_rate uses sent_at as the denominator because
  // open tracking only fires after a send; click & registration share the
  // same denominator so the percentages line up on the dashboard.
  // -------------------------------------------------------------------------
  const outreachSentAll = outreachSentAllCount || 0
  const outreachOpenRatePct = outreachSentAll > 0
    ? ((outreachOpenedCount || 0) / outreachSentAll) * 100
    : 0
  const outreachConversionPct = outreachSentAll > 0
    ? ((outreachRegisteredCount || 0) / outreachSentAll) * 100
    : 0

  const cityOverview = (Object.keys(CITY_CONFIGS) as CitySlug[]).map(slug => {
    const cfg = CITY_CONFIGS[slug]
    const dentistsHere = allDentistsLookup.filter(d => d.city === slug)
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
    totalPatients,
    paidDentists: paidCount,
    silverCount: silver,
    goldCount: gold,
    featuredCount: featured,
    mrr,
    arr,
    conversionPct,
    avgRevenuePerPaid,
    churnRisk7d: churnRiskRows,
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
    // --- Booking funnel ---
    booking: {
      thisMonth: bookingsThisMonth,
      conversionPct: bookingConversionPct,
      avgPerDentist: avgBookingsPerDentist,
      byCity: bookingsByCity,
    },
    // --- Patient metrics ---
    patients: {
      total: totalPatients,
      newThisMonth: newPatientsThisMonth,
      returningRatePct: returningPatientRatePct,
      avgAppointmentsPerPatient,
    },
    // --- Content health ---
    content: {
      noGallery: noGalleryCount,
      noMapsEmbed: noMapsCount,
      avgCompletionPct: avgCompletion,
      withReviews: withReviewsCount,
      withoutReviews: withoutReviewsCount,
    },
    // --- Dentist health (also drives the new Dentist Health tab) ---
    health: {
      noBookings30: noBookings30Count,
      incompleteProfile: incompleteProfileCount,
      noPhoto: noPhotoCount,
      totalActive: dentistHealth.length,
    },
    // --- Outreach ---
    outreach: {
      contactsTotal: outreachContactsTotal || 0,
      sentThisMonth: outreachSentThisMonthCount || 0,
      sentAll: outreachSentAll,
      opened: outreachOpenedCount || 0,
      openRatePct: outreachOpenRatePct,
      registered: outreachRegisteredCount || 0,
      conversionPct: outreachConversionPct,
    },
  }

  // Appointments rows are fetched without the `dentists!inner(name, city)`
  // join (PostgREST can't resolve the FK), so we hydrate a `dentists`
  // field on each row from `dentistById` before handing off to the
  // client. AdminPageClient renders `(a.dentists as any)?.name` for the
  // dentist column — leaving it null cleanly falls through to the `—`
  // placeholder.
  const appointmentsForClient = (appointments || []).map((a: any) => ({
    ...a,
    dentists: a.dentist_id ? dentistById.get(a.dentist_id) ?? null : null,
  }))

  return (
    <AdminPageClient
      stats={stats}
      dentists={dentists || []}
      registrations={registrations || []}
      appointments={appointmentsForClient}
      enquiries={enquiries || []}
      reviews={reviews || []}
      areas={areas || []}
      foundingConfig={foundingConfig}
      analytics={analytics}
      cityFilter={cityFilter}
      commsDentists={commsDentists || []}
      dentistHealth={dentistHealth}
      pendingCases={pendingCases || []}
      openReports={openReports || []}
    />
  )
}
