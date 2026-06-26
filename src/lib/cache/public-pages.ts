import { unstable_cache } from 'next/cache'
import { createAnonClient } from '@/lib/supabase/anon'

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
