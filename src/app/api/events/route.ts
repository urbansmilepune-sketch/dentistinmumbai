// POST /api/events — submit an event or course for the calendar. Anyone
// can submit (organisers are often not dentists); every submission lands
// as 'pending' and only shows on /events once the team approves it.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist, isMissingColumnError } from '@/lib/national'
import { clientIp, withinRateLimit, blockedIpResponse } from '@/lib/apiGuards'
import { SPECIALTIES } from '@/lib/dentalSpecialties'
import { CITY_CONFIGS } from '@/config/cities'

const KINDS = ['exhibition', 'course', 'seminar', 'study_club', 'conference']

function cap(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function isoDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

export async function POST(request: NextRequest) {
  const blocked = blockedIpResponse(request)
  if (blocked) return blocked
  if (!withinRateLimit(`event-submit:${clientIp(request)}`, 5)) {
    return NextResponse.json({ error: 'Too many submissions. Please try again in an hour.' }, { status: 429 })
  }

  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (typeof b.website === 'string' && b.website) return NextResponse.json({ success: true }) // honeypot

  const title = cap(b.title, 160)
  const kind = KINDS.includes(b.kind) ? b.kind : null
  const startsOn = isoDate(b.starts_on)
  const endsOn = isoDate(b.ends_on)
  const isOnline = b.is_online === true
  const city = typeof b.city === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, b.city) ? b.city : null
  const topic = SPECIALTIES.some(s => s.slug === b.topic) ? b.topic : null
  const link = cap(b.link, 400)
  const email = cap(b.email, 200)

  if (!title) return NextResponse.json({ error: 'Add the event name' }, { status: 400 })
  if (!kind) return NextResponse.json({ error: 'Pick the event type' }, { status: 400 })
  if (!startsOn) return NextResponse.json({ error: 'Add the start date' }, { status: 400 })
  if (startsOn < new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: 'The start date has already passed' }, { status: 400 })
  if (endsOn && endsOn < startsOn) return NextResponse.json({ error: 'The end date is before the start date' }, { status: 400 })
  if (!isOnline && !city) return NextResponse.json({ error: 'Pick the city, or mark it as online' }, { status: 400 })
  if (link && !/^https?:\/\//.test(link)) return NextResponse.json({ error: 'The link must start with https://' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Add a contact email so we can confirm the listing' }, { status: 400 })

  const viewer = await getViewerDentist()
  const { error } = await adminDb().from('events').insert({
    title, kind, topic, city: isOnline ? null : city, is_online: isOnline,
    starts_on: startsOn, ends_on: endsOn,
    organiser: cap(b.organiser, 160), fee_text: cap(b.fee_text, 80), link,
    description: cap(b.description, 600),
    gives_certificate: b.gives_certificate === true,
    status: 'pending', submitted_by: viewer?.id ?? null, submitter_email: email,
  })
  if (error) {
    const msg = isMissingColumnError(error) ? 'Event listing opens after the database update. Please try again soon.' : `Could not save: ${error.message}`
    return NextResponse.json({ error: msg }, { status: isMissingColumnError(error) ? 503 : 500 })
  }
  return NextResponse.json({ success: true })
}
