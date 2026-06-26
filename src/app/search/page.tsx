import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityAreaDentistCounts } from '@/lib/cache/public-pages'
import { getCityBySlug } from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import ResultFilters from '@/components/ResultFilters'
import DentistResultCard from '@/components/DentistResultCard'
import { isOpenNowFromHours } from '@/lib/time'
import { haversineKm } from '@/lib/distance'
import { normalizeSearchQuery, nameMatchesQuery } from '@/lib/searchNormalize'
import { dentistCountLabel } from '@/lib/dentistCount'
import { NAVY, NAVY_SOFT, TEAL } from '@/app/dentist/[slug]/profileTheme'

// headers()-based city resolution forces dynamic rendering, same as the area
// and treatment pages.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }): Promise<Metadata> {
  const sp = await searchParams
  const q = (sp.q || '').trim()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  return {
    title: q ? `Search “${q}” — Dentists in ${city.cityName}` : `Search Dentists in ${city.cityName}`,
    // Arbitrary query strings make thin, near-duplicate pages — keep them out
    // of the index but let crawlers follow through to the real listings.
    robots: { index: false, follow: true },
  }
}

// GPS coords are user-supplied query params; validate before trusting them.
function parseCoord(v: string | undefined, range: number): number | null {
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (Math.abs(n) > range) return null
  return n
}

const SORT_LABELS: Record<string, string> = {
  nearest: 'nearest first',
  rating: 'top rated',
  fee: 'lowest fee first',
  best: 'best match',
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const q = (sp.q || '').trim()

  const ratingFilter = sp.rating || ''
  const openNowFilter = sp.open === 'true'
  const genderFilter = sp.gender || ''
  const verifiedFilter = sp.verified === 'true'
  const emiFilter = sp.emi === 'true'
  const sortBy = sp.sort || ''
  const userLat = parseCoord(sp.lat, 90)
  const userLng = parseCoord(sp.lng, 180)
  const hasCoords = userLat !== null && userLng !== null

  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const citySlug = city.citySlug

  // Normalize the raw query: lowercase, strip filler words + "in <city>", expand
  // synonyms (rct→root canal, scaling→teeth cleaning, caps→crowns…). This is what
  // makes "root canal treatment", "rct", "teeth cleaning near me", "implant cost"
  // resolve to the right treatment instead of failing literal matching.
  const nq = q ? normalizeSearchQuery(q, city.cityName) : ''
  // Re-strip PostgREST metacharacters after normalization for the dentist .or().
  const safeNq = nq.replace(/[%,()]/g, ' ').trim()

  // Pull the full area + treatment menus once (small sets) for both name
  // matching and the browse fallback, plus live per-area dentist counts so we
  // never show "0 dentists" on the matched-area cards.
  const [{ data: allAreasRaw }, { data: allTreatmentsRaw }, areaCounts] = await Promise.all([
    supabase.from('areas').select('id, name, slug, dentist_count').eq('city', citySlug).order('dentist_count', { ascending: false }),
    supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
    getCityAreaDentistCounts(citySlug),
  ])
  const allAreas = (allAreasRaw || []) as any[]
  const allTreatments = (allTreatmentsRaw || []) as any[]
  const areaCountOf = (id: number | string) => areaCounts[String(id)] ?? 0

  // Browse fallbacks for the empty state — areas with the most dentists first,
  // and the treatment menu.
  const browseAreas = [...allAreas].sort((a, b) => areaCountOf(b.id) - areaCountOf(a.id)).slice(0, 8)
  const browseTreatments = allTreatments.slice(0, 8)

  // Match areas + treatments by normalized name (JS contains, both directions),
  // and dentists by name OR clinic_name. Only run when the query is usable.
  let matchedAreas: any[] = []
  let matchedTreatments: any[] = []
  let list: any[] = []

  if (nq) {
    matchedTreatments = allTreatments.filter(t => nameMatchesQuery(t.name, nq)).slice(0, 6)
    matchedAreas = allAreas
      .filter(a => nameMatchesQuery(a.name, nq))
      .sort((a, b) => areaCountOf(b.id) - areaCountOf(a.id))
      .slice(0, 6)

    // Dentist query mirrors the area page: same select, same server-side
    // attribute filters, same sort, so the shared ResultFilters bar drives it.
    // Uses the normalized query so "doctor mehta" → "mehta", etc.
    let dentistQuery = supabase
      .from('dentists')
      .select(`
        id, slug, name, clinic_name, qualifications, experience_years,
        gender, consultation_fee, emi_available, is_verified, tier,
        profile_photo, whatsapp, phone, working_hours, lat, lng,
        avg_rating, review_count,
        areas(name, slug),
        dentist_treatments(treatments(name, slug))
      `)
      .eq('is_active', true)
      .eq('city', citySlug)
      .or(`name.ilike.%${safeNq}%,clinic_name.ilike.%${safeNq}%`)

    if (genderFilter) dentistQuery = dentistQuery.eq('gender', genderFilter)
    if (verifiedFilter) dentistQuery = dentistQuery.eq('is_verified', true)
    if (emiFilter) dentistQuery = dentistQuery.eq('emi_available', true)
    if (ratingFilter) {
      const minRating = parseFloat(ratingFilter)
      if (Number.isFinite(minRating)) dentistQuery = dentistQuery.gte('avg_rating', minRating)
    }

    if (!hasCoords) {
      if (sortBy === 'rating') dentistQuery = dentistQuery.order('avg_rating', { ascending: false, nullsFirst: false })
      else if (sortBy === 'fee') dentistQuery = dentistQuery.order('consultation_fee', { ascending: true, nullsFirst: false })
      else dentistQuery = dentistQuery.order('rank_score', { ascending: false })
    } else {
      dentistQuery = dentistQuery.order('rank_score', { ascending: false })
    }
    dentistQuery = dentistQuery.limit(50)

    const { data: dentistsRaw } = await dentistQuery
    list = (dentistsRaw || []) as any[]

    // Distance enrichment + sort when coords are present (closest first;
    // coordless dentists sink to the bottom).
    if (hasCoords) {
      const lat = userLat as number
      const lng = userLng as number
      list = list
        .map(d => {
          const dl = typeof d.lat === 'number' ? d.lat : null
          const dg = typeof d.lng === 'number' ? d.lng : null
          const distance_km = dl !== null && dg !== null ? haversineKm(lat, lng, dl, dg) : null
          return { ...d, distance_km }
        })
        .sort((a, b) => {
          const ad = a.distance_km as number | null
          const bd = b.distance_km as number | null
          if (ad === null && bd === null) return 0
          if (ad === null) return 1
          if (bd === null) return -1
          return ad - bd
        })
    }
  }

  // Open-now is a JS-side filter (working_hours is JSONB keyed by day, judged
  // against IST clock time).
  const dentistList = openNowFilter ? list.filter(d => isOpenNowFromHours(d.working_hours)) : list

  const firstHighlight: 'closest' | 'best' | null = hasCoords
    ? (dentistList[0]?.distance_km != null ? 'closest' : null)
    : (!sortBy ? 'best' : null)

  const sortLabel = hasCoords ? SORT_LABELS.nearest : SORT_LABELS[sortBy] || SORT_LABELS.best
  const totalHits = matchedAreas.length + matchedTreatments.length + dentistList.length
  const hasAnything = totalHits > 0

  return (
    <>
      <SiteHeader city={city} initialQuery={q} />

      {/* HERO — navy, matches the area/treatment pages */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '28px 20px 36px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{city.cityName}</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Search</span>
          </nav>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', color: '#fff', marginBottom: 8, lineHeight: 1.2 }}>
            {q ? `Results for “${q}”` : 'Search'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15 }}>
            {q
              ? (hasAnything
                  ? `${dentistList.length} dentist${dentistList.length === 1 ? '' : 's'} · sorted by ${sortLabel}`
                  : `No matches in ${city.cityName}`)
              : `Find dentists, treatments, and areas in ${city.cityName}`}
          </p>
        </div>
      </section>

      <main style={{ background: 'var(--bg)', padding: '24px 20px', minHeight: '50vh' }}>
        <div className="container" style={{ maxWidth: 820 }}>

          {/* Area / treatment "jump to" cards */}
          {(matchedAreas.length > 0 || matchedTreatments.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {matchedAreas.map(a => (
                <Link key={`a-${a.id}`} href={`/area/${a.slug}`} style={jumpCardStyle}>
                  <span style={{ fontSize: 22 }}>📍</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: NAVY }}>Dentists in {a.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{dentistCountLabel(areaCountOf(a.id))} in this area</span>
                  </span>
                  <span style={{ color: TEAL, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>See all →</span>
                </Link>
              ))}
              {matchedTreatments.map(t => (
                <Link key={`t-${t.id}`} href={`/treatment/${t.slug}`} style={jumpCardStyle}>
                  <span style={{ fontSize: 22 }}>{t.icon || '🦷'}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: NAVY }}>{t.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>See dentists offering {t.name.toLowerCase()}</span>
                  </span>
                  <span style={{ color: TEAL, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>See all →</span>
                </Link>
              ))}
            </div>
          )}

          {/* Dentist results */}
          {dentistList.length > 0 && (
            <>
              <ResultFilters basePath="/search" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
                {dentistList.map((d, i) => (
                  <DentistResultCard key={d.id} dentist={d} highlight={i === 0 ? firstHighlight : null} />
                ))}
              </div>
            </>
          )}

          {/* Empty / no-query state */}
          {!hasAnything && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '32px 24px' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
                {q ? `No results for “${q}” in ${city.cityName}` : `Browse dentists in ${city.cityName}`}
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 22 }}>
                {q ? 'Try browsing by area or treatment:' : 'Pick an area or a treatment to get started:'}
              </p>

              {(browseAreas?.length ?? 0) > 0 && (
                <>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 10 }}>Popular areas</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
                    {(browseAreas || []).map(a => (
                      <Link key={a.id} href={`/area/${a.slug}`} style={chipStyle}>📍 {a.name}</Link>
                    ))}
                  </div>
                </>
              )}

              {(browseTreatments?.length ?? 0) > 0 && (
                <>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 10 }}>Popular treatments</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {(browseTreatments || []).map(t => (
                      <Link key={t.id} href={`/treatment/${t.slug}`} style={chipStyle}>{t.icon || '🦷'} {t.name}</Link>
                    ))}
                  </div>
                </>
              )}

              <div style={{ marginTop: 16 }}>
                <Link href="/dentists" className="btn btn-primary">Browse all {city.cityName} dentists</Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* FOOTER — mirrors the area page footer */}
      <footer style={{ background: '#0A1628', padding: '40px 20px 24px', color: 'rgba(255,255,255,0.6)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#fff', fontSize: 15 }}>{city.domain}</Link>
            <div style={{ display: 'flex', gap: 20 }}>
              <Link href="/dentists" style={{ fontSize: 13 }}>Find Dentists</Link>
              <Link href="/for-dentists" style={{ fontSize: 13 }}>For Dentists</Link>
              <Link href="/about" style={{ fontSize: 13 }}>About</Link>
            </div>
            <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain}</p>
          </div>
        </div>
      </footer>
    </>
  )
}

const jumpCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16,
  padding: '16px 18px', textDecoration: 'none',
}

const chipStyle: React.CSSProperties = {
  padding: '8px 16px', background: '#F0FDFA', color: TEAL,
  border: '1px solid #99F6E4', borderRadius: 20, fontSize: 13, fontWeight: 600,
  textDecoration: 'none',
}
