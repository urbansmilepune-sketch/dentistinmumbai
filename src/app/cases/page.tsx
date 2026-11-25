import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import DentistsOnly from '@/components/national/DentistsOnly'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'
import { adminDb, getViewerDentist, isNationalRequest, AFTER_KINDS, cityNameOf, ui } from '@/lib/national'
import { drName } from '@/lib/dentistName'
import { followedIds, sinceDaysAgo } from '@/lib/followDigest'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Case library | DentistIn India',
  description: 'Clinical cases shared by dentists across India, with follow-ups and peer advice.',
  robots: { index: false, follow: false },
}

// /cases — the dentists-only case library (v1 network, Nov 2026).
// Filters are plain links (?s= specialty, ?f=open|followup|following, ?by= dentist
// slug, ?q= words in the title) so the page stays a server component.

type SP = { s?: string; f?: string; by?: string; q?: string }

export default async function CaseLibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await isNationalRequest())) notFound()
  const sp = await searchParams
  const viewer = await getViewerDentist()
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === 'string' && v) as [string, string][]).toString()
  if (!viewer) return <DentistsOnly next={`/cases${qs ? '?' + qs : ''}`} />

  const specialty = SPECIALTIES.some(s => s.slug === sp.s) ? sp.s! : null
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
          <Link href="/cases/new" style={ui.btn}>Post a case</Link>
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
                <Link key={c.id} href={`/cases/${c.id}`} style={{ ...ui.card, padding: 12, display: 'flex', gap: 12, textDecoration: 'none', color: '#0F1923' }}>
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
