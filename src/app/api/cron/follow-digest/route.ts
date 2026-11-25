// Vercel cron — Mondays 9:30 AM IST (04:00 UTC). Weekly follow alerts for
// the dentist network: every dentist who follows someone gets one WhatsApp
// summarising new cases from the people they follow, e.g.
//   "Dr. Mehta posted a new implant case, and 2 more cases from dentists you follow"
// with a link to the case library's Following tab. Nobody with nothing new
// gets a message.
//
// Off by default. Until FOLLOW_DIGEST_ENABLED=true (and the MSG91 template
// network_weekly_digest is approved) this runs as a dry run: it builds the
// digests and returns how many would be sent, but sends nothing.
//
// Dedupe: dentists.follow_digest_sent_at (national-v1/3-follow-digest.sql).
// A dentist is skipped if they got a digest in the last 6 days, and only
// cases newer than their last digest are counted.
//
// Required env: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// plus the WhatsApp env in src/lib/whatsapp.ts when enabled.

import { NextRequest, NextResponse } from 'next/server'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { adminDb } from '@/lib/national'
import { cleanName } from '@/lib/dentistName'
import { newCasesFromFollowed, digestLine, sinceDaysAgo, DIGEST_DAYS } from '@/lib/followDigest'
import { sendFollowDigestWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const live = process.env.FOLLOW_DIGEST_ENABLED === 'true' && whatsAppEnabled()
  const db = adminDb()

  const { data: edges, error } = await db.from('dentist_follows').select('follower_id').limit(20000)
  if (error) return NextResponse.json({ error: 'Could not read follows' }, { status: 500 })
  const followerIds = Array.from(new Set((edges || []).map((e: any) => e.follower_id as string)))
  if (!followerIds.length) return NextResponse.json({ success: true, live, followers: 0, sent: 0, would_send: 0 })

  const { data: people, error: pErr } = await db.from('dentists').select('*').in('id', followerIds)
  if (pErr) return NextResponse.json({ error: 'Could not read dentists' }, { status: 500 })
  const canDedupe = !!people?.length && 'follow_digest_sent_at' in (people[0] as object)
  // Without the dedupe column a live run could repeat on a retry, so stay dry.
  const sendNow = live && canDedupe

  const sixDaysAgo = Date.now() - 6 * 86400000
  const link = `${NATIONAL_ORIGIN}/cases?f=following`
  let wouldSend = 0, sent = 0, failed = 0, skippedRecent = 0, nothingNew = 0, noPhone = 0

  for (const d of (people || []) as Array<Record<string, any>>) {
    if (d.is_active === false) continue
    const last = d.follow_digest_sent_at ? new Date(d.follow_digest_sent_at).getTime() : 0
    if (last && last > sixDaysAgo) { skippedRecent++; continue }
    const since = last ? new Date(Math.max(last, Date.parse(sinceDaysAgo(DIGEST_DAYS)))).toISOString() : sinceDaysAgo(DIGEST_DAYS)
    const cases = await newCasesFromFollowed(db, d.id, since)
    if (!cases.length) { nothingNew++; continue }
    const phone = d.whatsapp || d.phone
    if (!phone) { noPhone++; continue }
    wouldSend++
    if (!sendNow) continue
    const res = await sendFollowDigestWhatsApp({
      dentistPhone: phone,
      firstName: cleanName(d.name).split(' ')[0] || 'Doctor',
      summary: digestLine(cases),
      link,
    })
    if (res.success) {
      sent++
      await db.from('dentists').update({ follow_digest_sent_at: new Date().toISOString() }).eq('id', d.id)
    } else {
      failed++
    }
  }

  return NextResponse.json({
    success: true, live: sendNow, followers: followerIds.length,
    would_send: wouldSend, sent, failed, skipped_recent: skippedRecent, nothing_new: nothingNew, no_phone: noPhone,
  })
}
