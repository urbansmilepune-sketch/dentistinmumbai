// Vercel cron — nightly rank_score recompute for every active dentist.
// Schedule lives in /vercel.json (recommend 0 19 * * * UTC = 00:30 IST,
// after the day's traffic but before morning listings render).
//
// rank_score is the universal default ORDER BY on listing/search surfaces
// (see src/app/dentists/page.tsx, src/app/area/[slug]/page.tsx,
// src/lib/cache/public-pages.ts). Score is a weighted sum of profile
// completeness, review quality, booking volume, approval discipline,
// engagement, and recency, then multiplied by the dentist's tier — so a
// featured-tier dentist with strong fundamentals outranks a free-tier
// dentist with the same fundamentals.
//
// Required env:
//   CRON_SECRET                 — Vercel cron auth (Bearer header)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   — bypass RLS for cross-dentist reads/writes
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_SIZE = 50
const DAY_MS = 24 * 60 * 60 * 1000

const TIER_MULTIPLIER: Record<string, number> = {
  free: 1.0,
  silver: 1.2,
  gold: 1.5,
  featured: 2.0,
}

type DentistRow = {
  id: string
  tier: string | null
  profile_photo: string | null
  bio: string | null
  qualifications: string | null
  working_hours: Record<string, unknown> | null
  address: string | null
  avg_rating: number | null
  review_count: number | null
}

type AppointmentRow = {
  dentist_id: string
  status: string | null
  created_at: string
}

type AnalyticsRow = {
  dentist_id: string
}

function profileScore(d: DentistRow): number {
  let s = 0
  if (d.profile_photo) s += 5
  if (d.bio && d.bio.length > 50) s += 5
  if (d.qualifications) s += 4
  if (d.working_hours && Object.keys(d.working_hours).length > 0) s += 3
  if (d.address) s += 3
  return s
}

function reviewScore(d: DentistRow): number {
  const rating = d.avg_rating ?? 0
  const count = d.review_count ?? 0
  return (rating / 5) * 15 + (Math.min(count, 20) / 20) * 5
}

function bookingScore(count30d: number): number {
  return (Math.min(count30d, 30) / 30) * 20
}

function approvalScore(confirmed: number, cancelled: number): number {
  const total = confirmed + cancelled
  const ratio = total === 0 ? 0.5 : confirmed / total
  return ratio * 20
}

function engagementScore(eventCount30d: number): number {
  return (Math.min(eventCount30d, 50) / 50) * 10
}

function recencyScore(lastAppointmentAt: string | null): number {
  if (!lastAppointmentAt) return 0
  const days = (Date.now() - new Date(lastAppointmentAt).getTime()) / DAY_MS
  if (days <= 7) return 10
  if (days <= 30) return 7
  if (days <= 90) return 4
  return 0
}

export async function GET(request: NextRequest) {
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Reject anything
  // else so the endpoint can't be triggered from the public internet.
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = Date.now()
  const thirtyDaysAgoIso = new Date(now - 30 * DAY_MS).toISOString()
  const ninetyDaysAgoIso = new Date(now - 90 * DAY_MS).toISOString()

  // 1. Active dentists — all fields needed for scoring in one fetch.
  const { data: dentists, error: dentErr } = await db
    .from('dentists')
    .select('id, tier, profile_photo, bio, qualifications, working_hours, address, avg_rating, review_count')
    .eq('is_active', true)

  if (dentErr) {
    console.error('[cron/rank-scores] dentist fetch failed', dentErr)
    return NextResponse.json({ error: dentErr.message }, { status: 500 })
  }
  const rows = (dentists ?? []) as DentistRow[]
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, total: 0, updated: 0, failed: 0 })
  }

  // 2. Appointments in the last 90 days — covers the 30d window (booking,
  // recency) and the 90d window (approval) in one round-trip.
  const { data: appts, error: apptErr } = await db
    .from('appointments')
    .select('dentist_id, status, created_at')
    .gte('created_at', ninetyDaysAgoIso)

  if (apptErr) {
    console.error('[cron/rank-scores] appointments fetch failed', apptErr)
    return NextResponse.json({ error: apptErr.message }, { status: 500 })
  }

  // 3. Engagement-relevant analytics in the last 30 days. booking_click and
  // case_share are deliberately excluded — the spec counts patient-side
  // contact intent, not author attribution.
  const { data: events, error: eventErr } = await db
    .from('analytics_events')
    .select('dentist_id')
    .in('event_type', ['profile_view', 'whatsapp_click', 'call_click'])
    .gte('created_at', thirtyDaysAgoIso)

  if (eventErr) {
    console.error('[cron/rank-scores] analytics fetch failed', eventErr)
    return NextResponse.json({ error: eventErr.message }, { status: 500 })
  }

  // 4. Build per-dentist aggregate maps in a single pass over each result set.
  const apptCount30d = new Map<string, number>()
  const confirmed90d = new Map<string, number>()
  const cancelled90d = new Map<string, number>()
  const lastApptAt = new Map<string, string>()
  for (const a of (appts ?? []) as AppointmentRow[]) {
    if (a.created_at >= thirtyDaysAgoIso) {
      apptCount30d.set(a.dentist_id, (apptCount30d.get(a.dentist_id) ?? 0) + 1)
    }
    if (a.status === 'confirmed') {
      confirmed90d.set(a.dentist_id, (confirmed90d.get(a.dentist_id) ?? 0) + 1)
    } else if (a.status === 'cancelled') {
      cancelled90d.set(a.dentist_id, (cancelled90d.get(a.dentist_id) ?? 0) + 1)
    }
    const prev = lastApptAt.get(a.dentist_id)
    if (!prev || a.created_at > prev) lastApptAt.set(a.dentist_id, a.created_at)
  }

  const eventCount30d = new Map<string, number>()
  for (const e of (events ?? []) as AnalyticsRow[]) {
    eventCount30d.set(e.dentist_id, (eventCount30d.get(e.dentist_id) ?? 0) + 1)
  }

  // 5. Score and update in batches of 50 — parallel updates inside the batch,
  // serial batches so a slow Supabase doesn't pile up 500 concurrent writes.
  let updated = 0
  const failures: Array<{ id: string; reason: string }> = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(async (d) => {
      const base =
        profileScore(d) +
        reviewScore(d) +
        bookingScore(apptCount30d.get(d.id) ?? 0) +
        approvalScore(confirmed90d.get(d.id) ?? 0, cancelled90d.get(d.id) ?? 0) +
        engagementScore(eventCount30d.get(d.id) ?? 0) +
        recencyScore(lastApptAt.get(d.id) ?? null)

      const multiplier = TIER_MULTIPLIER[d.tier ?? 'free'] ?? 1.0
      const rank_score = base * multiplier

      const { error } = await db.from('dentists').update({ rank_score }).eq('id', d.id)
      if (error) throw new Error(error.message)
      return d.id
    }))

    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled') {
        updated++
      } else {
        const id = batch[j].id
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
        console.error('[cron/rank-scores] update failed', { dentist_id: id, reason })
        failures.push({ id, reason })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    updated,
    failed: failures.length,
    failures: failures.slice(0, 20), // cap so a wholesale outage doesn't blow up the response
  })
}
