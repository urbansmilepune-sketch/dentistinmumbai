import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'
import CitiesGrid from './CitiesGrid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'All Cities | Dentist In India',
  description: 'Find verified dentists across 13 live Indian cities, with 50 more launching soon. Browse the full network by state.',
}

// /cities lists every city the network knows about, live or coming soon,
// grouped by Indian state/UT. Live cities link out to their city domain.
// Coming-soon cities open the NotifyMeModal which writes to city_waitlist.
//
// Server component — fetches per-city dentist counts once (service role,
// to bypass the analytics_events RLS pattern) and hands a slim, grouped
// payload to the client grid that owns the modal state.

interface UnifiedCity {
  slug: string
  name: string
  state: string
  status: 'live' | 'soon'
  domain?: string
  dentistCount?: number
}

export default async function CitiesPage() {
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: dentSlim } = await adminClient
    .from('dentists')
    .select('city, is_active')

  const dentistCountByCity: { [slug: string]: number } = {}
  for (const d of (dentSlim || []) as Array<{ city: string | null; is_active: boolean | null }>) {
    if (!d.city || !d.is_active) continue
    dentistCountByCity[d.city] = (dentistCountByCity[d.city] || 0) + 1
  }

  // Flatten both lists into one shape so the grid doesn't need to know
  // which slug bucket a city came from.
  const unified: UnifiedCity[] = [
    ...Object.values(CITY_CONFIGS).map(c => ({
      slug: c.citySlug,
      name: c.cityName,
      state: c.state,
      status: 'live' as const,
      domain: c.domain,
      dentistCount: dentistCountByCity[c.citySlug] ?? 0,
    })),
    ...COMING_SOON_CITIES.map(c => ({
      slug: c.slug,
      name: c.name,
      state: c.state,
      status: 'soon' as const,
    })),
  ]

  // Group by state. Live cities sort first inside each state so the green
  // badges read top-to-bottom on the page.
  const byState = new Map<string, UnifiedCity[]>()
  for (const c of unified) {
    const arr = byState.get(c.state) || []
    arr.push(c)
    byState.set(c.state, arr)
  }
  for (const arr of byState.values()) {
    arr.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'live' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
  // States sorted: states with ≥1 live city first (descending live count),
  // then everything else alphabetically. Reads as "where we already are"
  // → "where we're heading."
  const stateBlocks = Array.from(byState.entries()).map(([state, cities]) => ({
    state,
    cities,
    liveCount: cities.filter(c => c.status === 'live').length,
  }))
  stateBlocks.sort((a, b) => {
    if ((a.liveCount > 0) !== (b.liveCount > 0)) return a.liveCount > 0 ? -1 : 1
    if (a.liveCount !== b.liveCount) return b.liveCount - a.liveCount
    return a.state.localeCompare(b.state)
  })

  const liveTotal = Object.keys(CITY_CONFIGS).length
  const soonTotal = COMING_SOON_CITIES.length

  return (
    <div style={{ background: '#fff', color: '#0F1923', fontFamily: 'var(--font-body)', minHeight: '100vh' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: '#0F1923', textDecoration: 'none' }}>
            Dentist<span style={{ color: '#1D4ED8' }}>InIndia</span>.in
          </Link>
          <Link href="/for-dentists" style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            List your clinic
          </Link>
        </div>
      </nav>

      <header style={{ padding: '48px 20px 24px', textAlign: 'center', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40, lineHeight: 1.15, color: '#0F1923', marginBottom: 12 }}>
            Every city. One network.
          </h1>
          <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.55 }}>
            <strong style={{ color: '#0F1923' }}>{liveTotal}</strong> cities are live today and <strong style={{ color: '#0F1923' }}>{soonTotal}</strong> more are launching soon. Pick yours below — or get notified the moment we go live.
          </p>
        </div>
      </header>

      <CitiesGrid stateBlocks={stateBlocks} />
    </div>
  )
}
