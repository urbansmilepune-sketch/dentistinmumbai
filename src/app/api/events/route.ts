// POST /api/events — submit an event or course for the calendar. Anyone
// can submit (organisers are often not dentists); every submission lands
// as 'pending' and only shows on /events once the team approves it.
//
// plan 'featured' (Nov 2026): the organiser picks cities or All India and
// 7/15/30 days; the price is worked out here again from the same table the
// form uses (src/lib/eventPricing.ts), never taken from the browser. With
// EVENT_PAYMENTS_ENABLED=true we also create a Razorpay payment link and
// return it; otherwise the request is saved as payment pending.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist, isMissingColumnError } from '@/lib/national'
import { clientIp, withinRateLimit, blockedIpResponse } from '@/lib/apiGuards'
import { SPECIALTIES } from '@/lib/dentalSpecialties'
import { CITY_CONFIGS } from '@/config/cities'
import { quoteFeatured, isFeatureDays } from '@/lib/eventPricing'
import { activeDentistCounts } from '@/lib/eventAlerts'
import { createEventPaymentLink } from '@/lib/eventPayments'
import { sendListingReceivedEmail } from '@/lib/eventEmails'

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

  const phone = cap(b.phone, 20)
  if (phone && phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Check the WhatsApp number' }, { status: 400 })

  const db = adminDb()
  const featured = b.plan === 'featured'
  let feature: Record<string, unknown> = {}
  if (featured) {
    const allIndia = b.feature_all_india === true
    const cities: string[] = Array.isArray(b.feature_cities)
      ? Array.from(new Set((b.feature_cities as unknown[]).filter((c): c is string => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, c)))).slice(0, 20)
      : []
    const days = Number(b.feature_days)
    if (!isFeatureDays(days)) return NextResponse.json({ error: 'Pick 7, 15 or 30 days' }, { status: 400 })
    if (!allIndia && !cities.length) return NextResponse.json({ error: 'Pick at least one city, or All India' }, { status: 400 })
    const q = quoteFeatured({ allIndia, cities, days, counts: await activeDentistCounts(db) })
    feature = {
      plan: 'featured', feature_all_india: allIndia, feature_cities: allIndia ? [] : cities, feature_days: days,
      alert_dentists: q.dentists, amount_rupees: q.total, payment_status: 'pending',
      custom_alert_request: cap(b.custom_alert_request, 400),
    }
  }

  const viewer = await getViewerDentist()
  const base = {
    title, kind, topic, city: isOnline ? null : city, is_online: isOnline,
    starts_on: startsOn, ends_on: endsOn,
    organiser: cap(b.organiser, 160), fee_text: cap(b.fee_text, 80), link,
    description: cap(b.description, 600),
    gives_certificate: b.gives_certificate === true,
    status: 'pending', submitted_by: viewer?.id ?? null, submitter_email: email,
  }
  let ins = await db.from('events').insert({ ...base, ...feature, submitter_phone: phone }).select('id').single()
  // Before the events v2 SQL runs, the new columns don't exist: a free
  // listing still saves the old way, a Featured one has to wait.
  if (ins.error && isMissingColumnError(ins.error) && !featured) {
    ins = await db.from('events').insert(base).select('id').single()
  }
  const { data, error } = ins
  if (error || !data) {
    const missing = isMissingColumnError(error)
    const msg = missing ? 'Featured listings open after a short update. Please choose the free listing, or try again soon.' : `Could not save: ${error?.message || 'unknown error'}`
    return NextResponse.json({ error: msg }, { status: missing ? 503 : 500 })
  }
  const id = (data as { id: string }).id

  let payUrl: string | null = null
  if (featured) {
    const link = await createEventPaymentLink({
      id, title, amount_rupees: feature.amount_rupees as number, submitter_email: email, submitter_phone: phone, organiser: base.organiser,
    })
    if (link.ok) {
      payUrl = link.url
      await db.from('events').update({ payment_link_id: link.id, payment_link_url: link.url }).eq('id', id)
    }
  }
  await sendListingReceivedEmail({ to: email, id, title, featured, amount: featured ? (feature.amount_rupees as number) : null, payUrl })
  return NextResponse.json({ success: true, id, pay_url: payUrl })
}
