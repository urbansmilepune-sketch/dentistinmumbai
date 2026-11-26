// Vercel cron — daily 10:30 AM IST (05:00 UTC). Follow-up photo reminders
// for the dentist network (v2, Nov 2026): 3, 6 and 12 months after a case
// was posted, the author gets one WhatsApp asking for a follow-up photo or
// X-ray, linking to the case page where "Add follow-up" sits.
//
// A milestone only fires inside its one-month window (e.g. 6 to 7 months
// after posting), so old cases never get a burst of overdue reminders. It
// is skipped if the case already has a follow-up for that milestone or
// later, and each (case, milestone) is sent once: case_followup_reminders.
//
// Off by default: dry run (counts only, sends nothing) until
// CASE_FOLLOWUP_REMINDERS_ENABLED=true, WHATSAPP_ENABLED=true and the MSG91
// template case_followup_reminder is approved. Without the
// case_followup_reminders table it also stays a dry run.
//
// Required env: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from 'next/server'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { adminDb, AFTER_KINDS } from '@/lib/national'
import { cleanName } from '@/lib/dentistName'
import { casePath } from '@/lib/caseSlug'
import { sendCaseFollowupReminderWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MILESTONES = [12, 6, 3]
const DAY = 86400000
const MONTH_DAYS = 30.44

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = adminDb()
  const probe = await db.from('case_followup_reminders').select('case_id', { head: true, count: 'exact' }).limit(1)
  const tableReady = !probe.error
  const live = process.env.CASE_FOLLOWUP_REMINDERS_ENABLED === 'true' && whatsAppEnabled() && tableReady

  const now = Date.now()
  const oldest = new Date(now - 13 * MONTH_DAYS * DAY).toISOString()
  const newest = new Date(now - 3 * MONTH_DAYS * DAY).toISOString()
  const { data: rows, error } = await db
    .from('cases').select('id, title, created_at, dentist_id, dentists(name, phone, whatsapp, is_active, city)')
    .eq('status', 'approved').gte('created_at', oldest).lte('created_at', newest).limit(2000)
  if (error) return NextResponse.json({ error: 'Could not read cases' }, { status: 500 })
  const cases = (rows || []) as Array<Record<string, any>>

  // Which milestone (if any) each case is in today.
  const due: Array<{ c: Record<string, any>; m: number }> = []
  for (const c of cases) {
    const months = (now - new Date(c.created_at).getTime()) / (MONTH_DAYS * DAY)
    const m = MILESTONES.find(x => months >= x && months < x + 1)
    if (m) due.push({ c, m })
  }
  if (!due.length) return NextResponse.json({ success: true, live, due: 0, sent: 0 })

  const ids = due.map(d => d.c.id)
  const [{ data: photos }, sentRes] = await Promise.all([
    db.from('case_photos').select('*').in('case_id', ids).in('kind', AFTER_KINDS),
    tableReady ? db.from('case_followup_reminders').select('case_id, months').in('case_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])
  const bestFollowup = new Map<string, number>()
  for (const p of (photos || []) as Array<Record<string, any>>) {
    const m = Number(p.months_after) || 0
    if (m > (bestFollowup.get(p.case_id) || 0)) bestFollowup.set(p.case_id, m)
  }
  const already = new Set(((sentRes as any).data || []).map((r: any) => `${r.case_id}:${r.months}`))

  let wouldSend = 0, sent = 0, failed = 0, hasFollowup = 0, alreadySent = 0, noPhone = 0
  for (const { c, m } of due) {
    if ((bestFollowup.get(c.id) || 0) >= m) { hasFollowup++; continue }
    if (already.has(`${c.id}:${m}`)) { alreadySent++; continue }
    const d = c.dentists || {}
    if (d.is_active === false) continue
    const phone = d.whatsapp || d.phone
    if (!phone) { noPhone++; continue }
    wouldSend++
    if (!live) continue
    const res = await sendCaseFollowupReminderWhatsApp({
      dentistPhone: phone,
      firstName: cleanName(d.name).split(' ')[0] || 'Doctor',
      months: m,
      caseTitle: String(c.title || 'your case').slice(0, 80),
      link: `${NATIONAL_ORIGIN}${casePath({ id: c.id, title: c.title, city: d.city })}`,
    })
    if (res.success) {
      sent++
      await db.from('case_followup_reminders').insert({ case_id: c.id, months: m })
    } else {
      failed++
    }
  }

  return NextResponse.json({
    success: true, live, table_ready: tableReady, due: due.length,
    would_send: wouldSend, sent, failed, has_followup: hasFollowup, already_sent: alreadySent, no_phone: noPhone,
  })
}
