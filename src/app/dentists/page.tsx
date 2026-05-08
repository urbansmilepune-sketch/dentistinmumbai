import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FilterSidebar from './FilterSidebar'
import DentistCard from './DentistCard'
import Pagination from './Pagination'
import SortSelect from './SortSelect'

export const revalidate = 60

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }): Promise<Metadata> {
  const params = await searchParams
  const area = params.area?.split(',')[0] || ''
  const treatment = params.treatment?.split(',')[0] || ''
  const title = [treatment, area, 'Dentists in Mumbai'].filter(Boolean).join(' · ')
  return {
    title,
    description: `Find verified dentists in Mumbai${area ? ` in ${area}` : ''}${treatment ? ` for ${treatment}` : ''}. Compare fees, read reviews, book appointments.`,
  }
}

const PER_PAGE = 6

export default async function DentistsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const supabase = await createClient()

  // Parse filters
  const areaFilter = params.area ? params.area.split(',') : []
  const treatmentFilter = params.treatment ? params.treatment.split(',') : []
  const ratingFilter = params.rating || ''
  const feeFilter = params.fee || ''
  const genderFilter = params.gender || ''
  const emiFilter = params.emi === 'true'
  const openNowFilter = params.open === 'true'
  const verifiedFilter = params.verified === 'true'
  const sortBy = params.sort || 'relevance'
  const page = Math.max(1, parseInt(params.page || '1'))

  // Fetch filter data
  const [{ data: allAreas }, { data: allTreatments }] = await Promise.all([
    supabase.from('areas').select('name, slug, dentist_count').order('dentist_count', { ascending: false }),
    supabase.from('treatments').select('name, slug').order('sort_order'),
  ])

  // Build dentist query
  let query = supabase
    .from('dentists')
    .select(`
      id, slug, name, clinic_name, qualifications, experience_years,
      gender, consultation_fee, emi_available, is_verified, tier,
      profile_photo_url, whatsapp, phone, working_hours,
      areas!inner(name, slug),
      dentist_treatments(treatments(name, slug))
    `, { count: 'exact' })
    .eq('is_active', true)

  // Area filter
  if (areaFilter.length > 0) {
    const { data: areaRows } = await supabase.from('areas').select('id').in('slug', areaFilter)
    const areaIds = areaRows?.map(a => a.id) || []
    if (areaIds.length > 0) query = query.in('area_id', areaIds)
  }

  // Treatment filter
  if (treatmentFilter.length > 0) {
    const { data: txRows } = await supabase.from('treatments').select('id').in('slug', treatmentFilter)
    const txIds = txRows?.map(t => t.id) || []
    if (txIds.length > 0) {
      const { data: dtRows } = await supabase.from('dentist_treatments').select('dentist_id').in('treatment_id', txIds)
      const dentistIds = [...new Set(dtRows?.map(d => d.dentist_id) || [])]
      if (dentistIds.length > 0) query = query.in('id', dentistIds)
      else query = query.in('id', ['00000000-0000-0000-0000-000000000000']) // no results
    }
  }

  // Gender filter
  if (genderFilter) query = query.eq('gender', genderFilter)

  // Verified filter
  if (verifiedFilter) query = query.eq('is_verified', true)

  // EMI filter
  if (emiFilter) query = query.eq('emi_available', true)

  // Fee filter
  if (feeFilter) {
    if (feeFilter === 'under200') query = query.lt('consultation_fee', 200)
    else if (feeFilter === '200-400') query = query.gte('consultation_fee', 200).lte('consultation_fee', 400)
    else if (feeFilter === '400-600') query = query.gte('consultation_fee', 400).lte('consultation_fee', 600)
    else if (feeFilter === 'above600') query = query.gt('consultation_fee', 600)
  }

  // Sort
  const tierOrder = { featured: 0, gold: 1, silver: 2, free: 3 }
  if (sortBy === 'fee_asc') query = query.order('consultation_fee', { ascending: true })
  else if (sortBy === 'fee_desc') query = query.order('consultation_fee', { ascending: false })
  else if (sortBy === 'experience') query = query.order('experience_years', { ascending: false })
  else query = query.order('tier').order('is_verified', { ascending: false }).order('created_at', { ascending: false })

  // Pagination
  const from = (page - 1) * PER_PAGE
  query = query.range(from, from + PER_PAGE - 1)

  const { data: dentists, count } = await query

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / PER_PAGE)
  const view = (params.view as 'list' | 'grid') || 'list'

  // Active area names for display
  const activeAreaNames = (allAreas || []).filter(a => areaFilter.includes(a.slug)).map(a => a.name)

  // Active filter chips
  const chips: { label: string; removeKey: string; removeVal?: string }[] = []
  areaFilter.forEach(a => {
    const name = allAreas?.find(x => x.slug === a)?.name || a
    chips.push({ label: `📍 ${name}`, removeKey: 'area', removeVal: a })
  })
  treatmentFilter.forEach(t => {
    const name = allTreatments?.find(x => x.slug === t)?.name || t
    chips.push({ label: `🦷 ${name}`, removeKey: 'treatment', removeVal: t })
  })
  if (ratingFilter) chips.push({ label: `★ ${ratingFilter}+`, removeKey: 'rating' })
  if (feeFilter) {
    const labels: Record<string, string> = { under200: '< ₹200', '200-400': '₹200–400', '400-600': '₹400–600', above600: '₹600+' }
    chips.push({ label: `💰 ${labels[feeFilter] || feeFilter}`, removeKey: 'fee' })
  }
  if (genderFilter) chips.push({ label: `👤 ${genderFilter}`, removeKey: 'gender' })
  if (verifiedFilter) chips.push({ label: '✓ Verified', removeKey: 'verified' })
  if (emiFilter) chips.push({ label: 'EMI', removeKey: 'emi' })
  if (openNowFilter) chips.push({ label: '● Open Now', removeKey: 'open' })

  function buildUrl(overrides: Record<string, string | null>) {
    const p = new URLSearchParams(params as Record<string, string>)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === null) p.delete(k)
      else p.set(k, v)
    })
    p.set('page', '1')
    return `/dentists?${p.toString()}`
  }

  function removeChip(chip: typeof chips[0]) {
    if (chip.removeVal) {
      const vals = chip.removeKey === 'area' ? areaFilter : treatmentFilter
      const next = vals.filter(v => v !== chip.removeVal)
      return buildUrl({ [chip.removeKey]: next.length ? next.join(',') : null })
    }
    return buildUrl({ [chip.removeKey]: null })
  }

  return (
    <>
      {/* NAV */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>DentistInMumbai<span style={{ color: 'var(--blue)' }}>.in</span></span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dentists" style={{ padding: '8px 16px', fontWeight: 600, fontSize: 14, color: 'var(--blue)' }}>Find Dentists</Link>
            <Link href="/for-dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>For Dentists</Link>
            <Link href="/for-dentists/register" className="btn btn-primary btn-sm">List Your Clinic</Link>
          </div>
        </nav>
      </header>

      <main style={{ background: 'var(--bg)', minHeight: '100vh', padding: '32px 20px' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

            {/* Sidebar */}
            <FilterSidebar
              areas={(allAreas || []).map(a => ({ name: a.name, slug: a.slug, dentist_count: a.dentist_count || 0 }))}
              treatments={(allTreatments || []).map(t => ({ name: t.name, slug: t.slug }))}
              activeFilters={{
                areas: areaFilter,
                treatments: treatmentFilter,
                rating: ratingFilter,
                fee: feeFilter,
                gender: genderFilter,
                emi: emiFilter,
                openNow: openNowFilter,
                verified: verifiedFilter,
              }}
            />

            {/* Results */}
            <div style={{ flex: 1, minWidth: 0 }}>

              {/* Top bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 2 }}>
                    {totalCount} Dentist{totalCount !== 1 ? 's' : ''} in Mumbai
                    {activeAreaNames.length > 0 && <span style={{ color: 'var(--blue)' }}> · {activeAreaNames.join(', ')}</span>}
                  </h1>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Page {page} of {totalPages || 1}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Sort */}
                  <SortSelect currentSort={sortBy} />

                  {/* View toggle */}
                  <div style={{ display: 'flex', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {(['list', 'grid'] as const).map(v => (
                      <Link key={v} href={buildUrl({ view: v })} style={{
                        padding: '8px 14px', fontSize: 16,
                        background: view === v ? 'var(--blue)' : 'transparent',
                        color: view === v ? '#fff' : 'var(--muted)',
                      }}>
                        {v === 'list' ? '☰' : '⊞'}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active filter chips */}
              {chips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                  {chips.map((chip, i) => (
                    <Link key={i} href={removeChip(chip)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 12px', background: 'var(--blue-light)', color: 'var(--blue-dark)',
                      border: '1px solid #BFDBFE', borderRadius: 20, fontSize: 13, fontWeight: 500,
                    }}>
                      {chip.label} <span style={{ fontSize: 14 }}>✕</span>
                    </Link>
                  ))}
                  <Link href="/dentists" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 12px', background: '#FEE2E2', color: '#991B1B',
                    border: '1px solid #FECACA', borderRadius: 20, fontSize: 13, fontWeight: 500,
                  }}>Clear all ✕</Link>
                </div>
              )}

              {/* Results */}
              {(dentists?.length || 0) === 0 ? (
                /* No results */
                <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>No dentists found</h2>
                  <p style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 28 }}>Try adjusting your filters or search in a nearby area</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {(allAreas || []).slice(0, 4).map(area => (
                      <Link key={area.slug} href={`/dentists?area=${area.slug}`} style={{
                        padding: '8px 20px', background: 'var(--blue-light)', color: 'var(--blue)',
                        border: '1px solid #BFDBFE', borderRadius: 20, fontSize: 13, fontWeight: 600,
                      }}>📍 {area.name}</Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{
                  display: view === 'grid' ? 'grid' : 'flex',
                  gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(280px, 1fr))' : undefined,
                  flexDirection: view === 'list' ? 'column' : undefined,
                  gap: 16,
                }}>
                  {dentists?.map(d => (
                    <DentistCard key={d.id} dentist={d as any} view={view} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              <Pagination currentPage={page} totalPages={totalPages} />
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
