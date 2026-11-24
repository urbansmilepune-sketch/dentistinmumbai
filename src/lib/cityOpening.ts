import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { OPENING_MIN_DENTISTS, type CityConfig } from '@/config/cities'
import { getCityHomeData } from '@/lib/cache/public-pages'

// An opening city (CityConfig.opening) shows the "opening soon" homepage and
// stays out of search until it has OPENING_MIN_DENTISTS active dentists. The
// switch is automatic: the count comes from the cached city home data
// (5-minute TTL), so the full homepage appears within minutes of the fifth
// dentist being approved.
export async function getOpeningState(city: CityConfig): Promise<{ inOpeningPhase: boolean; dentistCount: number }> {
  if (!city.opening) return { inOpeningPhase: false, dentistCount: 0 }
  const { dentistCount } = await getCityHomeData(city.citySlug)
  return { inOpeningPhase: dentistCount < OPENING_MIN_DENTISTS, dentistCount }
}

// How many people asked to be told when the city opens. city_waitlist has
// RLS with no public policies, so this reads with the service role and only
// ever returns the count.
export function getCityWaitlistCount(citySlug: string): Promise<number> {
  return unstable_cache(
    async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) return 0
      const { count, error } = await createClient(url, key)
        .from('city_waitlist')
        .select('id', { count: 'exact', head: true })
        .eq('city_slug', citySlug)
      if (error) return 0
      return count ?? 0
    },
    ['city-waitlist-count', citySlug],
    { revalidate: 600 },
  )()
}
