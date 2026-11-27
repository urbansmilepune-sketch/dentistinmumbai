// First case for new dentists on dentistinindia.in (approved 27 Nov 2026,
// /mnt/project-files/first-case/mockup.html).
//
//  - A dentist's "first case" is their earliest case that is not rejected.
//  - First cases get a "First case" badge and sit at the top of the feed for
//    dentists in the same city or specialty for 2 days.
//  - Pending cases (the first 3 from every dentist wait for review) are
//    shown to signed-in dentists right away with an "In review" label. The
//    public summary, Google and the sitemap still wait for approval.
//  - The first reply on a first case goes to the author on WhatsApp right
//    away (template network_activity_summary, same as the 7 PM summary).
//  - Claimed dentists with no case get one WhatsApp nudge on day 1 and one
//    on day 5, then nothing (src/app/api/cron/first-case-nudge).
//
// Everything here is best-effort and never throws.

import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '@/lib/national'
import { cleanName, drName } from '@/lib/dentistName'
import { readPrefs, inQuietHours } from '@/lib/networkAlerts'
import { sendActivitySummaryWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'
import { waAlertsLink } from '@/lib/waLoginLink'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A first case stays at the top of the feed this long. */
export const FIRST_CASE_PIN_HOURS = 48
/** Pending cases older than this are left out of the home feed. */
export const PENDING_FEED_DAYS = 14
/** Statuses a dentist can see: approved, plus pending while in review. */
export const DENTIST_VISIBLE_STATUSES = ['approved', 'pending']

export { CASE_WHATSAPP_NUMBER, POST_BY_WHATSAPP_URL, FIRST_CASE_IDEAS } from '@/lib/firstCaseShared'

/**
 * Of the given authors, which case id is each one's first case.
 * Returns a map of author id to first case id.
 */
export async function firstCaseByAuthor(authorIds: string[], db: SupabaseClient = adminDb()): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = Array.from(new Set(authorIds.filter(Boolean)))
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('cases').select('id, dentist_id, created_at')
      .in('dentist_id', ids.slice(i, i + 200)).in('status', DENTIST_VISIBLE_STATUSES)
      .order('created_at', { ascending: true }).limit(1000)
    if (error) return out
    for (const r of (data || []) as Array<{ id: string; dentist_id: string }>) {
      if (!out.has(r.dentist_id)) out.set(r.dentist_id, r.id)
    }
  }
  return out
}

/** Cases this dentist has that are live or in review (not rejected). */
export async function liveCaseCount(dentistId: string, db: SupabaseClient = adminDb()): Promise<number> {
  const { count, error } = await db.from('cases').select('id', { count: 'exact', head: true })
    .eq('dentist_id', dentistId).in('status', DENTIST_VISIBLE_STATUSES)
  return error ? 0 : count ?? 0
}

function clip(s: string | null | undefined, n: number): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}

/**
 * A new reply was posted on a case. If it is the first reply from another
 * dentist on the author's first case, tell the author on WhatsApp right away.
 * Same template and switch as the 7 PM activity summary
 * (ACTIVITY_WHATSAPP_ENABLED). Quiet hours, the "Activity summary" setting
 * and STOP are respected; in quiet hours the 7 PM summary covers it.
 */
export async function firstReplyWhatsApp(caseId: string, actorId: string, commentId: string): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    if (process.env.ACTIVITY_WHATSAPP_ENABLED !== 'true' || !whatsAppEnabled()) return 'skipped'
    if (inQuietHours()) return 'skipped'
    const db = adminDb()
    const { data: c } = await db.from('cases').select('id, title, dentist_id').eq('id', caseId).maybeSingle()
    if (!c || c.dentist_id === actorId) return 'skipped'
    const first = await firstCaseByAuthor([c.dentist_id as string], db)
    if (first.get(c.dentist_id as string) !== caseId) return 'skipped'
    // Only the first reply from someone other than the author.
    const { count } = await db.from('case_comments').select('id', { count: 'exact', head: true })
      .eq('case_id', caseId).neq('dentist_id', c.dentist_id as string).neq('id', commentId)
    if ((count ?? 0) > 0) return 'skipped'

    const { data: d } = await db.from('dentists').select('id, name, phone, whatsapp, is_active, network_alert_prefs').eq('id', c.dentist_id).maybeSingle()
    if (!d || d.is_active === false) return 'skipped'
    if (!readPrefs((d as any).network_alert_prefs).whatsapp_summary) return 'skipped'
    const phone = (d as any).whatsapp || (d as any).phone
    if (!phone) return 'skipped'
    const { data: actor } = await db.from('dentists').select('name').eq('id', actorId).maybeSingle()

    const res = await sendActivitySummaryWhatsApp({
      dentistPhone: phone,
      firstName: cleanName((d as any).name).split(' ')[0] || 'Doctor',
      summary: `${drName((actor as any)?.name, 'A dentist')} replied on your first case "${clip(c.title as string, 60)}"`,
      link: waAlertsLink(d.id as string),
    })
    if (!res.success) return 'failed'
    const stamp = new Date().toISOString()
    // Counts as this dentist's WhatsApp summary, so the next one waits the
    // usual 3.5 days and this reply isn't sent twice.
    await db.from('network_alerts').update({ whatsapp_at: stamp }).eq('recipient_id', d.id).eq('case_id', caseId).is('whatsapp_at', null).then(() => {}, () => {})
    await db.from('dentists').update({ alerts_whatsapp_at: stamp }).eq('id', d.id).then(() => {}, () => {})
    return 'sent'
  } catch (err: any) {
    console.error('[first-case] firstReplyWhatsApp failed', err?.message)
    return 'failed'
  }
}

export interface FirstCaseAdminRow {
  id: string; title: string; status: string; createdAt: string; replies: number
  dentistName: string; city: string | null
}

/**
 * Admin > Cases "First cases" list: new dentists' first cases from the last
 * 7 days, so the team can approve them and reply within a few hours.
 * `pendingFirstIds` marks which rows in the review queue are first cases.
 */
export async function loadFirstCaseAdmin(db: SupabaseClient = adminDb()): Promise<{ pendingFirstIds: string[]; waiting: FirstCaseAdminRow[] }> {
  try {
    const { data, error } = await db.from('cases')
      .select('id, title, status, created_at, comment_count, dentist_id, dentists(name, city)')
      .in('status', DENTIST_VISIBLE_STATUSES)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('created_at', { ascending: false }).limit(500)
    if (error || !data?.length) return { pendingFirstIds: [], waiting: [] }
    const rows = data as any[]
    const first = await firstCaseByAuthor(rows.map(r => r.dentist_id), db)
    const firsts = rows.filter(r => first.get(r.dentist_id) === r.id)
    const weekAgo = Date.now() - 7 * 86400000
    return {
      pendingFirstIds: firsts.filter(r => r.status === 'pending').map(r => r.id),
      waiting: firsts
        .filter(r => Date.parse(r.created_at) >= weekAgo)
        .map(r => ({
          id: r.id, title: r.title, status: r.status, createdAt: r.created_at, replies: r.comment_count || 0,
          dentistName: drName(r.dentists?.name), city: r.dentists?.city ?? null,
        })),
    }
  } catch {
    return { pendingFirstIds: [], waiting: [] }
  }
}
