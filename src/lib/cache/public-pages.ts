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
      supabase
        .from('reviews')
        .select('id, patient_name, rating, review_text, treatment, created_at')
        .eq('dentist_id', (dentist as any).id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),
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
  areaDentistCount: Record<string, number>
}

export function getCityHomeStats(citySlug: string): Promise<CityHomeStats> {
  return unstable_cache(
    async (): Promise<CityHomeStats> => {
      const supabase = createAnonClient()
      const [{ data: links }, { data: dents }] = await Promise.all([
        // One row per (dentist, treatment) link, filtered to active dentists in
        // this city via the embedded !inner join. Aggregated in JS — the link
        // set per city is small (hundreds of rows).
        supabase
          .from('dentist_treatments')
          .select('treatment_id, dentist_id, fee_from, dentists!inner(city, is_active)')
          .eq('dentists.city', citySlug)
          .eq('dentists.is_active', true),
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
      for (const row of (links ?? []) as any[]) {
        const tid = row.treatment_id as string | null
        const did = row.dentist_id as string | null
        if (!tid || !did) continue
        ;(treatmentDentists[tid] ??= new Set<string>()).add(did)
        const fee = typeof row.fee_from === 'number' ? row.fee_from : null
        if (fee !== null && fee > 0) {
          treatmentMinFee[tid] = treatmentMinFee[tid] === undefined ? fee : Math.min(treatmentMinFee[tid], fee)
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

      return { treatmentDentistCount, treatmentMinFee, areaDentistCount }
    },
    ['city-home-stats', citySlug],
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
// offer that treatment AND have a fee set for it (fee_from or fee_to > 0),
// keyed by `${areaId}:${treatmentId}`. Density gate for /area/[slug]/[treatment]:
//   <3 → notFound() + drop from sitemap; ≥3 → index + sitemap.
export function getAreaTreatmentCompleteCounts(citySlug: string): Promise<Record<string, number>> {
  return unstable_cache(
    async (): Promise<Record<string, number>> => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from('dentist_treatments')
        .select(`treatment_id, fee_from, fee_to, dentists!inner(id, area_id, ${COMPLETION_SELECT})`)
        .eq('dentists.city', citySlug)
        .eq('dentists.is_active', true)
      // Dedup to DISTINCT dentists per (area, treatment): the same dentist can
      // have duplicate link rows, and count must match the "N dentists offer
      // this" the page shows.
      const sets: Record<string, Set<string>> = {}
      for (const row of (data ?? []) as any[]) {
        const d = Array.isArray(row.dentists) ? row.dentists[0] : row.dentists
        if (!d || d.area_id === null || d.area_id === undefined) continue
        const feeSet =
          (typeof row.fee_from === 'number' && row.fee_from > 0) ||
          (typeof row.fee_to === 'number' && row.fee_to > 0)
        if (!feeSet) continue
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
    const { data } = await supabase
      .from('areas')
      .select('id, name, slug, dentist_count')
      .eq('city', citySlug)
      .order('dentist_count', { ascending: false })
    return (data ?? []) as unknown as CityAreaLink[]
  },
  ['city-areas'],
  { revalidate: 300, tags: ['areas'] },
)
