// "Your week on DentistIn" (approved 27 Nov 2026, weekly-activity/mockup.html).
//
// The last 7 days of activity on a dentist's profile and cases, compared
// with the 7 days before: case views (who viewed), new followers, likes,
// replies and helpful marks. Shown as a card at the top of the dentist home
// feed, in full on /week, and as the Monday WhatsApp recap
// (src/app/api/cron/week-recap).
//
// Views come from case_views (supabase/migrations/20261127200000_weekly_activity.sql),
// everything else from network_alerts (PR #69). Both are read-only here and
// every reader quietly returns zeros if the SQL has not been run.
//
// "Good week" (shows Invite a colleague): 5 or more things in the 7 days,
// or one case with 10 or more views.

import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb, cityNameOf } from '@/lib/national'
import { drName } from '@/lib/dentistName'
import { casePath } from '@/lib/caseSlug'
import { readPrefs } from '@/lib/networkAlerts'
import { expertHeadline } from '@/lib/expertProfile'

const DAY = 86400000
const IST_OFFSET_MS = 330 * 60 * 1000
export const GOOD_WEEK_TOTAL = 5
export const GOOD_WEEK_CASE_VIEWS = 10
const NEW_DENTIST_DAYS = 7

/** Saves one case view (once per dentist per case per India day). Never throws. */
export async function recordCaseView(caseId: string, viewerId: string, authorId: string, db: SupabaseClient = adminDb()): Promise<void> {
  try {
    if (!caseId || !viewerId || !authorId || viewerId === authorId) return
    await db.from('case_views').upsert(
      { case_id: caseId, viewer_id: viewerId, author_id: authorId },
      { onConflict: 'case_id,viewer_id,viewed_on', ignoreDuplicates: true },
    )
  } catch { /* table missing: SQL not run yet */ }
}

export interface WeekCounts { views: number; followers: number; likes: number; replies: number; helpful: number }

export interface WeekPerson {
  id: string; name: string; slug: string; photo: string | null; line: string
  at: string
  /** Case they viewed / liked / replied on (latest), if any. */
  caseTitle: string | null
  caseHref: string | null
  snippet: string | null
}

export interface WeekData {
  label: string
  now: WeekCounts
  prev: WeekCounts
  total: number
  prevTotal: number
  good: boolean
  isNew: boolean
  topCase: { title: string; href: string; views: number; names: string[]; viewers: number } | null
  /** Named viewers, latest first. */
  viewers: WeekPerson[]
  /** Dentists who viewed with "Show my name" off. */
  privateViewers: number
  followers: WeekPerson[]
  likers: WeekPerson[]
  repliers: WeekPerson[]
}

/** True while the dentist has closed the card (until next Monday). */
export async function weekCardHidden(dentistId: string, db: SupabaseClient = adminDb()): Promise<boolean> {
  const { data, error } = await db.from('dentists').select('week_card_hidden_until').eq('id', dentistId).maybeSingle()
  if (error) return false
  const until = (data as { week_card_hidden_until?: string | null } | null)?.week_card_hidden_until
  return !!until && Date.parse(until) > Date.now()
}

const zero = (): WeekCounts => ({ views: 0, followers: 0, likes: 0, replies: 0, helpful: 0 })
export const sumCounts = (c: WeekCounts) => c.views + c.followers + c.likes + c.replies + c.helpful

function istDayLabel(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MS)
  return `${d.getUTCDate()} ${d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}`
}
/** "21 – 27 Nov", or "28 Nov – 4 Dec" across months. */
export function weekLabel(now = Date.now()): string {
  const a = istDayLabel(now - 6 * DAY), b = istDayLabel(now)
  const [ad, am] = a.split(' '), [, bm] = b.split(' ')
  return am === bm ? `${ad} – ${b}` : `${a} – ${b}`
}

/** Next Monday 00:00 India time, for "closed until next week". */
export function nextMondayIst(now = Date.now()): Date {
  const ist = new Date(now + IST_OFFSET_MS)
  const daysAhead = ((8 - ist.getUTCDay()) % 7) || 7
  const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + daysAhead)
  return new Date(midnight - IST_OFFSET_MS)
}

function clip(s: string | null | undefined, n: number): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}

type PersonRow = {
  id: string; name: string | null; slug: string; city: string | null; profile_photo: string | null
  top_skills: string[] | null; specialties: string[] | null; network_alert_prefs: unknown; is_active: boolean | null
}
type CaseRow = { id: string; title: string; city: string | null }
type ViewRow = { case_id: string; viewer_id: string; created_at: string }
type AlertRow = { actor_id: string; kind: string; case_id: string | null; snippet: string | null; created_at: string }

export async function loadWeek(dentistId: string, db: SupabaseClient = adminDb(), now = Date.now()): Promise<WeekData> {
  const weekStart = now - 7 * DAY
  const prevStart = now - 14 * DAY
  const since = new Date(prevStart).toISOString()

  const [viewsRes, alertsRes, meRes] = await Promise.all([
    db.from('case_views').select('case_id, viewer_id, created_at')
      .eq('author_id', dentistId).gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
    db.from('network_alerts').select('actor_id, kind, case_id, snippet, created_at')
      .eq('recipient_id', dentistId).gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
    db.from('dentists').select('created_at').eq('id', dentistId).maybeSingle(),
  ])
  const views = (viewsRes.error ? [] : viewsRes.data || []) as ViewRow[]
  const alerts = (alertsRes.error ? [] : alertsRes.data || []) as AlertRow[]
  const joined = (meRes.data as { created_at?: string } | null)?.created_at
  const isNew = !!joined && now - Date.parse(joined) < NEW_DENTIST_DAYS * DAY

  const inWeek = (iso: string) => Date.parse(iso) >= weekStart
  const nowC = zero(), prevC = zero()
  for (const v of views) (inWeek(v.created_at) ? nowC : prevC).views++
  for (const a of alerts) {
    const c = inWeek(a.created_at) ? nowC : prevC
    if (a.kind === 'follow') c.followers++
    else if (a.kind === 'case_like') c.likes++
    else if (a.kind === 'case_comment' || a.kind === 'post_reply') c.replies++
    else if (a.kind === 'helpful') c.helpful++
  }

  const weekViews = views.filter(v => inWeek(v.created_at))
  const weekAlerts = alerts.filter(a => inWeek(a.created_at))

  // People and cases we need names for.
  const personIds = Array.from(new Set([...weekViews.map(v => v.viewer_id), ...weekAlerts.map(a => a.actor_id)]))
  const caseIds = Array.from(new Set([...weekViews.map(v => v.case_id), ...weekAlerts.map(a => a.case_id).filter(Boolean) as string[]]))
  const people = new Map<string, PersonRow>()
  for (let i = 0; i < personIds.length; i += 200) {
    const { data } = await db.from('dentists').select('id, name, slug, city, profile_photo, top_skills, specialties, network_alert_prefs, is_active')
      .in('id', personIds.slice(i, i + 200))
    for (const p of (data || []) as PersonRow[]) if (p.is_active !== false) people.set(p.id, p)
  }
  const cases = new Map<string, CaseRow>()
  for (let i = 0; i < caseIds.length; i += 200) {
    const { data } = await db.from('cases').select('id, title, city').in('id', caseIds.slice(i, i + 200))
    for (const c of (data || []) as CaseRow[]) cases.set(c.id, c)
  }

  const person = (id: string, at: string, caseId: string | null, snippet: string | null): WeekPerson | null => {
    const p = people.get(id)
    if (!p) return null
    const c = caseId ? cases.get(caseId) : null
    return {
      id, name: drName(p.name, 'A dentist'), slug: p.slug, photo: p.profile_photo || null,
      line: [expertHeadline(p, []), cityNameOf(p.city)].filter(Boolean).join(' · '),
      at, caseTitle: c ? clip(c.title, 70) : null, caseHref: c ? casePath(c) : null,
      snippet: snippet ? clip(snippet, 120) : null,
    }
  }
  const shows = (id: string) => readPrefs(people.get(id)?.network_alert_prefs).show_my_views

  // Distinct viewers, latest first (rows are newest first already).
  const viewers: WeekPerson[] = []
  const privateIds = new Set<string>()
  const seen = new Set<string>()
  for (const v of weekViews) {
    if (seen.has(v.viewer_id)) continue
    seen.add(v.viewer_id)
    if (!people.has(v.viewer_id)) continue
    if (!shows(v.viewer_id)) { privateIds.add(v.viewer_id); continue }
    const wp = person(v.viewer_id, v.created_at, v.case_id, null)
    if (wp) viewers.push(wp)
  }

  const list = (kinds: string[]) => {
    const out: WeekPerson[] = []
    const got = new Set<string>()
    for (const a of weekAlerts) {
      if (!kinds.includes(a.kind) || got.has(a.actor_id)) continue
      got.add(a.actor_id)
      const wp = person(a.actor_id, a.created_at, a.case_id, kinds.includes('case_comment') ? a.snippet : null)
      if (wp) out.push(wp)
    }
    return out
  }

  // Best case this week by views, with the named viewers of that case.
  let topCase: WeekData['topCase'] = null
  const perCase = new Map<string, ViewRow[]>()
  for (const v of weekViews) {
    if (!perCase.has(v.case_id)) perCase.set(v.case_id, [])
    perCase.get(v.case_id)!.push(v)
  }
  let best: [string, ViewRow[]] | null = null
  for (const e of perCase) if (!best || e[1].length > best[1].length) best = e
  if (best && cases.has(best[0])) {
    const c = cases.get(best[0])!
    const ids = Array.from(new Set(best[1].map(v => v.viewer_id))).filter(id => people.has(id))
    topCase = {
      title: clip(c.title, 70), href: casePath(c), views: best[1].length,
      names: ids.filter(shows).map(id => drName(people.get(id)!.name, 'A dentist')).slice(0, 3),
      viewers: ids.length,
    }
  }

  const total = sumCounts(nowC)
  return {
    label: weekLabel(now),
    now: nowC, prev: prevC, total, prevTotal: sumCounts(prevC),
    good: total >= GOOD_WEEK_TOTAL || (topCase?.views ?? 0) >= GOOD_WEEK_CASE_VIEWS,
    isNew,
    topCase,
    viewers,
    privateViewers: privateIds.size,
    followers: list(['follow']),
    likers: list(['case_like']),
    repliers: list(['case_comment', 'post_reply']),
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Dr. A and 8 others viewed" style. */
export function namesLine(names: string[], total: number): string {
  if (!names.length) return plural(total, 'dentist', 'dentists')
  if (total <= 1) return names[0]
  if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${total - 1} others`
}

/** First line of the invite message: the dentist's biggest number this week. */
export function inviteBrag(w: WeekData): string {
  const options: Array<[number, string]> = [
    [w.topCase?.viewers ?? 0, w.topCase ? `${plural(w.topCase.viewers, 'dentist', 'dentists')} looked at my case "${w.topCase.title}" on DentistIn this week.` : ''],
    [w.now.likes, `My cases got ${plural(w.now.likes, 'like', 'likes')} from other dentists on DentistIn this week.`],
    [w.now.followers, `${plural(w.now.followers, 'dentist', 'dentists')} started following me on DentistIn this week.`],
  ]
  const top = options.filter(o => o[0] > 0 && o[1]).sort((a, b) => b[0] - a[0])[0]
  return top ? top[1] : "I'm sharing my cases with dentists across India on DentistIn."
}

export function inviteMessage(w: WeekData, link: string): string {
  return `${inviteBrag(w)} It's where Indian dentists share cases and get second opinions, and it's free. Join me here:\n${link}`
}

/**
 * One line for the Monday WhatsApp recap (no line breaks: WhatsApp template
 * values can't have them), e.g. '34 case views from dentists, 5 new
 * followers, 12 likes and 3 replies. Dr. Sneha Patil and 8 others viewed
 * "Full mouth rehab, 62M"'.
 */
export function weekSummaryLine(w: WeekData): string {
  const parts: string[] = []
  if (w.now.views) parts.push(`${plural(w.now.views, 'case view', 'case views')} from dentists`)
  if (w.now.followers) parts.push(plural(w.now.followers, 'new follower', 'new followers'))
  if (w.now.likes) parts.push(plural(w.now.likes, 'like', 'likes'))
  if (w.now.replies) parts.push(plural(w.now.replies, 'reply', 'replies'))
  if (w.now.helpful) parts.push(plural(w.now.helpful, 'helpful mark', 'helpful marks'))
  let line = parts.length <= 1 ? (parts[0] || '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  if (w.topCase && w.topCase.viewers > 1) {
    line += `. ${namesLine(w.topCase.names, w.topCase.viewers)} viewed "${clip(w.topCase.title, 60)}"`
  }
  return line
}
