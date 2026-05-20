import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NationalShell from '@/components/national/NationalShell'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'
import SaveButton from './[id]/SaveButton'
import SearchBox from './SearchBox'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Clinical Cases by Verified Indian Dentists | Dentist In India',
  description: 'Browse clinical cases shared by MCI-verified dentists across India — implants, orthodontics, cosmetic, full-mouth rehabilitation and more.',
}

// /cases — the public browse surface.
//
// Phase 1b adds three social knobs:
//   1. Trending strip at the top — top 6 by likes*3 + views*0.1 +
//      comments*2 − days_old. Computed JS-side over the last 14 days
//      of approved cases.
//   2. Keyword search (?q=) across title/description/specialty.
//   3. "Following" filter (?f=following) — only renders for signed-in
//      dentists; restricts the grid to cases authored by dentists they
//      follow.
// Plus a save (★) button overlaid on every card.

const PAGE_SIZE = 36
const TRENDING_WINDOW_DAYS = 14
const TRENDING_LIMIT = 6

interface CaseCard {
  id: string
  title: string
  specialty: string
  complexity: number
  created_at: string
  like_count: number
  comment_count: number
  view_count: number
  dentists: { name: string; slug: string; clinic_name: string | null; city: string | null } | null
  thumb: string | null
}

function pickThumb(photos: Array<{ case_id: string; url: string; kind: string }>, caseId: string): string | null {
  const here = photos.filter(p => p.case_id === caseId)
  if (here.length === 0) return null
  // Prefer clinical (before/after) over x-ray as the thumbnail.
  return (here.find(p => p.kind === 'before' || p.kind === 'after') || here[0]).url
}

function trendingScore(c: { like_count: number; view_count: number; comment_count: number; created_at: string }): number {
  const days = (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
  return (c.like_count * 3) + (c.view_count * 0.1) + (c.comment_count * 2) - days
}

export default async function CasesBrowsePage({ searchParams }: { searchParams: Promise<{ s?: string; c?: string; q?: string; f?: string }> }) {
  const sp = await searchParams
  const specialtyFilter = typeof sp.s === 'string' && SPECIALTIES.some(s => s.slug === sp.s) ? sp.s : null
  const complexityFilter = (() => {
    const n = parseInt(sp.c || '', 10)
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
  })()
  const keyword = typeof sp.q === 'string' ? sp.q.trim().slice(0, 120) : ''
  const followingOnly = sp.f === 'following'

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Identify the viewer once; we use it for the my-saved overlay, the
  // following filter, and to decide whether to show the "following"
  // chip in the toolbar.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let viewerDentistId: string | null = null
  let savedSet = new Set<string>()
  let followingIds: string[] = []
  if (user?.email) {
    const { data: me } = await supabase
      .from('dentists').select('id').eq('email', user.email).single()
    viewerDentistId = me?.id ?? null
    if (viewerDentistId) {
      const [{ data: saves }, { data: follows }] = await Promise.all([
        admin.from('case_saves').select('case_id').eq('dentist_id', viewerDentistId),
        admin.from('dentist_follows').select('following_id').eq('follower_id', viewerDentistId),
      ])
      savedSet = new Set((saves || []).map((s: any) => s.case_id as string))
      followingIds = (follows || []).map((f: any) => f.following_id as string)
    }
  }

  // ── Trending strip (always shows the same trending cases regardless
  //    of the filter chips below; it's a separate discovery surface) ──
  const trendingCutoff = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: trendingPool } = await admin
    .from('cases')
    .select('id, title, specialty, complexity, created_at, like_count, comment_count, view_count, dentists(name, slug, clinic_name, city)')
    .eq('status', 'approved')
    .gte('created_at', trendingCutoff)
    .order('created_at', { ascending: false })
    .limit(200)
  const trendingScored = (trendingPool || []).map((r: any) => ({
    ...r,
    _score: trendingScore({ like_count: r.like_count || 0, view_count: r.view_count || 0, comment_count: r.comment_count || 0, created_at: r.created_at }),
  }))
  trendingScored.sort((a: any, b: any) => b._score - a._score)
  const trendingTop = trendingScored.slice(0, TRENDING_LIMIT)

  // ── Main grid query ──────────────────────────────────────────────────
  let q = admin.from('cases')
    .select('id, title, specialty, complexity, created_at, like_count, comment_count, view_count, dentists(name, slug, clinic_name, city)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (specialtyFilter)  q = q.eq('specialty', specialtyFilter)
  if (complexityFilter) q = q.eq('complexity', complexityFilter)
  // Keyword search — title OR description OR specialty (ilike). The
  // .or() syntax in supabase-js takes a CSV string of comma-separated
  // expressions; we URL-encode the value to keep commas + parens safe.
  if (keyword) {
    const safe = keyword.replace(/[%,()]/g, ' ').trim()
    if (safe) q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,specialty.ilike.%${safe}%`)
  }
  // "From dentists you follow" — apply only when there's at least one
  // followed dentist; an empty `.in([])` would short-circuit Postgres
  // and return zero rows even when no filter was intended.
  if (followingOnly && followingIds.length > 0) {
    q = q.in('dentist_id', followingIds)
  } else if (followingOnly && followingIds.length === 0) {
    // Signed-in user with no follows yet → render an empty grid; mark
    // by forcing the where clause to match nothing.
    q = q.eq('id', '00000000-0000-0000-0000-000000000000')
  }
  const { data: rows } = await q

  // Thumbnails for both the trending strip AND the main grid in one
  // round-trip.
  const allIds = Array.from(new Set([
    ...trendingTop.map((r: any) => r.id as string),
    ...(rows || []).map((r: any) => r.id as string),
  ]))
  let photoRows: Array<{ case_id: string; url: string; kind: string }> = []
  if (allIds.length) {
    const { data: ph } = await admin
      .from('case_photos')
      .select('case_id, url, kind, display_order')
      .in('case_id', allIds)
      .order('display_order')
    photoRows = (ph || []) as any
  }
  const buildCard = (r: any): CaseCard => ({
    id: r.id, title: r.title, specialty: r.specialty, complexity: r.complexity,
    created_at: r.created_at, like_count: r.like_count || 0,
    comment_count: r.comment_count || 0, view_count: r.view_count || 0,
    dentists: r.dentists,
    thumb: pickThumb(photoRows, r.id),
  })
  const trendingCards = trendingTop.map(buildCard)
  const cards: CaseCard[] = (rows || []).map(buildCard)

  function buildHref(opts: { s?: string | null; c?: number | null; q?: string | null; f?: string | null }) {
    const u = new URLSearchParams()
    const finalS = opts.s !== undefined ? opts.s : specialtyFilter
    const finalC = opts.c !== undefined ? opts.c : complexityFilter
    const finalQ = opts.q !== undefined ? opts.q : (keyword || null)
    const finalF = opts.f !== undefined ? opts.f : (followingOnly ? 'following' : null)
    if (finalS) u.set('s', finalS)
    if (finalC) u.set('c', String(finalC))
    if (finalQ) u.set('q', finalQ)
    if (finalF) u.set('f', finalF)
    const qs = u.toString()
    return qs ? `/cases?${qs}` : '/cases'
  }

  const showTrending = !keyword && !specialtyFilter && !complexityFilter && !followingOnly && trendingCards.length > 0

  return (
    <NationalShell badge="Cases">
      <section style={{ padding: '40px 20px 24px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, lineHeight: 1.15, color: '#0F1923', marginBottom: 10 }}>
            Clinical cases by verified Indian dentists
          </h1>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.55 }}>
            Treatment write-ups from MCI-registered practitioners across the country. Every case is reviewed before going live.
          </p>
          {viewerDentistId && (
            <div style={{ marginTop: 14 }}>
              <Link href="/cases/saved" style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700, textDecoration: 'none', marginRight: 16 }}>★ My saved →</Link>
              <Link href="/cases/new"   style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>+ Post a case →</Link>
            </div>
          )}
        </div>
      </section>

      {/* Trending — only shows on the unfiltered default view so the
          discovery surface stays distinct from the active search. */}
      {showTrending && (
        <section style={{ padding: '24px 20px 8px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923' }}>
                🔥 Trending this week
              </h2>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>Last {TRENDING_WINDOW_DAYS} days</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {trendingCards.map(c => <Card key={c.id} c={c} saved={savedSet.has(c.id)} signedIn={!!user?.email} />)}
            </div>
          </div>
        </section>
      )}

      {/* Filters + search bar */}
      <section style={{ padding: '20px 20px 8px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SearchBox initial={keyword} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 6 }}>Specialty</span>
            <Pill href={buildHref({ s: null })} active={!specialtyFilter}>All</Pill>
            {SPECIALTIES.map(s => (
              <Pill key={s.slug} href={buildHref({ s: s.slug })} active={specialtyFilter === s.slug} bg={s.bg} color={s.color}>
                {s.label}
              </Pill>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 6 }}>Complexity</span>
            <Pill href={buildHref({ c: null })} active={!complexityFilter}>Any</Pill>
            {[1, 2, 3, 4, 5].map(n => (
              <Pill key={n} href={buildHref({ c: n })} active={complexityFilter === n}>
                {'★'.repeat(n)}
              </Pill>
            ))}
            {viewerDentistId && (
              <>
                <span style={{ width: 1, height: 18, background: '#E2E8F0', margin: '0 6px' }} />
                <Pill href={buildHref({ f: followingOnly ? null : 'following' })} active={followingOnly}>
                  👤 From dentists I follow
                </Pill>
              </>
            )}
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px 64px' }}>
        {cards.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 48, textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🦷</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0F1923', marginBottom: 6 }}>
              {followingOnly && followingIds.length === 0
                ? "You're not following anyone yet."
                : 'No cases match these filters yet.'}
            </p>
            <p style={{ fontSize: 13 }}>
              <Link href="/cases" style={{ color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>Clear filters →</Link>
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {cards.map(c => <Card key={c.id} c={c} saved={savedSet.has(c.id)} signedIn={!!user?.email} />)}
          </div>
        )}
      </main>
    </NationalShell>
  )
}

function Card({ c, saved, signedIn }: { c: CaseCard; saved: boolean; signedIn: boolean }) {
  const spec = getSpecialty(c.specialty)
  return (
    <div style={{ position: 'relative', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
      <Link href={`/cases/${c.id}`} style={{ textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#F1F5F9', overflow: 'hidden' }}>
          {c.thumb
            ? <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 32 }}>🦷</div>}
        </div>
        <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {spec && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', background: spec.bg, color: spec.color, borderRadius: 999 }}>{spec.label}</span>}
            <span style={{ fontSize: 11, color: '#F59E0B' }}>
              {'★'.repeat(c.complexity)}<span style={{ color: '#CBD5E1' }}>{'★'.repeat(5 - c.complexity)}</span>
            </span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: '#0F1923' }}>{c.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
            {c.dentists && (
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Dr. {c.dentists.name}{c.dentists.city ? ' · ' + c.dentists.city : ''}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#94A3B8' }}>
              {c.like_count > 0 && <span title="Likes">♥ {c.like_count}</span>}
              {c.comment_count > 0 && <span title="Comments">💬 {c.comment_count}</span>}
            </div>
          </div>
        </div>
      </Link>
      {/* SaveButton lives outside the Link wrapper so its click handler
          can stopPropagation; visually anchored to the top-right corner
          of the thumbnail. */}
      <div style={{ position: 'absolute', top: 8, right: 8 }}>
        <SaveButton caseId={c.id} initialSaved={saved} signedIn={signedIn} compact nextHref={`/cases/${c.id}`} />
      </div>
    </div>
  )
}

function Pill({ href, active, children, bg, color }: { href: string; active: boolean; children: React.ReactNode; bg?: string; color?: string }) {
  return (
    <Link href={href} style={{
      padding: '6px 12px', minHeight: 30,
      borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: active ? (color || '#1D4ED8') : (bg || '#fff'),
      color: active ? '#fff' : (color || '#475569'),
      border: `1px solid ${active ? (color || '#1D4ED8') : '#E2E8F0'}`,
      textDecoration: 'none',
      display: 'inline-flex', alignItems: 'center',
    }}>{children}</Link>
  )
}
