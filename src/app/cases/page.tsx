import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'
import { adminDb, getViewerDentist, isNationalRequest, AFTER_KINDS, cityNameOf, ui } from '@/lib/national'
import { drName } from '@/lib/dentistName'
import { casePath } from '@/lib/caseSlug'
import { followedIds, sinceDaysAgo } from '@/lib/followDigest'
import { summaryText } from '@/lib/caseSummary'
import { NATIONAL_ORIGIN } from '@/config/cities'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

// /cases — the case library (v1 network, Nov 2026).
// Signed-in dentists get the full library with photos and filters.
// Since 26 Nov 2026 everyone else (patients, Google) gets a public list of
// approved cases: title, treatment, city, dentist and a short text summary,
// the same privacy rules as the public case page (no photos, X-rays or
// patient details). Drafts, pending and rejected cases never appear.
// Filters are plain links (?s= specialty, ?f=open|followup|following, ?by= dentist
// slug, ?q= words in the title, ?p= page) so the page stays a server component.

type SP = { s?: string; f?: string; by?: string; q?: string; p?: string }

function pageNum(raw?: string): number {
  const n = Number.parseInt(raw || '1', 10)
  return Number.isFinite(n) && n > 1 ? Math.min(n, 1000) : 1
}

function publicHref(specialty: string | null, page: number): string {
  const p = new URLSearchParams()
  if (specialty) p.set('s', specialty)
  if (page > 1) p.set('p', String(page))
  const s = p.toString()
  return `/cases${s ? '?' + s : ''}`
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams
  const spec = getSpecialty(sp.s)
  const page = pageNum(sp.p)
  const label = spec ? `${spec.label} cases` : 'Dental case library'
  const title = `${label} from dentists across India${page > 1 ? ` (page ${page})` : ''} | DentistIn India`
  const description = spec
    ? `Real ${spec.label.toLowerCase()} cases treated and shared by verified dentists across India. See who treated each case, where, and how it turned out.`
    : 'Real dental cases treated and shared by verified dentists across India: implants, root canals, braces, smile makeovers and more. See who treated each case and where.'
  // Search, "following" and other personal views are not separate pages
  // for Google; they point back to the main list.
  const personal = !!(sp.q || sp.f || sp.by)
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${NATIONAL_ORIGIN}${personal ? '/cases' : publicHref(spec?.slug ?? null, page)}` },
    robots: personal ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title, description, url: `${NATIONAL_ORIGIN}${publicHref(spec?.slug ?? null, page)}`, siteName: 'Dentist In India', type: 'website' },
  }
}

export default async function CaseLibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await isNationalRequest())) notFound()
  const sp = await searchParams
  const viewer = await getViewerDentist()
  const specialty = SPECIALTIES.some(s => s.slug === sp.s) ? sp.s! : null
  if (!viewer) return <PublicCaseLibrary specialty={specialty} page={pageNum(sp.p)} />

  const filter = sp.f === 'open' || sp.f === 'followup' || sp.f === 'following' ? sp.f : null
  const keyword = (sp.q || '').trim().slice(0, 80)

  const db = adminDb()
  let byDentist: { id: string; name: string; slug: string } | null = null
  if (sp.by) {
    const { data } = await db.from('dentists').select('id, name, slug').eq('slug', sp.by).order('created_at').limit(1)
    byDentist = (data?.[0] as any) || null
  }

  let query = db
    .from('cases')
    .select('id, title, specialty, complexity, comment_count, like_count, created_at, dentist_id, dentists(name, slug, city)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200)
  // People the viewer follows, and how many of their cases are new this week.
  const following = await followedIds(db, viewer.id)
  let newFromFollowing = 0
  if (following.length) {
    const { count } = await db.from('cases').select('id', { count: 'exact', head: true })
      .eq('status', 'approved').in('dentist_id', following).gte('created_at', sinceDaysAgo())
    newFromFollowing = count ?? 0
  }
  if (filter === 'following') query = query.in('dentist_id', following.length ? following : ['00000000-0000-0000-0000-000000000000'])
  if (specialty) query = query.eq('specialty', specialty)
  if (byDentist) query = query.eq('dentist_id', byDentist.id)
  if (keyword) query = query.ilike('title', `%${keyword.replace(/[%_]/g, '')}%`)
  const { data: rows } = await query
  let cases = (rows || []) as Array<Record<string, any>>

  const ids = cases.map(c => c.id)
  const thumbs = new Map<string, string>()
  const followed = new Set<string>()
  if (ids.length) {
    const { data: photos } = await db.from('case_photos').select('case_id, url, kind, display_order').in('case_id', ids).order('display_order')
    for (const p of (photos || []) as Array<{ case_id: string; url: string; kind: string }>) {
      if (!thumbs.has(p.case_id)) thumbs.set(p.case_id, p.url)
      if (AFTER_KINDS.includes(p.kind)) followed.add(p.case_id)
    }
  }
  if (filter === 'open') cases = cases.filter(c => !c.comment_count)
  if (filter === 'followup') cases = cases.filter(c => followed.has(c.id))

  const link = (patch: Partial<SP>) => {
    const next = { ...sp, ...patch }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v as string)
    const s = p.toString()
    return `/cases${s ? '?' + s : ''}`
  }

  return (
    <NationalShell>
      <main style={ui.page}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={ui.h1}>{byDentist ? `Cases by ${drName(byDentist.name)}` : 'Case library'}</h1>
            <p style={ui.sub}>Real cases from dentists across India. Ask, answer, and come back for the follow-ups.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/cases/drafts" style={ui.btnGhost}>My drafts</Link>
            <Link href="/cases/new" style={ui.btn}>Post a case</Link>
          </div>
        </div>

        <form action="/cases" method="get" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {specialty && <input type="hidden" name="s" value={specialty} />}
          {filter && <input type="hidden" name="f" value={filter} />}
          {byDentist && <input type="hidden" name="by" value={byDentist.slug} />}
          <label htmlFor="case-q" style={{ position: 'absolute', left: -9999 }}>Search cases</label>
          <input id="case-q" name="q" defaultValue={keyword} placeholder="Search, e.g. molar implant bone graft"
            style={{ flex: 1, minWidth: 0, minHeight: 46, padding: '0 14px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15, fontFamily: 'var(--font-body)' }} />
          <button type="submit" style={ui.btnGhost}>Search</button>
        </form>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <Link href={link({ s: undefined })} style={ui.chip(!specialty)}>All</Link>
          {SPECIALTIES.map(s => (
            <Link key={s.slug} href={link({ s: s.slug })} style={ui.chip(specialty === s.slug)}>{s.label}</Link>
          ))}
        </div>
        {newFromFollowing > 0 && filter !== 'following' && (
          <Link href={link({ f: 'following' })} style={{ ...ui.card, display: 'block', marginBottom: 12, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E3A8A', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            {newFromFollowing} new case{newFromFollowing === 1 ? '' : 's'} this week from dentists you follow →
          </Link>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Link href={link({ f: filter === 'following' ? undefined : 'following' })} style={ui.chip(filter === 'following')}>Following{following.length ? ` · ${following.length}` : ''}</Link>
          <Link href={link({ f: filter === 'open' ? undefined : 'open' })} style={ui.chip(filter === 'open')}>Needs an answer</Link>
          <Link href={link({ f: filter === 'followup' ? undefined : 'followup' })} style={ui.chip(filter === 'followup')}>Has follow-up</Link>
          {byDentist && <Link href={link({ by: undefined })} style={ui.chip(true)}>{drName(byDentist.name)} ✕</Link>}
        </div>

        <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>{cases.length} case{cases.length === 1 ? '' : 's'}</div>

        {cases.length === 0 ? (
          <div style={{ ...ui.card, borderStyle: 'dashed', textAlign: 'center', padding: 32 }}>
            <p style={{ ...ui.sub, marginBottom: 14 }}>
              {filter === 'following' && !following.length
                ? 'You are not following anyone yet. Tap Follow on a dentist’s case or profile to see their new cases here.'
                : 'No cases match yet. Be the first to share one.'}
            </p>
            <Link href="/cases/new" style={ui.btn}>Post a case</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {cases.map(c => {
              const spec = getSpecialty(c.specialty)
              const thumb = thumbs.get(c.id)
              const n = c.comment_count || 0
              return (
                <Link key={c.id} href={casePath({ id: c.id, title: c.title, city: c.dentists?.city })} style={{ ...ui.card, padding: 12, display: 'flex', gap: 12, textDecoration: 'none', color: '#0F1923' }}>
                  <div style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: '#1E293B' }}>
                    {thumb && <img src={thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {spec && <span style={{ ...ui.pill(spec.bg, spec.color), alignSelf: 'flex-start', fontSize: 11, padding: '2px 8px' }}>{spec.label}</span>}
                    <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{c.title}</span>
                    <span style={{ fontSize: 12, color: '#475569' }}>{drName(c.dentists?.name)}{cityNameOf(c.dentists?.city) ? ` · ${cityNameOf(c.dentists?.city)}` : ''}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: n ? '#1D4ED8' : '#B45309' }}>
                      {n ? `${n} repl${n === 1 ? 'y' : 'ies'}` : 'Needs an answer'}{followed.has(c.id) ? ' · has follow-up' : ''}{c.like_count ? ` · 👍 ${c.like_count}` : ''}
                    </span>
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

// What patients and Google see at /cases: approved cases only, newest
// first, 24 per page. Text only, no photos. Specialty chips and the
// page links are plain <a> links so Google can crawl every case.
async function PublicCaseLibrary({ specialty, page }: { specialty: string | null; page: number }) {
  const db = adminDb()
  let query = db
    .from('cases')
    .select('id, title, specialty, description, created_at, dentists(name, slug, city)', { count: 'exact' })
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (specialty) query = query.eq('specialty', specialty)
  const { data: rows, count } = await query
  const cases = (rows || []) as Array<Record<string, any>>
  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (page > pages) notFound()

  const spec = getSpecialty(specialty)
  const pageUrl = `${NATIONAL_ORIGIN}${publicHref(specialty, page)}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: spec ? `${spec.label} cases` : 'Dental case library',
    url: pageUrl,
    isPartOf: { '@type': 'WebSite', name: 'Dentist In India', url: NATIONAL_ORIGIN },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: cases.map((c, i) => ({
        '@type': 'ListItem',
        position: (page - 1) * PAGE_SIZE + i + 1,
        url: `${NATIONAL_ORIGIN}${casePath({ id: c.id, title: c.title, city: c.dentists?.city })}`,
        name: String(c.title || '').slice(0, 110),
      })),
    },
  }

  return (
    <NationalShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <main style={ui.page}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={ui.h1}>{spec ? `${spec.label} cases` : 'Dental case library'}</h1>
            <p style={ui.sub}>Real cases treated and shared by dentists across India. See who treated each one and where.</p>
          </div>
          <Link href={`/for-dentists/login?next=${encodeURIComponent(publicHref(specialty, page))}`} style={ui.btnGhost}>I&apos;m a dentist, sign in</Link>
        </div>

        <nav aria-label="Treatments" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Link href="/cases" style={ui.chip(!specialty)}>All</Link>
          {SPECIALTIES.map(s => (
            <Link key={s.slug} href={publicHref(s.slug, 1)} style={ui.chip(specialty === s.slug)}>{s.label}</Link>
          ))}
        </nav>

        <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>{total} case{total === 1 ? '' : 's'}{pages > 1 ? ` · page ${page} of ${pages}` : ''}</div>

        {cases.length === 0 ? (
          <div style={{ ...ui.card, borderStyle: 'dashed', textAlign: 'center', padding: 32 }}>
            <p style={ui.sub}>No {spec ? spec.label.toLowerCase() + ' ' : ''}cases shared yet.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {cases.map(c => {
              const cs = getSpecialty(c.specialty)
              const d = c.dentists
              const city = cityNameOf(d?.city)
              const summary = summaryText(c.description, 140)
              const href = casePath({ id: c.id, title: c.title, city: d?.city })
              return (
                <article key={c.id} style={{ ...ui.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {cs && <span style={{ ...ui.pill(cs.bg, cs.color), fontSize: 11, padding: '2px 8px' }}>{cs.label}</span>}
                    {city && <span style={{ ...ui.pill('#F1F5F9', '#334155'), fontSize: 11, padding: '2px 8px' }}>{city}</span>}
                  </div>
                  <h2 style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, margin: 0 }}>
                    <Link href={href} style={{ color: '#0F1923', textDecoration: 'none' }}>{c.title}</Link>
                  </h2>
                  {summary && <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, margin: 0 }}>{summary}</p>}
                  {d?.slug && (
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      By <Link href={`/professional/${d.slug}`} style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>{drName(d.name)}</Link>
                    </span>
                  )}
                  <Link href={href} style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none', marginTop: 'auto' }}>Read case →</Link>
                </article>
              )
            })}
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Pages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
            {page > 1 && <Link href={publicHref(specialty, page - 1)} rel="prev" style={ui.btnGhost}>← Newer</Link>}
            {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
              <Link key={n} href={publicHref(specialty, n)} aria-current={n === page ? 'page' : undefined} style={ui.chip(n === page)}>{n}</Link>
            ))}
            {page < pages && <Link href={publicHref(specialty, page + 1)} rel="next" style={ui.btnGhost}>Older →</Link>}
          </nav>
        )}

        <section style={{ ...ui.card, padding: 20, background: '#F8FAFC', marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ ...ui.sub, fontSize: 14 }}>Clinical photos, X-rays and the discussion between dentists are shared only with registered dentists.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/experts" style={ui.btn}>Find an expert</Link>
            <Link href="/for-dentists/register" style={ui.btnGhost}>I&apos;m a dentist, join free</Link>
          </div>
        </section>
      </main>
    </NationalShell>
  )
}
