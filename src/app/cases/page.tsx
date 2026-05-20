import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NationalShell from '@/components/national/NationalShell'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Clinical Cases by Verified Indian Dentists | Dentist In India',
  description: 'Browse clinical cases shared by MCI-verified dentists across India — implants, orthodontics, cosmetic, full-mouth rehabilitation and more.',
}

// /cases — the public browse surface. Server-rendered card grid. The
// specialty filter comes in via ?s=<slug>; complexity filter via ?c=N.
// We use the service-role client because case_photos RLS lets the anon
// reader see photos only when the parent case is approved — using the
// service role here keeps the query simple AND lets us include the
// first photo URL for the thumbnail in a single round-trip via a left
// join. (The same trust model already powers the national homepage
// live counters and /cities.)

const PAGE_SIZE = 36

interface CaseCard {
  id: string
  title: string
  specialty: string
  complexity: number
  created_at: string
  dentists: { name: string; slug: string; clinic_name: string | null; city: string | null } | null
  thumb: string | null
}

export default async function CasesBrowsePage({ searchParams }: { searchParams: Promise<{ s?: string; c?: string }> }) {
  const sp = await searchParams
  const specialtyFilter = typeof sp.s === 'string' && SPECIALTIES.some(s => s.slug === sp.s) ? sp.s : null
  const complexityFilter = (() => {
    const n = parseInt(sp.c || '', 10)
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
  })()

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let q = admin.from('cases')
    .select('id, title, specialty, complexity, created_at, dentists(name, slug, clinic_name, city)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (specialtyFilter)  q = q.eq('specialty', specialtyFilter)
  if (complexityFilter) q = q.eq('complexity', complexityFilter)
  const { data: rows } = await q

  // One thumbnail per case — first photo by display_order, before/after
  // before x-rays so the card shows a clinical image rather than an X-ray
  // when both exist.
  const ids = (rows || []).map(r => (r as any).id as string)
  let thumbs = new Map<string, string>()
  if (ids.length) {
    const { data: photos } = await admin
      .from('case_photos')
      .select('case_id, url, kind, display_order')
      .in('case_id', ids)
      .order('display_order')
    if (photos) {
      // Prefer non-xray photos when picking the thumbnail.
      for (const p of photos as Array<{ case_id: string; url: string; kind: string }>) {
        const isClinical = p.kind === 'before' || p.kind === 'after'
        const existing = thumbs.get(p.case_id)
        if (!existing || (!existing.startsWith('xray:') && false)) {
          // We tag X-ray thumbs so we can override them on a later
          // pass; cheap encoding using a prefix string.
          thumbs.set(p.case_id, isClinical ? p.url : `xray:${p.url}`)
        }
      }
      // Second pass: if any case still has an xray-tagged thumb but we
      // saw a clinical photo later in the iteration, the above logic
      // already kept the first one. Look for any clinical override.
      for (const p of photos as Array<{ case_id: string; url: string; kind: string }>) {
        if ((p.kind === 'before' || p.kind === 'after') && thumbs.get(p.case_id)?.startsWith('xray:')) {
          thumbs.set(p.case_id, p.url)
        }
      }
      // Strip the xray: prefix from any remaining (no clinical photo).
      for (const [k, v] of thumbs) if (v.startsWith('xray:')) thumbs.set(k, v.slice(5))
    }
  }

  const cards: CaseCard[] = (rows || []).map(r => ({
    id: (r as any).id,
    title: (r as any).title,
    specialty: (r as any).specialty,
    complexity: (r as any).complexity,
    created_at: (r as any).created_at,
    dentists: (r as any).dentists,
    thumb: thumbs.get((r as any).id) ?? null,
  }))

  function buildHref(s: string | null, c: number | null) {
    const u = new URLSearchParams()
    if (s) u.set('s', s)
    if (c) u.set('c', String(c))
    const qs = u.toString()
    return qs ? `/cases?${qs}` : '/cases'
  }

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
        </div>
      </section>

      <section style={{ padding: '20px 20px 8px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 6 }}>Specialty</span>
            <Pill href={buildHref(null, complexityFilter)} active={!specialtyFilter}>All</Pill>
            {SPECIALTIES.map(s => (
              <Pill key={s.slug} href={buildHref(s.slug, complexityFilter)} active={specialtyFilter === s.slug} bg={s.bg} color={s.color}>
                {s.label}
              </Pill>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 6 }}>Complexity</span>
            <Pill href={buildHref(specialtyFilter, null)} active={!complexityFilter}>Any</Pill>
            {[1, 2, 3, 4, 5].map(n => (
              <Pill key={n} href={buildHref(specialtyFilter, n)} active={complexityFilter === n}>
                {'★'.repeat(n)}
              </Pill>
            ))}
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px 64px' }}>
        {cards.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 48, textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🦷</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0F1923', marginBottom: 6 }}>No cases match these filters yet.</p>
            <p style={{ fontSize: 13 }}>
              <Link href="/cases" style={{ color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>Clear filters →</Link>
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {cards.map(c => {
              const spec = getSpecialty(c.specialty)
              return (
                <Link key={c.id} href={`/cases/${c.id}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
                  <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#F1F5F9', overflow: 'hidden' }}>
                    {c.thumb ? (
                      <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 32 }}>🦷</div>
                    )}
                  </div>
                  <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {spec && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', background: spec.bg, color: spec.color, borderRadius: 999 }}>{spec.label}</span>
                      )}
                      <span style={{ fontSize: 11, color: '#F59E0B' }}>
                        {'★'.repeat(c.complexity)}<span style={{ color: '#CBD5E1' }}>{'★'.repeat(5 - c.complexity)}</span>
                      </span>
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: '#0F1923' }}>{c.title}</h3>
                    {c.dentists && (
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 'auto' }}>
                        Dr. {c.dentists.name}{c.dentists.city ? ' · ' + c.dentists.city : ''}
                      </div>
                    )}
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
