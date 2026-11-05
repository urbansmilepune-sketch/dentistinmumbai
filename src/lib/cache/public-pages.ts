import { unstable_cache } from 'next/cache'
import { createAnonClient } from '@/lib/supabase/anon'
import { completionPct } from '@/lib/profileCompletion'

// Cached data fetchers for the two public-facing pages that don't need
// live data: the city homepage and the dentist profile. The route shells
// themselves stay dynamic (proxy.ts → headers() → getCityBySlug), but the
// heavy Supabase round-trips are served from the Next.js Data Cache and
// only re-hit Supabase after `revalidate` elapses.
//
// Cache keys: getCityHomeData puts citySlug in the keyParts array
// explicitly (see below) rather than trusting unstable_cache's deprecated
// implicit arg-hashing. getDentistProfileData still relies on arg-hashing
// for `slug`. Either way: one entry per city, one per dentist.
//
// Return types are spelled out explicitly because the project has no
// generated Supabase schema, so untyped .select() falls back to `never`
// and TS infers `never[]` for `?? []` — which would surface as
// "Property 'x' does not exist on type 'never'" at every consumer site.

export type CityArea = {
  id: number | string
  name: string
  slug: string
  zone: string | null
  dentist_count: number
}

export type CityTreatment = {
  id: number | string
  name: string
  slug: string
  icon: string | null
}

export type FeaturedDentist = {
  id: string
  name: string
  slug: string
  clinic_name: string | null
  area_id: number | string | null
  consultation_fee: number | null
  // The page renders `${d.experience_years} yrs exp` directly, so the
  // value is treated as definitely-numeric. Existing rows have a default
  // of 0 in the column.
  experience_years: number
  tier: string | null
  is_verified: boolean | null
  profile_photo: string | null
  areas: { name: string } | null
}

export type CityHomeData = {
  areas: CityArea[]
  treatments: CityTreatment[]
  premiumCount: number
  dentistCount: number
  allActiveDentists: FeaturedDentist[]
  curatedDentists: FeaturedDentist[]
}

export type DentistProfileReview = {
  id: string
  patient_name: string | null
  rating: number
  review_text: string | null
  treatment: string | null
  created_at: string
  tags?: string[] | null
  verified_visit?: boolean | null
  dentist_reply?: string | null
}

export type DentistProfileLocation = {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  working_hours: any
  is_primary: boolean | null
  areas: { name: string } | null
}

export type SimilarDentist = {
  id: string
  name: string
  slug: string
  clinic_name: string | null
  consultation_fee: number | null
  profile_photo: string | null
  specialties: string[] | null
  qualifications: string | null
  areas: { name: string } | null
}

export type DentistProfileData = {
  // The page mixes free-form joined fields (dentist_treatments, gallery_photos,
  // working_hours JSON) — a fully typed shape here would just churn whenever
  // the page adds another join. `any` keeps the page free to read whatever
  // it needs without forcing a parallel type definition.
  dentist: any
  approvedReviews: DentistProfileReview[]
  locations: DentistProfileLocation[]
  similarDentists: SimilarDentist[]
}

const DENTIST_LIST_SELECT =
  'id, name, slug, clinic_name, area_id, consultation_fee, experience_years, tier, is_verified, profile_photo, areas(name)'

export const PREMIUM_FLOOR = 50

// Wrapped in a factory so citySlug is in scope for the keyParts array.
// `['city-home-data', citySlug]` makes the per-city cache partition
// explicit — belt-and-suspenders against unstable_cache's implicit
// arg-hashing (deprecated in Next 16). One Data Cache entry per city.
export function getCityHomeData(citySlug: string): Promise<CityHomeData> {
  return unstable_cache(
    async (): Promise<CityHomeData> => {
      const supabase = createAnonClient()
      const [
        { data: areas },
        { data: treatments },
        { count: premiumCount },
        { count: dentistCount },
        { data: allActiveDentists },
        { data: curatedDentists },
      ] = await Promise.all([
        supabase
          .from('areas')
          .select('id, name, slug, zone, dentist_count')
          .eq('city', citySlug)
          .order('dentist_count', { ascending: false }),
        supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
        supabase
          .from('dentists')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('city', citySlug)
          .in('tier', ['gold', 'featured']),
        supabase
          .from('dentists')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('city', citySlug),
        supabase
          .from('dentists')
          .select(DENTIST_LIST_SELECT)
          .eq('is_active', true)
          .eq('city', citySlug)
          .order('rank_score', { ascending: false })
          .limit(6),
        supabase
          .from('dentists')
          .select(DENTIST_LIST_SELECT)
          .eq('is_active', true)
          .eq('is_verified', true)
          .eq('city', citySlug)
          .in('tier', ['featured', 'gold', 'silver'])
          .order('rank_score', { ascending: false })
          .limit(6),
      ])

      return {
        areas: (areas ?? []) as CityArea[],
        treatments: (treatments ?? []) as CityTreatment[],
        premiumCount: premiumCount ?? 0,
        dentistCount: dentistCount ?? 0,
        allActiveDentists: (allActiveDentists ?? []) as unknown as FeaturedDentist[],
        curatedDentists: (curatedDentists ?? []) as unknown as FeaturedDentist[],
      }
    },
    ['city-home-data', citySlug],
    { revalidate: 300, tags: ['city-home', 'dentists', 'areas', 'treatments'] },
  )()
}

// Approved reviews for a profile. Tries the v1 review columns (tags,
// verified visit, dentist reply) and falls back to the original columns if
// the 20261104170000_review_requests.sql migration hasn't been run yet.
async function fetchApprovedReviews(supabase: ReturnType<typeof createAnonClient>, dentistId: string) {
  const base = 'id, patient_name, rating, review_text, treatment, created_at'
  const full = await supabase
    .from('reviews')
    .select(`${base}, tags, verified_visit, dentist_reply`)
    .eq('dentist_id', dentistId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (!full.error) return full
  return supabase
    .from('reviews')
    .select(base)
    .eq('dentist_id', dentistId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
}

export const getDentistProfileData = unstable_cache(
  async (slug: string): Promise<DentistProfileData | null> => {
    const supabase = createAnonClient()
    const { data: dentist } = await supabase
      .from('dentists')
      .select(
        '*, areas(name, slug), dentist_treatments(fee_from, fee_to, treatments(id, name, slug, icon)), gallery_photos(id, url, caption, category)',
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (!dentist) return null

    // Reviews + locations + similar dentists share the same cache TTL as the
    // dentist row; all are public and change at roughly the same cadence as
    // the profile. Similar dentists are 3 other active dentists in the same
    // city, ranked by rank_score — surfaced in the "More Dentists in {area}"
    // section at the bottom of the profile.
    const [{ data: approvedReviews }, { data: locations }, { data: similarDentists }] = await Promise.all([
      fetchApprovedReviews(supabase, (dentist as any).id),
      supabase
        .from('clinic_locations')
        .select('id, name:clinic_name, address, phone, working_hours, is_primary, areas(name)')
        .eq('dentist_id', (dentist as any).id)
        .order('is_primary', { ascending: false })
        .order('created_at'),
      supabase
        .from('dentists')
        .select('id, name, slug, clinic_name, consultation_fee, profile_photo, specialties, qualifications, areas(name)')
        .eq('is_active', true)
        .eq('city', (dentist as any).city)
        .neq('slug', slug)
        .order('rank_score', { ascending: false })
        .limit(3),
    ])

    return {
      dentist,
      approvedReviews: (approvedReviews ?? []) as unknown as DentistProfileReview[],
      locations: (locations ?? []) as unknown as DentistProfileLocation[],
      similarDentists: (similarDentists ?? []) as unknown as SimilarDentist[],
    }
  },
  ['dentist-profile-data'],
  { revalidate: 60, tags: ['dentist-profile'] },
)

// Resolve a stale/legacy dentist slug to the dentist's CURRENT slug via the
// previous_slugs array. Powers the permanent-redirect safety net on the
// profile route: an old crawled/indexed URL that no longer resolves (name
// changed, clinic renamed) is 308'd to the live profile instead of 404-ing
// and mass-manufacturing dead URLs in GSC. Returns null when no active
// dentist claims the slug — that's a genuine 404.
//
// Deliberately NOT wrapped in unstable_cache. It runs ONLY on the profile 404
// path (after getDentistProfileData has already missed), so it's rare and its
// latency is irrelevant — but caching here was actively harmful. When the
// previous_slugs column/backfill was still being applied out-of-band via the
// Supabase SQL editor, any crawl that hit a dead slug ran this query, got an
// error (swallowed → null), and pinned that null in the Data Cache for its
// TTL. Because an out-of-band SQL backfill can't fire revalidateTag(), nothing
// evicted the stale null, so the 308 never fired in production even after the
// data was correct. A direct GIN-backed containment lookup is cheap and always
// current. Errors are now logged, never cached as a false null.
export async function resolveCurrentSlug(oldSlug: string): Promise<string | null> {
  const supabase = createAnonClient()
  const { data, error } = await supabase
    .from('dentists')
    .select('slug')
    .contains('previous_slugs', [oldSlug])
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.error('[resolveCurrentSlug] lookup failed', { oldSlug, message: error.message })
    return null
  }
  return (data as { slug?: string } | null)?.slug ?? null
}

// Live per-city aggregates the denormalized columns don't reliably carry:
//   - treatmentDentistCount: how many active dentists in this city offer each
//     treatment (keyed by treatment id). Drives the homepage intent tiles.
//   - treatmentMinFee: lowest non-null fee_from per treatment (keyed by
//     treatment id). Drives the "from ₹X" label — absent until dentists fill
//     fees in, so most stay undefined.
//   - areaDentistCount: active dentists per area (keyed by stringified area
//     id). Computed live because areas.dentist_count is currently unmaintained
//     (0 across the board). Drives the homepage "Browse by area" counts.
export type CityHomeStats = {
  treatmentDentistCount: Record<string, number>
  treatmentMinFee: Record<string, number>
  // Every positive fee_from per treatment (keyed by treatment id). Lets the
  // homepage price list drop implausible entries (e.g. a consult fee typed
  // into Braces) before picking the "from" price. See plausibleFromFee().
  treatmentFees: Record<string, number[]>
  areaDentistCount: Record<string, number>
}

export function getCityHomeStats(citySlug: string): Promise<CityHomeStats> {
  return unstable_cache(
    async (): Promise<CityHomeStats> => {
      const supabase = createAnonClient()
      // One row per (dentist, treatment) link, filtered to active dentists in
      // this city via the embedded !inner join. MUST paginate: PostgREST caps
      // a read at 1000 rows with no error, and Pune has 1300+ links, so the
      // homepage tiles showed ~110 dentists per treatment instead of ~186.
      async function readAllLinks() {
        const PAGE = 1000
        const rows: any[] = []
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('dentist_treatments')
            .select('treatment_id, dentist_id, fee_from, dentists!inner(city, is_active)')
            .eq('dentists.city', citySlug)
            .eq('dentists.is_active', true)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) throw error
          const page = data ?? []
          rows.push(...page)
          if (page.length < PAGE) break
        }
        return { data: rows }
      }
      const [{ data: links }, { data: dents }] = await Promise.all([
        readAllLinks(),
        supabase
          .from('dentists')
          .select('area_id')
          .eq('is_active', true)
          .eq('city', citySlug),
      ])

      // Count DISTINCT dentists per treatment (not raw link rows) so this number
      // is identical to what the /treatment/[slug] page shows ("N dentists offer
      // this" = distinct active dentists with the link). Dedup also makes it
      // immune to any duplicate dentist_treatments rows.
      const treatmentDentists: Record<string, Set<string>> = {}
      const treatmentMinFee: Record<string, number> = {}
      const treatmentFees: Record<string, number[]> = {}
      for (const row of (links ?? []) as any[]) {
        const tid = row.treatment_id as string | null
        const did = row.dentist_id as string | null
        if (!tid || !did) continue
        ;(treatmentDentists[tid] ??= new Set<string>()).add(did)
        const fee = typeof row.fee_from === 'number' ? row.fee_from : null
        if (fee !== null && fee > 0) {
          treatmentMinFee[tid] = treatmentMinFee[tid] === undefined ? fee : Math.min(treatmentMinFee[tid], fee)
          ;(treatmentFees[tid] ??= []).push(fee)
        }
      }
      const treatmentDentistCount: Record<string, number> = {}
      for (const [tid, set] of Object.entries(treatmentDentists)) treatmentDentistCount[tid] = set.size

      const areaDentistCount: Record<string, number> = {}
      for (const row of (dents ?? []) as any[]) {
        const aid = row.area_id
        if (aid === null || aid === undefined) continue
        const key = String(aid)
        areaDentistCount[key] = (areaDentistCount[key] ?? 0) + 1
      }

      return { treatmentDentistCount, treatmentMinFee, treatmentFees, areaDentistCount }
    },
    // v2: shape gained treatmentFees — new key so no stale v1 entry is served.
    ['city-home-stats-v2', citySlug],
    { revalidate: 300, tags: ['city-home', 'dentists', 'areas', 'treatments'] },
  )()
}

// Live active-dentist count per area (keyed by stringified area id) for one
// city. Computed from the dentists table because areas.dentist_count is
// unmaintained (0 across the board). Used by the area page's "Nearby Areas"
// widget and the search page to avoid ever showing "0 dentists" to patients.
export function getCityAreaDentistCounts(citySlug: string): Promise<Record<string, number>> {
  return unstable_cache(
    async (): Promise<Record<string, number>> => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from('dentists')
        .select('area_id')
        .eq('is_active', true)
        .eq('city', citySlug)
      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as any[]) {
        const aid = row.area_id
        if (aid === null || aid === undefined) continue
        const key = String(aid)
        counts[key] = (counts[key] ?? 0) + 1
      }
      return counts
    },
    ['city-area-dentist-counts', citySlug],
    { revalidate: 300, tags: ['city-home', 'dentists', 'areas'] },
  )()
}

// ── Density gate (Week 1 index hygiene, Section 3) ──────────────────────────
// A "complete profile" for indexing purposes is 80%+ on the five-field
// completion score (profile_photo, cover_photo, bio≥50, whatsapp, maps_embed)
// — the same score the dentist sees. The two helpers below drive both the
// density gate on the area / area×treatment routes AND the sitemap emission
// (Section 1), so the "should this page exist / be indexed?" decision is made
// in exactly one place and can never drift between route and sitemap.
const COMPLETE_PROFILE_THRESHOLD = 80

// The five completion fields, fetched together so completionPct can be scored
// per dentist server-side. Kept local to this module.
const COMPLETION_SELECT = 'profile_photo, cover_photo, bio, whatsapp, maps_embed'

function isCompleteProfile(row: {
  profile_photo?: string | null
  cover_photo?: string | null
  bio?: string | null
  whatsapp?: string | null
  maps_embed?: string | null
}): boolean {
  return completionPct({
    profile_photo: row.profile_photo,
    cover_photo: row.cover_photo,
    bio: row.bio,
    whatsapp: row.whatsapp,
    maps_embed: row.maps_embed,
  }) >= COMPLETE_PROFILE_THRESHOLD
}

// Count of COMPLETE-profile active dentists per area (keyed by stringified
// area id) for one city. Density gate for /area/[slug]:
//   0 → notFound() + drop from sitemap; 1–2 → noindex + drop from sitemap;
//   ≥3 → index + sitemap.
export function getAreaCompleteDentistCounts(citySlug: string): Promise<Record<string, number>> {
  return unstable_cache(
    async (): Promise<Record<string, number>> => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from('dentists')
        .select(`area_id, ${COMPLETION_SELECT}`)
        .eq('is_active', true)
        .eq('city', citySlug)
      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as any[]) {
        if (row.area_id === null || row.area_id === undefined) continue
        if (!isCompleteProfile(row)) continue
        const key = String(row.area_id)
        counts[key] = (counts[key] ?? 0) + 1
      }
      return counts
    },
    ['area-complete-dentist-counts', citySlug],
    { revalidate: 300, tags: ['dentists', 'areas'] },
  )()
}

// Count of DISTINCT complete-profile active dentists per (area, treatment) who
// OFFER that treatment, keyed by `${areaId}:${treatmentId}`. Density gate for
// /area/[slug]/[treatment]:
//   <3 → notFound() + drop from sitemap; ≥3 → index + sitemap.
//
// Deliberately does NOT require a fee on the link row. It used to, which gated
// page existence on optional fee data and 404'd pages with plenty of real
// supply — e.g. Wakad teeth-whitening had 16 complete-profile dentists offering
// it but only 1 with a fee, so the page didn't exist. A fee enriches the page
// (fee tile, Quick Facts row, lowest-fee sort, all null-guarded) but is not
// what makes it worth indexing.
export function getAreaTreatmentCompleteCounts(citySlug: string): Promise<Record<string, number>> {
  return unstable_cache(
    async (): Promise<Record<string, number>> => {
      const supabase = createAnonClient()
      // MUST paginate. PostgREST enforces a server-side max-rows of 1000 and
      // truncates SILENTLY — no error, no flag. Pune already has 1330 link rows
      // for active dentists, so an unpaginated read dropped ~25% of them and
      // undercounted the gate, 404ing pages that had the supply. Worse, without
      // an ORDER BY the truncated window was nondeterministic, so pages could
      // appear and vanish between 5-minute revalidations. Order by the primary
      // key to make paging stable.
      const PAGE = 1000
      const rows: any[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('dentist_treatments')
          .select(`treatment_id, dentists!inner(id, area_id, ${COMPLETION_SELECT})`)
          .eq('dentists.city', citySlug)
          .eq('dentists.is_active', true)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        // Bail on error rather than returning partial counts — a half-read here
        // silently 404s live pages, which is worse than serving stale cache.
        if (error) throw error
        const page = data ?? []
        rows.push(...page)
        if (page.length < PAGE) break
      }
      // Dedup to DISTINCT dentists per (area, treatment): the same dentist can
      // have duplicate link rows, and count must match the "N dentists offer
      // this" the page shows.
      const sets: Record<string, Set<string>> = {}
      for (const row of rows) {
        const d = Array.isArray(row.dentists) ? row.dentists[0] : row.dentists
        if (!d || d.area_id === null || d.area_id === undefined) continue
        if (!isCompleteProfile(d)) continue
        const key = `${d.area_id}:${row.treatment_id}`
        ;(sets[key] ??= new Set<string>()).add(d.id)
      }
      const counts: Record<string, number> = {}
      for (const [key, set] of Object.entries(sets)) counts[key] = set.size
      return counts
    },
    ['area-treatment-complete-counts', citySlug],
    { revalidate: 300, tags: ['dentists', 'treatments'] },
  )()
}

export type CityAreaLink = {
  id: number | string
  name: string
  slug: string
  dentist_count: number
}

// Areas in one city, ranked by how many dentists each has. Powers the
// "Other areas in <City>" block at the bottom of the dentist profile (a
// patient on a Wakad dentist wants other Pune areas, not other cities).
// Cached per-city via unstable_cache's arg-hashing on `citySlug`, same as
// getDentistProfileData relies on for `slug`.
export const getCityAreas = unstable_cache(
  async (citySlug: string): Promise<CityAreaLink[]> => {
    const supabase = createAnonClient()
    // areas.dentist_count is unmaintained (0 across the board), so ordering by
    // it returned an effectively random list — and many of those areas have no
    // dentists, so every profile linked to empty /area pages that 404. That
    // was the biggest source of the GSC "Not found (404)" report. Count live
    // active dentists instead and only return areas that have at least one.
    const [{ data: areas }, { data: rows }] = await Promise.all([
      supabase.from('areas').select('id, name, slug').eq('city', citySlug),
      supabase.from('dentists').select('area_id').eq('is_active', true).eq('city', citySlug),
    ])
    const counts = new Map<string, number>()
    for (const r of (rows ?? []) as { area_id: string | number | null }[]) {
      if (r.area_id === null || r.area_id === undefined) continue
      const k = String(r.area_id)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return ((areas ?? []) as { id: string | number; name: string; slug: string }[])
      .map(a => ({ id: a.id, name: a.name, slug: a.slug, dentist_count: counts.get(String(a.id)) ?? 0 }))
      .filter(a => a.dentist_count > 0)
      .sort((a, b) => b.dentist_count - a.dentist_count)
  },
  ['city-areas-live'],
  { revalidate: 300, tags: ['areas', 'dentists'] },
)

// Homepage "Open now" row. A pool of active dentists in the city that have a
// photo and a consultation fee (so every card looks complete), ranked by
// rank_score. Open/closed is computed per request on the page, since it
// changes by the minute while this list only needs a 5-minute refresh.
export type HomeSpotlightDentist = {
  id: string
  slug: string
  name: string
  clinic_name: string | null
  qualifications: string | null
  experience_years: number
  gender: string | null
  consultation_fee: number
  is_verified: boolean
  profile_photo: string | null
  working_hours: any
  areas: { name: string; slug: string } | null
  avg_rating: number | null
  review_count: number | null
  dentist_treatments: { treatment_id: number | string }[] | null
}

export function getHomeSpotlightDentists(citySlug: string): Promise<HomeSpotlightDentist[]> {
  return unstable_cache(
    async (): Promise<HomeSpotlightDentist[]> => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('dentists')
        .select('id, slug, name, clinic_name, qualifications, experience_years, gender, consultation_fee, is_verified, profile_photo, working_hours, avg_rating, review_count, areas(name, slug), dentist_treatments(treatment_id)')
        .eq('is_active', true)
        .eq('city', citySlug)
        .not('profile_photo', 'is', null)
        .gt('consultation_fee', 0)
        .order('rank_score', { ascending: false })
        .limit(60)
      if (error) {
        console.error('[getHomeSpotlightDentists]', error.message)
        return []
      }
      return ((data ?? []) as unknown as HomeSpotlightDentist[]).filter(d => !!d.profile_photo && d.profile_photo.trim() !== '')
    },
    ['home-spotlight-v2', citySlug],
    { revalidate: 300, tags: ['city-home', 'dentists'] },
  )()
}

// Homepage "What patients say": approved reviews for dentists in this city.
// Returns the total count, the average, and the latest few with text, so the
// page can show real reviews once there are enough and an explainer before.
export interface HomeReview {
  id: string
  patient_name: string | null
  rating: number
  review_text: string | null
  treatment: string | null
  dentist: { name: string; slug: string }
}

export function getHomeReviews(citySlug: string): Promise<{ total: number; average: number | null; latest: HomeReview[] }> {
  return unstable_cache(
    async () => {
      const supabase = createAnonClient()
      type Row = { id: string | number; patient_name: string | null; rating: number | null; review_text: string | null; treatment: string | null; dentists: { name: string; slug: string } | null }
      const PAGE = 1000
      const rows: Row[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('reviews')
          .select('id, patient_name, rating, review_text, treatment, created_at, dentists!inner(name, slug, city, is_active)')
          .eq('status', 'approved')
          .eq('dentists.city', citySlug)
          .eq('dentists.is_active', true)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) {
          console.error('[getHomeReviews]', error.message)
          return { total: 0, average: null, latest: [] }
        }
        const page = (data ?? []) as unknown as Row[]
        rows.push(...page)
        if (page.length < PAGE) break
      }
      const rated = rows.filter((r): r is Row & { rating: number } => typeof r.rating === 'number' && r.rating > 0)
      const average = rated.length > 0 ? rated.reduce((sum, r) => sum + r.rating, 0) / rated.length : null
      const latest: HomeReview[] = rated
        .filter(r => (r.review_text ?? '').trim().length >= 20)
        .slice(0, 6)
        .map(r => ({
          id: String(r.id),
          patient_name: r.patient_name ?? null,
          rating: r.rating,
          review_text: r.review_text,
          treatment: r.treatment ?? null,
          dentist: { name: r.dentists?.name ?? '', slug: r.dentists?.slug ?? '' },
        }))
      return { total: rated.length, average, latest }
    },
    ['home-reviews', citySlug],
    { revalidate: 300, tags: ['city-home', 'reviews'] },
  )()
}
