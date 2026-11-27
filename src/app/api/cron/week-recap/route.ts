// Vercel cron — Mondays 9:15 AM IST (03:45 UTC), just before the follow
// digest at 9:30. The "Your week on DentistIn" WhatsApp recap (template
// network_your_week, approved mockup weekly-activity/mockup.html):
//
//   "Hi Dr. Rohan, your week on DentistIn India: 34 case views from
//    dentists, 5 new followers, 12 likes and 3 replies. Dr. Sneha Patil and
//    8 others viewed "Full mouth rehab, 62M". See who it was here: <link>"
//
// Sent only when
//   - the dentist had a good week (src/lib/weeklyActivity.ts),
//   - they have not opened dentistinindia.in in the last 3 days,
//   - no recap in the last 6 days, and
//   - "Your week" recap is on in their Alert settings (STOP turns it off).
// For these dentists it replaces the Monday follow digest: new cases from
// people they follow are added to the same message, and
// follow_digest_sent_at is set so the digest skips them. One message that
// morning, not two.
//
// Off until WEEKLY_RECAP_WHATSAPP_ENABLED=true (after Meta approves the
// template) and WHATSAPP_ENABLED=true; until then it is a dry run that
// reports how many would be sent. ?dry=1 forces a dry run.
// Required env: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/national'
import { cleanName } from '@/lib/dentistName'
import { readPrefs } from '@/lib/networkAlerts'
import { loadWeek, weekSummaryLine } from '@/lib/weeklyActivity'
import { newCasesFromFollowed, digestLine, sinceDaysAgo, DIGEST_DAYS } from '@/lib/followDigest'
import { sendWeekRecapWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'
import { waWeekLink } from '@/lib/waLoginLink'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY = 86400000

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const live = !dry && process.env.WEEKLY_RECAP_WHATSAPP_ENABLED === 'true' && whatsAppEnabled()
  const db = adminDb()
  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY).toISOString()

  // Anyone with activity in the last 7 days: case views or alerts.
  const ids = new Set<string>()
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.from('case_views').select('author_id').gte('created_at', weekAgo).range(from, from + 999)
    if (error) return NextResponse.json({ error: 'Could not read case views (has the SQL been run?)', detail: error.message }, { status: 500 })
    for (const r of (data || []) as Array<{ author_id: string }>) ids.add(r.author_id)
    if (!data || data.length < 1000) break
  }
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.from('network_alerts').select('recipient_id').gte('created_at', weekAgo).range(from, from + 999)
    if (error) break
    for (const r of (data || []) as Array<{ recipient_id: string }>) ids.add(r.recipient_id)
    if (!data || data.length < 1000) break
  }
  const all = Array.from(ids)
  const out = { candidates: all.length, would_send: 0, sent: 0, failed: 0, not_good: 0, skip_off: 0, skip_recent: 0, skip_seen: 0, no_phone: 0, with_digest: 0 }
  if (!all.length) return NextResponse.json({ success: true, live, ...out })

  const people: Array<Record<string, any>> = []
  for (let i = 0; i < all.length; i += 200) {
    const { data, error } = await db.from('dentists')
      .select('id, name, phone, whatsapp, is_active, network_alert_prefs, network_seen_at, week_recap_sent_at, follow_digest_sent_at')
      .in('id', all.slice(i, i + 200))
    if (error) return NextResponse.json({ error: 'Could not read dentists (has the SQL been run?)', detail: error.message }, { status: 500 })
    people.push(...(data || []))
  }

  const stamp = new Date().toISOString()
  for (const d of people) {
    if (d.is_active === false) continue
    const prefs = readPrefs(d.network_alert_prefs)
    if (!prefs.whatsapp_week) { out.skip_off++; continue }
    const last = d.week_recap_sent_at ? Date.parse(d.week_recap_sent_at) : 0
    if (last && now - last < 6 * DAY) { out.skip_recent++; continue }
    const seen = d.network_seen_at ? Date.parse(d.network_seen_at) : 0
    if (seen && now - seen < 3 * DAY) { out.skip_seen++; continue }
    const week = await loadWeek(d.id, db, now)
    if (!week.good) { out.not_good++; continue }
    const phone = d.whatsapp || d.phone
    if (!phone) { out.no_phone++; continue }

    let summary = weekSummaryLine(week)
    // Fold in this week's follow digest, so they get one message, not two.
    const lastDigest = d.follow_digest_sent_at ? Date.parse(d.follow_digest_sent_at) : 0
    if (prefs.whatsapp_digest && !(lastDigest && now - lastDigest < 6 * DAY)) {
      const since = new Date(Math.max(lastDigest, Date.parse(sinceDaysAgo(DIGEST_DAYS)))).toISOString()
      const cases = await newCasesFromFollowed(db, d.id, since)
      if (cases.length) { summary += `. Also: ${digestLine(cases)}`; out.with_digest++ }
    }
    summary = summary.replace(/\s+/g, ' ').trim().slice(0, 900)

    out.would_send++
    if (!live) continue
    const res = await sendWeekRecapWhatsApp({
      dentistPhone: phone,
      firstName: cleanName(d.name).split(' ')[0] || 'Doctor',
      summary,
      link: waWeekLink(d.id),
    })
    if (res.success) {
      out.sent++
      await db.from('dentists').update({ week_recap_sent_at: stamp, follow_digest_sent_at: stamp }).eq('id', d.id)
    } else {
      out.failed++
    }
  }

  return NextResponse.json({ success: true, live, ...out })
}
