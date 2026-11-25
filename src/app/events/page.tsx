import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { adminDb, getViewerDentist, isNationalRequest, cityNameOf, EVENT_KIND_LABEL, ui } from '@/lib/national'
import EventActions from './EventActions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dental events, seminars and courses in India | DentistIn India',
  description: 'Dental exhibitions, seminars, study clubs and hands-on courses across India, in one calendar. Free to list.',
  alternates: { canonical: `${NATIONAL_ORIGIN}/events` },
}

// /events — the network's events and courses calendar. Events are listed
// by organisers or dentists through /events/new and go live once the team
// approves them (status = 'approved').

type SP = { w?: string; t?: string }

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await isNationalRequest())) notFound()
  const sp = await searchParams
  const where = sp.w === 'online' || sp.w === 'near' ? sp.w : 'all'
  const topic = SPECIALTIES.some(s => s.slug === sp.t) ? sp.t! : null
  const viewer = await getViewerDentist()

  const db = adminDb()
  const today = new Date().toISOString().slice(0, 10)
  let q = db.from('events').select('*').eq('status', 'approved').or(`starts_on.gte.${today},ends_on.gte.${today}`).order('starts_on').limit(100)
  if (where === 'online') q = q.eq('is_online', true)
  if (where === 'near' && viewer?.city) q = q.eq('city', viewer.city)
  if (topic) q = q.eq('topic', topic)
  const { data, error } = await q
  const events = (error ? [] : data || []) as Array<Record<string, any>>

  const ids = events.map(e => e.id)
  const goingCount = new Map<string, number>()
  const mine = new Map<string, { going: boolean; remind: boolean }>()
  if (ids.length) {
    const { data: interest } = await db.from('event_interest').select('event_id, dentist_id, going, remind').in('event_id', ids)
    for (const r of (interest || []) as Array<{ event_id: string; dentist_id: string; going: boolean; remind: boolean }>) {
      if (r.going) goingCount.set(r.event_id, (goingCount.get(r.event_id) || 0) + 1)
      if (viewer && r.dentist_id === viewer.id) mine.set(r.event_id, { going: r.going, remind: r.remind })
    }
  }

  const link = (patch: Partial<SP>) => {
    const next = { ...sp, ...patch }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v && v !== 'all') p.set(k, v as string)
    const s = p.toString()
    return `/events${s ? '?' + s : ''}`
  }

  // Group by month for scanning.
  const groups = new Map<string, typeof events>()
  for (const e of events) {
    const key = new Date(e.starts_on + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    groups.set(key, [...(groups.get(key) || []), e])
  }

  return (
    <NationalShell>
      <main style={ui.page}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={ui.h1}>Events and courses</h1>
            <p style={ui.sub}>Exhibitions, seminars, study clubs and hands-on courses for dentists across India.</p>
          </div>
          <Link href="/events/new" style={ui.btnGhost}>List an event</Link>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <Link href={link({ w: 'all' })} style={ui.chip(where === 'all')}>All India</Link>
          {viewer?.city && <Link href={link({ w: 'near' })} style={ui.chip(where === 'near')}>Near me ({cityNameOf(viewer.city)})</Link>}
          <Link href={link({ w: 'online' })} style={ui.chip(where === 'online')}>Online</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <Link href={link({ t: undefined })} style={ui.chip(!topic)}>All topics</Link>
          {SPECIALTIES.map(s => <Link key={s.slug} href={link({ t: s.slug })} style={ui.chip(topic === s.slug)}>{s.label}</Link>)}
        </div>

        {events.length === 0 ? (
          <div style={{ ...ui.card, borderStyle: 'dashed', textAlign: 'center', padding: 32 }}>
            <p style={{ ...ui.sub, marginBottom: 14 }}>No upcoming events here yet. Running one? List it free.</p>
            <Link href="/events/new" style={ui.btn}>List an event</Link>
          </div>
        ) : (
          Array.from(groups.entries()).map(([month, list]) => (
            <section key={month} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px' }}>{month}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {list.map(e => {
                  const start = new Date(e.starts_on + 'T00:00:00')
                  const spec = getSpecialty(e.topic)
                  const n = goingCount.get(e.id) || 0
                  return (
                    <article key={e.id} style={{ ...ui.card, display: 'flex', gap: 12 }}>
                      <div style={{ width: 56, flexShrink: 0, borderRadius: 10, background: '#EFF6FF', color: '#1D4ED8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 0', alignSelf: 'flex-start' }}>
                        <div style={{ fontSize: 20, fontWeight: 800 }}>{start.getDate()}</div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{start.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</div>
                      </div>
                      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ ...ui.pill('#FEF3C7', '#92400E'), fontSize: 11, padding: '2px 8px' }}>{EVENT_KIND_LABEL[e.kind] || 'Event'}</span>
                          {e.gives_certificate && <span style={{ ...ui.pill('#ECFDF5', '#065F46'), fontSize: 11, padding: '2px 8px' }}>Certificate</span>}
                          {spec && <span style={{ ...ui.pill(spec.bg, spec.color), fontSize: 11, padding: '2px 8px' }}>{spec.label}</span>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{e.title}</div>
                        <div style={{ fontSize: 13, color: '#475569' }}>
                          {e.is_online ? 'Online' : (cityNameOf(e.city) || e.city || 'India')}
                          {e.ends_on && e.ends_on !== e.starts_on ? ` · until ${new Date(e.ends_on + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                          {e.fee_text ? ` · ${e.fee_text}` : ''}
                        </div>
                        {e.organiser && <div style={{ fontSize: 13, color: '#475569' }}>By {e.organiser}</div>}
                        {e.description && <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{e.description}</p>}
                        {n > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>{n} DentistIn dentist{n === 1 ? '' : 's'} going</div>}
                        <EventActions eventId={e.id} signedIn={!!viewer} initial={mine.get(e.id) || { going: false, remind: false }} link={typeof e.link === 'string' && /^https?:\/\//.test(e.link) ? e.link : null} />
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </NationalShell>
  )
}
