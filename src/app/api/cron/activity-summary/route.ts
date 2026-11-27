// Vercel cron — every day 7 PM IST (13:30 UTC). DentistIn India activity
// summaries (src/lib/networkAlerts.ts):
//
// 1. Phone alert: "Your day on DentistIn India: 2 new followers and 3 likes
//    on ..." for alerts that have not been pushed yet (likes, follows,
//    helpful marks, and replies that came in during quiet hours or within
//    the hour of an earlier reply alert). Free. Only reaches dentists who
//    turned on alerts in the dentist app.
// 2. WhatsApp (template network_activity_summary): only when
//    - the dentist has unseen alerts at least 3 hours old that no WhatsApp
//      has covered yet, and has not opened dentistinindia.in since then,
//    - their last summary was more than 3.5 days ago (so at most twice a
//      week), it is not Monday (the follow digest day), and
//    - "Activity summary" is on in their Alert settings (STOP turns it off).
//    Off until ACTIVITY_WHATSAPP_ENABLED=true (after Meta approves the
//    template) and WHATSAPP_ENABLED=true; until then it is a dry run that
//    reports how many would be sent.
//
// ?dry=1 forces a dry run for both parts (for testing).
// Required env: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/national'
import { cleanName } from '@/lib/dentistName'
import { PUSH_ALERTS_URL, REPLY_KINDS, istWeekday, readPrefs, summaryLine, type AlertKind } from '@/lib/networkAlerts'
import { notifyNetwork, pushConfigured } from '@/lib/push'
import { sendActivitySummaryWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'
import { waAlertsLink } from '@/lib/waLoginLink'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Row = { id: string; recipient_id: string; kind: AlertKind; case_id: string | null; created_at: string; pushed_at: string | null; whatsapp_at: string | null }

const WA_MIN_GAP_MS = 3.5 * 86400000
const WA_MIN_AGE_MS = 3 * 3600000
const LOOKBACK_MS = 14 * 86400000

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const waLive = !dry && process.env.ACTIVITY_WHATSAPP_ENABLED === 'true' && whatsAppEnabled()
  const pushLive = !dry && pushConfigured()
  const db = adminDb()
  const now = Date.now()

  // Unseen alerts from the last 14 days, paged past the 1,000-row cap.
  const rows: Row[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from('network_alerts')
      .select('id, recipient_id, kind, case_id, created_at, pushed_at, whatsapp_at')
      .is('seen_at', null).gte('created_at', new Date(now - LOOKBACK_MS).toISOString())
      .order('created_at').range(from, from + 999)
    if (error) return NextResponse.json({ error: 'Could not read alerts (has the SQL been run?)', detail: error.message }, { status: 500 })
    rows.push(...((data || []) as Row[]))
    if (!data || data.length < 1000) break
  }
  if (!rows.length) return NextResponse.json({ success: true, wa_live: waLive, push_live: pushLive, dentists: 0 })

  const byDentist = new Map<string, Row[]>()
  for (const r of rows) {
    if (!byDentist.has(r.recipient_id)) byDentist.set(r.recipient_id, [])
    byDentist.get(r.recipient_id)!.push(r)
  }
  const ids = Array.from(byDentist.keys())
  const people: Array<Record<string, any>> = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('dentists')
      .select('id, name, phone, whatsapp, is_active, network_alert_prefs, network_seen_at, alerts_whatsapp_at')
      .in('id', ids.slice(i, i + 200))
    if (error) return NextResponse.json({ error: 'Could not read dentists', detail: error.message }, { status: 500 })
    people.push(...(data || []))
  }

  const caseIds = Array.from(new Set(rows.map(r => r.case_id).filter(Boolean))) as string[]
  const titles = new Map<string, string>()
  for (let i = 0; i < caseIds.length; i += 200) {
    const { data } = await db.from('cases').select('id, title').in('id', caseIds.slice(i, i + 200))
    for (const c of (data || []) as any[]) titles.set(c.id, String(c.title || ''))
  }

  const monday = istWeekday(now) === 1
  const stamp = new Date().toISOString()
  const out = { push_would: 0, push_sent: 0, wa_would: 0, wa_sent: 0, wa_failed: 0, wa_skip_recent: 0, wa_skip_seen: 0, wa_skip_off: 0, wa_no_phone: 0 }

  for (const d of people) {
    if (d.is_active === false) continue
    const mine = byDentist.get(d.id) || []
    const prefs = readPrefs(d.network_alert_prefs)

    // 1. Phone summary.
    const toPush = mine.filter(r => !r.pushed_at && (REPLY_KINDS.includes(r.kind) ? prefs.push_replies : prefs.push_summary))
    if (toPush.length) {
      out.push_would++
      if (pushLive) {
        const ok = await notifyNetwork(d.id, {
          title: 'Your day on DentistIn India',
          body: summaryLine(toPush, titles),
          url: PUSH_ALERTS_URL,
          tag: 'din-activity-summary',
        })
        if (ok) {
          out.push_sent++
          await db.from('network_alerts').update({ pushed_at: stamp }).in('id', toPush.map(r => r.id))
        }
      }
    }

    // 2. WhatsApp summary.
    if (monday) continue
    if (!prefs.whatsapp_summary) { out.wa_skip_off++; continue }
    const lastWa = d.alerts_whatsapp_at ? Date.parse(d.alerts_whatsapp_at) : 0
    if (lastWa && now - lastWa < WA_MIN_GAP_MS) { out.wa_skip_recent++; continue }
    const seenAt = d.network_seen_at ? Date.parse(d.network_seen_at) : 0
    const pending = mine.filter(r => !r.whatsapp_at)
    const due = pending.filter(r => now - Date.parse(r.created_at) >= WA_MIN_AGE_MS && Date.parse(r.created_at) > seenAt)
    if (!due.length) { if (pending.length) out.wa_skip_seen++; continue }
    const phone = d.whatsapp || d.phone
    if (!phone) { out.wa_no_phone++; continue }
    out.wa_would++
    if (!waLive) continue
    const res = await sendActivitySummaryWhatsApp({
      dentistPhone: phone,
      firstName: cleanName(d.name).split(' ')[0] || 'Doctor',
      summary: summaryLine(pending, titles),
      link: waAlertsLink(d.id),
    })
    if (res.success) {
      out.wa_sent++
      await db.from('network_alerts').update({ whatsapp_at: stamp }).in('id', pending.map(r => r.id))
      await db.from('dentists').update({ alerts_whatsapp_at: stamp }).eq('id', d.id)
    } else {
      out.wa_failed++
    }
  }

  return NextResponse.json({ success: true, wa_live: waLive, push_live: pushLive, monday, dentists: people.length, ...out })
}
