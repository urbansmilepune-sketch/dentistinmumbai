// Activity alerts for the dentistinindia.in network (27 Nov 2026).
//
// "Dr X followed you", "Dr X liked your case", "Dr X replied on your case",
// "Dr X replied to your question", "Dr X marked your reply helpful".
// Each one is a row in network_alerts (SQL: supabase/migrations/
// 20261127150000_network_alerts.sql). They show in the bell and on /alerts,
// and are rolled up into phone alerts and the WhatsApp activity summary
// (src/app/api/cron/activity-summary).
//
// Rules (approved mockup, india-switch-alerts/mockup.html):
//   - never for your own actions
//   - like / follow / helpful count once per person (like, unlike, like = 1);
//     undoing within the hour removes the unseen alert
//   - replies push right away (max 1 per case or post per hour, 8 AM-9 PM
//     IST); everything else waits for the 7 PM summary
//   - alerts carry dentist names and case titles only, never patient details
//
// Everything here is best-effort: it never throws and quietly does nothing
// if the SQL has not been run yet. Call it inside next/server after().

import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '@/lib/national'
import { drName } from '@/lib/dentistName'
import { casePath } from '@/lib/caseSlug'
import { notifyNetwork } from '@/lib/push'

export type AlertKind = 'follow' | 'case_like' | 'case_comment' | 'post_reply' | 'helpful'
const ONCE_PER_PERSON: AlertKind[] = ['follow', 'case_like', 'helpful']
export const REPLY_KINDS: AlertKind[] = ['case_comment', 'post_reply']

export interface AlertPrefs {
  push_replies: boolean
  push_summary: boolean
  whatsapp_summary: boolean
  whatsapp_digest: boolean
}
export const PREF_KEYS: (keyof AlertPrefs)[] = ['push_replies', 'push_summary', 'whatsapp_summary', 'whatsapp_digest']

export function readPrefs(raw: unknown): AlertPrefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    push_replies: p.push_replies !== false,
    push_summary: p.push_summary !== false,
    whatsapp_summary: p.whatsapp_summary !== false,
    whatsapp_digest: p.whatsapp_digest !== false,
  }
}

// ── IST time helpers ─────────────────────────────────────────────────
const IST_OFFSET_MS = 330 * 60 * 1000
export function istHour(now = Date.now()): number {
  return new Date(now + IST_OFFSET_MS).getUTCHours()
}
export function istWeekday(now = Date.now()): number {
  return new Date(now + IST_OFFSET_MS).getUTCDay() // 0 = Sunday, 1 = Monday
}
/** Phone alerts and WhatsApp only go out 8 AM - 9 PM IST. */
export function inQuietHours(now = Date.now()): boolean {
  const h = istHour(now)
  return h < 8 || h >= 21
}

// ── Writing alerts ───────────────────────────────────────────────────
interface NewAlert {
  recipientId: string | null | undefined
  actorId: string
  kind: AlertKind
  caseId?: string | null
  postId?: string | null
  commentId?: string | null
  snippet?: string | null
}

function clip(s: string | null | undefined, n: number): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}

/** Saves one alert. Returns true when a new row was written. */
export async function addAlert(a: NewAlert, db: SupabaseClient = adminDb()): Promise<boolean> {
  try {
    if (!a.recipientId || a.recipientId === a.actorId) return false
    if (ONCE_PER_PERSON.includes(a.kind)) {
      let q = db.from('network_alerts').select('id').eq('recipient_id', a.recipientId).eq('actor_id', a.actorId).eq('kind', a.kind)
      if (a.caseId) q = q.eq('case_id', a.caseId)
      if (a.commentId) q = q.eq('comment_id', a.commentId)
      const { data, error } = await q.limit(1)
      if (error) return false // table missing: SQL not run yet
      if (data && data.length) return false
    }
    const { error } = await db.from('network_alerts').insert({
      recipient_id: a.recipientId,
      actor_id: a.actorId,
      kind: a.kind,
      case_id: a.caseId || null,
      post_id: a.postId || null,
      comment_id: a.commentId || null,
      snippet: a.snippet ? clip(a.snippet, 160) : null,
    })
    if (error) return false
    if (REPLY_KINDS.includes(a.kind)) await pushReplyNow(db, a)
    return true
  } catch (err: any) {
    console.error('[alerts] addAlert failed', err?.message)
    return false
  }
}

/** Unlike / unfollow / un-helpful within the hour: drop the alert they have not seen yet. */
export async function removeAlert(a: Omit<NewAlert, 'snippet' | 'postId'>, db: SupabaseClient = adminDb()): Promise<void> {
  try {
    if (!a.recipientId) return
    let q = db.from('network_alerts').delete()
      .eq('recipient_id', a.recipientId).eq('actor_id', a.actorId).eq('kind', a.kind)
      .is('seen_at', null).gte('created_at', new Date(Date.now() - 3600 * 1000).toISOString())
    if (a.caseId) q = q.eq('case_id', a.caseId)
    if (a.commentId) q = q.eq('comment_id', a.commentId)
    await q
  } catch { /* best effort */ }
}

/** New comment on a case: tell the author and everyone already in the discussion. */
export async function alertCaseComment(caseId: string, actorId: string, commentId: string, content: string): Promise<void> {
  try {
    const db = adminDb()
    const { data: c } = await db.from('cases').select('dentist_id').eq('id', caseId).maybeSingle()
    const { data: earlier } = await db.from('case_comments').select('dentist_id').eq('case_id', caseId).neq('id', commentId).limit(500)
    const recipients = new Set<string>()
    if (c?.dentist_id) recipients.add(c.dentist_id as string)
    for (const r of (earlier || []) as Array<{ dentist_id: string }>) if (r.dentist_id) recipients.add(r.dentist_id)
    recipients.delete(actorId)
    for (const rid of recipients) {
      await addAlert({ recipientId: rid, actorId, kind: 'case_comment', caseId, commentId, snippet: content }, db)
    }
  } catch (err: any) {
    console.error('[alerts] alertCaseComment failed', err?.message)
  }
}

// ── Phone alerts ─────────────────────────────────────────────────────
// Taps open the city dashboard's India sign-in link (the phone alert comes
// from the dentist app on their city site), which lands on /alerts here.
export const PUSH_ALERTS_URL = '/api/auth/india-handoff?next=alerts'

async function pushReplyNow(db: SupabaseClient, a: NewAlert): Promise<void> {
  if (inQuietHours()) return // waits for the next 7 PM summary
  const { data: d } = await db.from('dentists').select('network_alert_prefs').eq('id', a.recipientId!).maybeSingle()
  if (!readPrefs((d as any)?.network_alert_prefs).push_replies) return
  // Max one reply alert per case (or post) per hour.
  let recent = db.from('network_alerts').select('id').eq('recipient_id', a.recipientId!)
    .in('kind', REPLY_KINDS).not('pushed_at', 'is', null).gte('pushed_at', new Date(Date.now() - 3600 * 1000).toISOString())
  recent = a.caseId ? recent.eq('case_id', a.caseId) : recent.eq('post_id', a.postId || '')
  const { data: r } = await recent.limit(1)
  const markPushed = () => {
    let q = db.from('network_alerts').update({ pushed_at: new Date().toISOString() })
      .eq('recipient_id', a.recipientId!).in('kind', REPLY_KINDS).is('pushed_at', null)
    q = a.caseId ? q.eq('case_id', a.caseId) : q.eq('post_id', a.postId || '')
    return q
  }
  if (r && r.length) { await markPushed(); return } // covered by the alert sent in the last hour

  const { data: actor } = await db.from('dentists').select('name').eq('id', a.actorId).maybeSingle()
  let where = 'on your question'
  if (a.caseId) {
    const { data: c } = await db.from('cases').select('title, dentist_id').eq('id', a.caseId).maybeSingle()
    const title = clip((c as any)?.title, 60)
    where = (c as any)?.dentist_id === a.recipientId ? `on your case "${title}"` : `on the case "${title}"`
  } else if (a.postId) {
    const { data: p } = await db.from('network_posts').select('kind').eq('id', a.postId).maybeSingle()
    where = (p as any)?.kind === 'update' ? 'to your update' : 'to your question'
  }
  const sent = await notifyNetwork(a.recipientId!, {
    title: `${drName((actor as any)?.name, 'A dentist')} replied`,
    body: where,
    url: PUSH_ALERTS_URL,
    tag: `din-reply-${a.caseId || a.postId}`,
  })
  if (sent) await markPushed()
}

// ── Reading alerts ───────────────────────────────────────────────────
export interface AlertActor { id: string; name: string; slug: string; photo: string | null }
export interface AlertItem {
  key: string
  kind: AlertKind
  actors: AlertActor[]
  /** Total people in a grouped line, e.g. 5 for "Dr A and 4 others liked". */
  count: number
  text: string
  snippet: string | null
  href: string
  at: string
  unseen: boolean
}

interface Row {
  id: string; kind: AlertKind; actor_id: string; case_id: string | null; post_id: string | null
  comment_id: string | null; snippet: string | null; created_at: string; seen_at: string | null
}

export async function unseenCount(dentistId: string, db: SupabaseClient = adminDb()): Promise<number> {
  const { count, error } = await db.from('network_alerts').select('id', { count: 'exact', head: true })
    .eq('recipient_id', dentistId).is('seen_at', null)
  return error ? 0 : count ?? 0
}

export async function markAllSeen(dentistId: string, db: SupabaseClient = adminDb()): Promise<void> {
  const now = new Date().toISOString()
  await db.from('network_alerts').update({ seen_at: now }).eq('recipient_id', dentistId).is('seen_at', null)
  await touchNetworkSeen(dentistId, db)
}

/** "Opened dentistinindia.in": the WhatsApp summary skips anything older. */
export async function touchNetworkSeen(dentistId: string, db: SupabaseClient = adminDb()): Promise<void> {
  try { await db.from('dentists').update({ network_seen_at: new Date().toISOString() }).eq('id', dentistId) } catch { /* column missing */ }
}

function andOthers(names: string[], total: number): string {
  if (total <= 1) return names[0]
  if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${total - 1} others`
}

/** Builds grouped lines for the bell and /alerts. Newest first. */
export async function loadAlerts(dentistId: string, limit = 80, db: SupabaseClient = adminDb()): Promise<AlertItem[]> {
  const { data, error } = await db.from('network_alerts')
    .select('id, kind, actor_id, case_id, post_id, comment_id, snippet, created_at, seen_at')
    .eq('recipient_id', dentistId).order('created_at', { ascending: false }).limit(limit)
  if (error || !data?.length) return []
  const rows = data as Row[]

  const actorIds = Array.from(new Set(rows.map(r => r.actor_id)))
  const caseIds = Array.from(new Set(rows.map(r => r.case_id).filter(Boolean))) as string[]
  const postIds = Array.from(new Set(rows.map(r => r.post_id).filter(Boolean))) as string[]
  const [{ data: people }, { data: cases }, { data: posts }] = await Promise.all([
    db.from('dentists').select('id, name, slug, profile_photo').in('id', actorIds),
    caseIds.length ? db.from('cases').select('id, title, city, dentist_id').in('id', caseIds) : Promise.resolve({ data: [] as any[] }),
    postIds.length ? db.from('network_posts').select('id, kind, body').in('id', postIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const actorMap = new Map<string, AlertActor>()
  for (const p of (people || []) as any[]) actorMap.set(p.id, { id: p.id, name: drName(p.name, 'A dentist'), slug: p.slug, photo: p.profile_photo || null })
  const caseMap = new Map<string, any>((cases || []).map((c: any) => [c.id, c]))
  const postMap = new Map<string, any>((posts || []).map((p: any) => [p.id, p]))

  // Group likes per case, helpful marks per case, follows per seen/unseen batch.
  const groups = new Map<string, Row[]>()
  const order: string[] = []
  for (const r of rows) {
    if (!actorMap.has(r.actor_id)) continue
    const fresh = r.seen_at ? 'seen' : 'new'
    const key = r.kind === 'follow' ? `follow:${fresh}`
      : r.kind === 'case_like' ? `like:${r.case_id}:${fresh}`
      : r.kind === 'helpful' ? `helpful:${r.case_id || r.comment_id}:${fresh}`
      : r.id
    if (!groups.has(key)) { groups.set(key, []); order.push(key) }
    groups.get(key)!.push(r)
  }

  const items: AlertItem[] = []
  for (const key of order) {
    const g = groups.get(key)!
    const first = g[0]
    const actors: AlertActor[] = []
    for (const r of g) { const a = actorMap.get(r.actor_id); if (a && !actors.some(x => x.id === a.id)) actors.push(a) }
    const names = actors.map(a => a.name)
    const who = andOthers(names, actors.length)
    const c = first.case_id ? caseMap.get(first.case_id) : null
    const title = c ? `"${clip(c.title, 70)}"` : 'a case'
    const caseHref = c ? casePath(c) : '/cases'
    const mine = c ? c.dentist_id === dentistId : true
    let text = '', href = '/'
    switch (first.kind) {
      case 'follow':
        text = `${who} started following you`
        href = actors.length === 1 ? `/professional/${actors[0].slug}` : '/'
        break
      case 'case_like':
        text = `${who} liked your case ${title}`
        href = caseHref
        break
      case 'case_comment':
        text = mine ? `${who} replied on your case ${title}` : `${who} also replied on ${title}`
        href = caseHref
        break
      case 'helpful':
        text = `${who} marked your reply helpful on ${title}`
        href = caseHref
        break
      case 'post_reply': {
        const p = first.post_id ? postMap.get(first.post_id) : null
        text = `${who} replied to your ${p?.kind === 'update' ? 'update' : 'question'}${p ? ` "${clip(p.body, 60)}"` : ''}`
        href = '/'
        break
      }
    }
    items.push({
      key, kind: first.kind, actors: actors.slice(0, 3), count: actors.length, text,
      snippet: REPLY_KINDS.includes(first.kind) ? first.snippet : null,
      href, at: first.created_at, unseen: g.some(r => !r.seen_at),
    })
  }
  return items
}

/**
 * One line for the WhatsApp / 7 PM phone summary, e.g.
 * '2 new followers, 3 likes and 1 reply on "Immediate implant, lower 6"'.
 */
export function summaryLine(rows: Array<{ kind: AlertKind; case_id: string | null }>, caseTitles: Map<string, string>): string {
  const n = (k: AlertKind[]) => rows.filter(r => k.includes(r.kind)).length
  const follows = n(['follow']), likes = n(['case_like']), replies = n(['case_comment', 'post_reply']), helpful = n(['helpful'])
  const parts: string[] = []
  if (follows) parts.push(`${follows} new follower${follows === 1 ? '' : 's'}`)
  if (likes) parts.push(`${likes} like${likes === 1 ? '' : 's'}`)
  if (replies) parts.push(`${replies} repl${replies === 1 ? 'y' : 'ies'}`)
  if (helpful) parts.push(`${helpful} helpful mark${helpful === 1 ? '' : 's'}`)
  if (!parts.length) return ''
  let line = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  const caseIds = Array.from(new Set(rows.filter(r => r.kind !== 'follow' && r.kind !== 'post_reply').map(r => r.case_id).filter(Boolean))) as string[]
  const onlyCase = caseIds.length === 1 && !rows.some(r => r.kind === 'post_reply') ? caseTitles.get(caseIds[0]) : null
  if (onlyCase) line += ` on "${clip(onlyCase, 60)}"`
  return line
}
