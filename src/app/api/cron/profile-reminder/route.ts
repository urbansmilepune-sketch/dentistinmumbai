// Vercel cron — daily profile-completion nudge for new dentists.
// Schedule lives in /vercel.json (0 3 * * * UTC = 8:30 IST).
//
// Eligibility: active, joined >2d ago, completion < 80%, no email in last 7d,
// and not opted out. Completion = 4 patient-facing essentials (photo, bio,
// working hours, ≥1 treatment) — kept narrower than the dashboard's 5-item
// checklist on purpose so a half-finished bio doesn't keep nagging forever.
//
// Required env:
//   CRON_SECRET                 — Vercel cron auth (Bearer header)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   — bypass RLS for cross-dentist reads/writes
//   RESEND_API_KEY              — same Resend client as src/lib/email.ts
//   NEXT_PUBLIC_SITE_URL        — base for the unsubscribe URL (optional;
//                                 falls back to dentistinmumbai.in)
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendProfileReminderEmail } from '@/lib/email'
import { CITY_CONFIGS } from '@/config/cities'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const REMINDER_COOLDOWN_DAYS = 7
const REGISTRATION_MIN_AGE_DAYS = 2
const COMPLETION_THRESHOLD_PCT = 80
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dentistinmumbai.in'

type DentistRow = {
  id: string
  name: string | null
  email: string | null
  profile_photo: string | null
  bio: string | null
  working_hours: unknown
  reminder_email_sent_at: string | null
  city: string | null
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

  const cutoffIso = new Date(Date.now() - REGISTRATION_MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const cooldownIso = new Date(Date.now() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // .or() handles "never reminded OR last reminded >7d ago" in one filter.
  const { data: dentists, error: dentErr } = await db
    .from('dentists')
    .select('id, name, email, profile_photo, bio, working_hours, reminder_email_sent_at, city')
    .eq('is_active', true)
    .eq('email_reminders_opt_out', false)
    .lt('created_at', cutoffIso)
    .or(`reminder_email_sent_at.is.null,reminder_email_sent_at.lt.${cooldownIso}`)

  if (dentErr) {
    console.error('[cron/profile-reminder] dentist fetch failed', dentErr)
    return NextResponse.json({ error: dentErr.message }, { status: 500 })
  }
  const rows = (dentists ?? []) as DentistRow[]
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, eligible: 0, sent: 0 })
  }

  // Treatment counts in one round-trip — count(*) per dentist_id for the
  // eligible set only. Cheaper than N per-dentist count queries.
  const { data: treatmentRows } = await db
    .from('dentist_treatments')
    .select('dentist_id')
    .in('dentist_id', rows.map(r => r.id))
  const treatmentCounts = new Map<string, number>()
  for (const t of (treatmentRows ?? []) as Array<{ dentist_id: string }>) {
    treatmentCounts.set(t.dentist_id, (treatmentCounts.get(t.dentist_id) ?? 0) + 1)
  }

  let sent = 0
  const failures: Array<{ id: string; reason: string }> = []

  for (const d of rows) {
    if (!d.email || !d.name) continue

    const checks = [
      { label: 'Upload a profile photo', href: '/for-dentists/dashboard/photos', done: !!d.profile_photo },
      { label: 'Write a short bio (20+ chars)', href: '/for-dentists/dashboard/profile', done: !!(d.bio && d.bio.length > 20) },
      { label: 'Set your working hours', href: '/for-dentists/dashboard/hours', done: d.working_hours != null },
      { label: 'Add at least one treatment', href: '/for-dentists/dashboard/treatments', done: (treatmentCounts.get(d.id) ?? 0) >= 1 },
    ]
    const doneCount = checks.filter(c => c.done).length
    const pct = Math.round((doneCount / checks.length) * 100)
    if (pct >= COMPLETION_THRESHOLD_PCT) continue

    const missing = checks.filter(c => !c.done).map(({ label, href }) => ({ label, href }))
    // Build the unsubscribe URL against the dentist's own city domain when
    // possible — falls back to NEXT_PUBLIC_SITE_URL / dentistinmumbai.in.
    const dentistOrigin = d.city && CITY_CONFIGS.hasOwnProperty(d.city)
      ? `https://${(CITY_CONFIGS as any)[d.city].domain}`
      : SITE_URL
    const unsubscribeUrl = `${dentistOrigin}/api/email/unsubscribe?id=${encodeURIComponent(d.id)}`

    try {
      await sendProfileReminderEmail({
        name: d.name,
        to_email: d.email,
        completion_pct: pct,
        missing,
        unsubscribe_url: unsubscribeUrl,
        city: d.city ?? undefined,
      })
      // Only stamp on success so a transient send failure stays retryable
      // on the next run instead of being silently 7-day-cooled-down.
      await db.from('dentists').update({ reminder_email_sent_at: new Date().toISOString() }).eq('id', d.id)
      sent++
    } catch (err: any) {
      console.error('[cron/profile-reminder] send failed', { dentist_id: d.id, err: err?.message })
      failures.push({ id: d.id, reason: err?.message || 'unknown' })
    }
  }

  return NextResponse.json({ ok: true, eligible: rows.length, sent, failures: failures.length })
}
