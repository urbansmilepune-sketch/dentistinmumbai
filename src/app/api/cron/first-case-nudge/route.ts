// Vercel cron, every day 10 AM IST (04:30 UTC). First-case nudge on WhatsApp
// (approved 27 Nov 2026, first-case/mockup.html):
//
//   - Nudge 1: a day after the dentist claimed their dentistinindia.in
//     profile. Nudge 2: four days after nudge 1 (day 5). Then never again.
//   - Only to dentists with no case at all (any status), no saved case draft
//     and no unfinished WhatsApp case from the last 7 days.
//   - Only for profiles claimed in the last 30 days, and never to dentists
//     who turned off WhatsApp summaries or replied STOP.
//   - Template network_first_case_nudge: {{1}} first name, {{2}} one-tap
//     sign-in link to /first-case. Replying with photos goes straight into
//     WhatsApp case posting.
//
// Off until FIRST_CASE_NUDGE_ENABLED=true (after Meta approves the template)
// and WHATSAPP_ENABLED=true; until then it is a dry run that reports how
// many would be sent. ?dry=1 forces a dry run.
// Needs the SQL in first-case/1-run-in-supabase.sql (two dentists columns).

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/national'
import { cleanName } from '@/lib/dentistName'
import { readPrefs } from '@/lib/networkAlerts'
import { sendFirstCaseNudgeWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'
import { waFirstCaseLink } from '@/lib/waLoginLink'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY = 86400000
const FIRST_AFTER_MS = 1 * DAY
const SECOND_AFTER_MS = 4 * DAY
const CLAIMED_WITHIN_MS = 30 * DAY
const MAX_PER_RUN = 300

type Row = { id: string; name: string | null; phone: string | null; whatsapp: string | null; network_claimed_at: string; network_alert_prefs: unknown; first_case_nudges: number | null; first_case_nudge_at: string | null }

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const live = !dry && process.env.FIRST_CASE_NUDGE_ENABLED === 'true' && whatsAppEnabled()
  const db = adminDb()
  const now = Date.now()

  // Claimed in the last 30 days and nudged fewer than 2 times.
  const rows: Row[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from('dentists')
      .select('id, name, phone, whatsapp, network_claimed_at, network_alert_prefs, first_case_nudges, first_case_nudge_at')
      .eq('is_active', true)
      .gte('network_claimed_at', new Date(now - CLAIMED_WITHIN_MS).toISOString())
      .or('first_case_nudges.is.null,first_case_nudges.lt.2')
      .order('network_claimed_at').range(from, from + 999)
    if (error) return NextResponse.json({ error: 'Could not read dentists (has first-case/1-run-in-supabase.sql been run?)', detail: error.message }, { status: 500 })
    rows.push(...((data || []) as Row[]))
    if (!data || data.length < 1000) break
  }

  const due = rows.filter(d => {
    const n = d.first_case_nudges || 0
    if (n === 0) return now - Date.parse(d.network_claimed_at) >= FIRST_AFTER_MS
    return !!d.first_case_nudge_at && now - Date.parse(d.first_case_nudge_at) >= SECOND_AFTER_MS
  })
  if (!due.length) return NextResponse.json({ success: true, live, checked: rows.length, due: 0 })

  // Anyone with a case, a saved draft or recent WhatsApp photos is skipped.
  const busy = new Set<string>()
  const weekAgo = new Date(now - 7 * DAY).toISOString()
  for (let i = 0; i < due.length; i += 200) {
    const ids = due.slice(i, i + 200).map(d => d.id)
    const [cases, drafts, wa] = await Promise.all([
      db.from('cases').select('dentist_id').in('dentist_id', ids).limit(5000),
      db.from('case_drafts').select('dentist_id').in('dentist_id', ids).limit(5000),
      db.from('whatsapp_case_drafts').select('dentist_id').in('dentist_id', ids).is('used_at', null).gte('created_at', weekAgo).limit(5000),
    ])
    if (cases.error) return NextResponse.json({ error: 'Could not read cases', detail: cases.error.message }, { status: 500 })
    for (const res of [cases, drafts, wa]) {
      for (const r of ((res.error ? [] : res.data) || []) as Array<{ dentist_id: string }>) busy.add(r.dentist_id)
    }
  }

  const out = { checked: rows.length, due: due.length, skip_has_case: 0, skip_off: 0, no_phone: 0, would: 0, sent: 0, failed: 0, first: 0, second: 0 }
  const stamp = new Date().toISOString()
  for (const d of due) {
    if (busy.has(d.id)) { out.skip_has_case++; continue }
    if (!readPrefs(d.network_alert_prefs).whatsapp_summary) { out.skip_off++; continue }
    const phone = d.whatsapp || d.phone
    if (!phone) { out.no_phone++; continue }
    out.would++
    if ((d.first_case_nudges || 0) === 0) out.first++; else out.second++
    if (!live || out.sent + out.failed >= MAX_PER_RUN) continue
    const res = await sendFirstCaseNudgeWhatsApp({
      dentistPhone: phone,
      firstName: cleanName(d.name).split(' ')[0] || 'Doctor',
      link: waFirstCaseLink(d.id),
    })
    if (res.success) {
      out.sent++
      await db.from('dentists').update({ first_case_nudges: (d.first_case_nudges || 0) + 1, first_case_nudge_at: stamp }).eq('id', d.id)
    } else {
      out.failed++
    }
  }

  return NextResponse.json({ success: true, live, ...out })
}
