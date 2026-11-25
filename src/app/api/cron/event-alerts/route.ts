// Vercel cron — daily 10:30 AM IST (05:00 UTC). Alerts for paid Featured
// events and courses (src/lib/eventAlerts.ts):
//   live     → once, the first run after the listing is approved and paid
//   reminder → once, when the event starts in 2 days (IST)
//
// Dry run unless EVENT_ALERTS_ENABLED=true: it reports who would get what
// and sends nothing. WhatsApp also needs WHATSAPP_ENABLED=true and the two
// MARKETING templates approved by Meta.
//
// Also fills featured_until for listings paid after they were approved.
// Required env: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/national'
import { eventAlertsEnabled, sendEventAlerts } from '@/lib/eventAlerts'
import { featuredUntil, istToday } from '@/lib/eventFeatured'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const live = eventAlertsEnabled()
  const db = adminDb()
  const today = istToday()
  const inTwoDays = new Date(Date.parse(today) + 2 * 86400000).toISOString().slice(0, 10)

  const { data, error } = await db.from('events').select('*')
    .eq('status', 'approved').eq('plan', 'featured').eq('payment_status', 'paid')
    .gte('starts_on', today).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const report: Array<Record<string, unknown>> = []
  for (const ev of (data || []) as Array<Record<string, any>>) {
    if (!ev.featured_until) {
      const until = featuredUntil(ev)
      if (until) await db.from('events').update({ featured_until: until }).eq('id', ev.id)
    }
    let liveSentAt = ev.alert_live_sent_at ? Date.parse(ev.alert_live_sent_at) : 0
    if (!liveSentAt && ev.starts_on > today) {
      const s = await sendEventAlerts(db, ev, 'live', live)
      if (live && s.todo > 0 && s.failed < s.todo) {
        liveSentAt = Date.now()
        await db.from('events').update({ alert_live_sent_at: new Date(liveSentAt).toISOString() }).eq('id', ev.id)
      }
      report.push({ id: ev.id, title: ev.title, kind: 'live', ...s })
    }
    // Listed late: if the "now live" alert went out in the last 36 hours,
    // that one doubles as the reminder, so nobody gets two in a row.
    if (!ev.alert_reminder_sent_at && ev.starts_on === inTwoDays && liveSentAt && Date.now() - liveSentAt < 36 * 3600000) {
      if (live) await db.from('events').update({ alert_reminder_sent_at: new Date().toISOString() }).eq('id', ev.id)
      report.push({ id: ev.id, title: ev.title, kind: 'reminder', skipped: 'live alert sent recently' })
    } else if (!ev.alert_reminder_sent_at && ev.starts_on === inTwoDays) {
      const s = await sendEventAlerts(db, ev, 'reminder', live)
      if (live && s.todo > 0 && s.failed < s.todo) await db.from('events').update({ alert_reminder_sent_at: new Date().toISOString() }).eq('id', ev.id)
      report.push({ id: ev.id, title: ev.title, kind: 'reminder', ...s })
    }
  }
  return NextResponse.json({ success: true, live, today, alerts: report })
}
