import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NationalShell from './NationalShell'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

// /dentists on dentistinindia.in — "Discover Dentists" national grid.
// Service-role read so the join across dentists + case counts +
// follower counts can complete in one round-trip. The filter chips are
// stateless links that just bounce the URL with the new query params.
//
// Sort options:
//   ?sort=cases    — most published approved cases (default)
//   ?sort=followers — most followers
//   ?sort=recent   — most recently joined
//   ?sort=alpha    — alphabetical by name

const SPECIALIZATIONS = [
  'General Dentist',
  'Orthodontist',
  'Implantologist',
  'Endodontist',
  'Periodontist',
  'Oral Surgeon',
  'Pedodontist',
  'Prosthodontist',
  'Cosmetic Dentist',
]

const EXPERIENCE_BANDS: Array<{ slug: string; label: string; min: number; max: number }> = [
  { slug: 'any',   label: 'Any experience', min: 0,  max: 999 },
  { slug: '0-3',   label: '0 – 3 years',     min: 0,  max: 3 },
  { slug: '4-9',   label: '4 – 9 years',     min: 4,  max: 9 },
  { slug: '10-19', label: '10 – 19 years',   min: 10, max: 19 },
  { slug: '20+',   label: '20+ years',       min: 20, max: 999 },
]

const SORT_OPTIONS = [
  { slug: 'cases',     label: 'Most cases' },
  { slug: 'followers', label: 'Most followers' },
  { slug: 'recent',    label: 'Recently joined' },
  { slug: 'alpha',     label: 'Alphabetical' },
] as const

type SortKey = (typeof SORT_OPTIONS)[number]['slug']

interface DentistCard {
  id: string
  slug: string
  name: string
  city: CitySlug | null
  clinic_name: string | null
  qualifications: string | null
  experience_years: number | null
  profile_photo: string | null
  is_verified: boolean | null
  case_count: number
  follower_count: number
}

interface Props {
  searchParams: { city?: string; spec?: string; exp?: string; q?: string; sort?: string }
}

export default async function NationalDentistsDiscover({ searchParams }: Props) {
  const cityFilter = typeof searchParams.city === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, searchParams.city) ? (searchParams.city as CitySlug) : null
  const specFilter = typeof searchParams.spec === 'string' && SPECIALIZATIONS.includes(searchParams.spec) ? searchParams.spec : null
  const expBand    = EXPERIENCE_BANDS.find(b => b.slug === searchParams.exp) || EXPERIENCE_BANDS[0]
  const keyword    = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 120) : ''
  const sortKey: SortKey = (SORT_OPTIONS.find(s => s.slug === searchParams.sort)?.slug as SortKey) || 'cases'

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch all is_active dentists with filters applied at the DB level.
  // We don't paginate yet — the network is small enough that the full
  // list fits in one round-trip; once we cross ~1k active dentists
  // we'll add ?page= cursors.
  let q = admin.from('dentists')
    .select('id, slug, name, city, clinic_name, qualifications, specialties, experience_years, profile_photo, is_verified, created_at')
    .eq('is_active', true)
    .limit(2000)
  if (cityFilter)   q = q.eq('city', cityFilter)
  if (specFilter)   q = q.contains('specialties', [specFilter])
  if (expBand.slug !== 'any') q = q.gte('experience_years', expBand.min).lte('experience_years', expBand.max)
  if (keyword) {
    const safe = keyword.replace(/[%,()]/g, ' ').trim()
    if (safe) q = q.or(`name.ilike.%${safe}%,clinic_name.ilike.%${safe}%`)
  }
  const { data: dentRows } = await q

  const ids = (dentRows || []).map(d => (d as any).id as string)

  // Case + follower counts in two slim queries. We aggregate on the
  // client because Supabase doesn't expose group-by counts directly
  // and an RPC for two simple aggregates is overkill.
  const caseCounts = new Map<string, number>()
  const followerCounts = new Map<string, number>()
  if (ids.length) {
    const [{ data: cases }, { data: follows }] = await Promise.all([
      admin.from('cases').select('dentist_id').in('dentist_id', ids).eq('status', 'approved'),
      admin.from('dentist_follows').select('following_id').in('following_id', ids),
    ])
    for (const c of (cases || []) as Array<{ dentist_id: string }>) {
      caseCounts.set(c.dentist_id, (caseCounts.get(c.dentist_id) || 0) + 1)
    }
    for (const f of (follows || []) as Array<{ following_id: string }>) {
      followerCounts.set(f.following_id, (followerCounts.get(f.following_id) || 0) + 1)
    }
  }

  let cards: DentistCard[] = (dentRows || []).map((d: any) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    city: d.city,
    clinic_name: d.clinic_name,
    qualifications: d.qualifications,
    experience_years: d.experience_years,
    profile_photo: d.profile_photo,
    is_verified: d.is_verified,
    case_count: caseCounts.get(d.id) || 0,
    follower_count: followerCounts.get(d.id) || 0,
  }))

  // Sort JS-side because case_count / follower_count are derived. For
  // 'recent' and 'alpha' we sort against the row fields we already have.
  const createdAtById = new Map<string, string>()
  for (const d of (dentRows || []) as Array<{ id: string; created_at: string }>) createdAtById.set(d.id, d.created_at)
  if (sortKey === 'cases') {
    cards.sort((a, b) => b.case_count - a.case_count || a.name.localeCompare(b.name))
  } else if (sortKey === 'followers') {
    cards.sort((a, b) => b.follower_count - a.follower_count || a.name.localeCompare(b.name))
  } else if (sortKey === 'recent') {
    cards.sort((a, b) => {
      const at = new Date(createdAtById.get(a.id) || 0).getTime()
      const bt = new Date(createdAtById.get(b.id) || 0).getTime()
      return bt - at
    })
  } else {
    cards.sort((a, b) => a.name.localeCompare(b.name))
  }

  function buildHref(opts: { city?: string | null; spec?: string | null; exp?: string | null; q?: string | null; sort?: string | null }) {
    const u = new URLSearchParams()
    const finalCity = opts.city !== undefined ? opts.city : cityFilter
    const finalSpec = opts.spec !== undefined ? opts.spec : specFilter
    const finalExp  = opts.exp  !== undefined ? opts.exp  : (expBand.slug === 'any' ? null : expBand.slug)
    const finalQ    = opts.q    !== undefined ? opts.q    : (keyword || null)
    const finalSort = opts.sort !== undefined ? opts.sort : (sortKey === 'cases' ? null : sortKey)
    if (finalCity) u.set('city', finalCity)
    if (finalSpec) u.set('spec', finalSpec)
    if (finalExp)  u.set('exp', finalExp)
    if (finalQ)    u.set('q', finalQ)
    if (finalSort) u.set('sort', finalSort)
    const qs = u.toString()
    return qs ? `/dentists?${qs}` : '/dentists'
  }

  return (
    <NationalShell badge="Dentists">
      <section style={{ padding: '40px 20px 16px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, lineHeight: 1.15, color: '#0F1923', marginBottom: 10 }}>
            Discover dentists
          </h1>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.55 }}>
            Verified State Dental Council-registered professionals from {Object.keys(CITY_CONFIGS).length} cities across India. Browse by specialty, city, experience.
          </p>
        </div>
      </section>

      <section style={{ padding: '16px 20px 8px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <form method="get" action="/dentists" style={{ display: 'flex', gap: 8 }}>
            <input
              type="search" name="q" defaultValue={keyword}
              placeholder="Search by name or clinic…"
              style={{ flex: 1, minWidth: 0, padding: '10px 14px', minHeight: 40, borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', background: '#fff', color: '#0F1923' }}
            />
            {/* Preserve existing filters across keyword searches */}
            {cityFilter && <input type="hidden" name="city" value={cityFilter} />}
            {specFilter && <input type="hidden" name="spec" value={specFilter} />}
            {expBand.slug !== 'any' && <input type="hidden" name="exp" value={expBand.slug} />}
            {sortKey !== 'cases' && <input type="hidden" name="sort" value={sortKey} />}
            <button type="submit" style={{ padding: '10px 18px', minHeight: 40, background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Search</button>
          </form>

          <FilterRow label="City">
            <Pill href={buildHref({ city: null })} active={!cityFilter}>All cities</Pill>
            {(Object.entries(CITY_CONFIGS) as Array<[CitySlug, { cityName: string }]>).sort((a, b) => a[1].cityName.localeCompare(b[1].cityName)).map(([slug, cfg]) => (
              <Pill key={slug} href={buildHref({ city: slug })} active={cityFilter === slug}>{cfg.cityName}</Pill>
            ))}
          </FilterRow>
          <FilterRow label="Specialty">
            <Pill href={buildHref({ spec: null })} active={!specFilter}>All</Pill>
            {SPECIALIZATIONS.map(s => (
              <Pill key={s} href={buildHref({ spec: s })} active={specFilter === s}>{s}</Pill>
            ))}
          </FilterRow>
          <FilterRow label="Experience">
            {EXPERIENCE_BANDS.map(b => (
              <Pill key={b.slug} href={buildHref({ exp: b.slug === 'any' ? null : b.slug })} active={(expBand.slug === b.slug)}>{b.label}</Pill>
            ))}
          </FilterRow>
          <FilterRow label="Sort">
            {SORT_OPTIONS.map(s => (
              <Pill key={s.slug} href={buildHref({ sort: s.slug === 'cases' ? null : s.slug })} active={sortKey === s.slug}>{s.label}</Pill>
            ))}
          </FilterRow>
        </div>
      </section>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px 64px' }}>
        <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>{cards.length} dentist{cards.length === 1 ? '' : 's'}</div>
        {cards.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 48, textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🦷</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0F1923', marginBottom: 6 }}>No dentists match these filters.</p>
            <p style={{ fontSize: 13 }}><Link href="/dentists" style={{ color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>Clear filters →</Link></p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {cards.map(d => {
              const cityCfg = d.city ? (CITY_CONFIGS as any)[d.city] : null
              const initials = d.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
              return (
                <Link key={d.id} href={`/professional/${d.slug}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18, textDecoration: 'none', color: '#0F1923', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {d.profile_photo ? <img src={d.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>Dr. {d.name}</span>
                      {d.is_verified && <span style={{ fontSize: 10, padding: '1px 6px', background: '#DCFCE7', color: '#166534', borderRadius: 999, fontWeight: 700 }}>✓</span>}
                    </div>
                    {d.qualifications && <div style={{ fontSize: 11, color: '#64748B' }}>{d.qualifications}</div>}
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                      {cityCfg?.cityName || '—'}{typeof d.experience_years === 'number' && d.experience_years > 0 ? ` · ${d.experience_years}y` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: '#475569' }}>
                      <span><strong style={{ color: '#0F1923' }}>{d.case_count}</strong> case{d.case_count === 1 ? '' : 's'}</span>
                      <span><strong style={{ color: '#0F1923' }}>{d.follower_count}</strong> follower{d.follower_count === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </NationalShell>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 6 }}>{label}</span>
      {children}
    </div>
  )
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} style={{
      padding: '6px 12px', minHeight: 30,
      borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: active ? '#1D4ED8' : '#fff',
      color: active ? '#fff' : '#475569',
      border: `1px solid ${active ? '#1D4ED8' : '#E2E8F0'}`,
      textDecoration: 'none',
      display: 'inline-flex', alignItems: 'center',
    }}>{children}</Link>
  )
}
