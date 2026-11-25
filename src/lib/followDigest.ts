// Follow alerts for the dentist network (v1, Nov 2026).
//
// "Dr X posted a new implant case": the data side of following. Used by
//   - the case library's Following tab and its "new this week" count
//   - the weekly digest cron (src/app/api/cron/follow-digest), which sends
//     one WhatsApp per dentist once the MSG91 template is approved.
//
// Service-role reads only; callers do their own auth.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSpecialty } from '@/lib/dentalSpecialties'

export const DIGEST_DAYS = 7

export interface FollowedCase {
  id: string
  title: string
  specialty: string | null
  created_at: string
  dentist_id: string
  author: string
}

/** Ids of the dentists this dentist follows. */
export async function followedIds(db: SupabaseClient, dentistId: string): Promise<string[]> {
  const { data, error } = await db.from('dentist_follows').select('following_id').eq('follower_id', dentistId).limit(2000)
  if (error) return []
  return (data || []).map((r: any) => r.following_id as string)
}

/** Approved cases posted since `sinceIso` by dentists that `dentistId` follows, newest first. */
export async function newCasesFromFollowed(db: SupabaseClient, dentistId: string, sinceIso: string): Promise<FollowedCase[]> {
  const ids = await followedIds(db, dentistId)
  if (!ids.length) return []
  const { data } = await db
    .from('cases').select('id, title, specialty, created_at, dentist_id, dentists(name)')
    .eq('status', 'approved').in('dentist_id', ids).gte('created_at', sinceIso)
    .order('created_at', { ascending: false }).limit(50)
  return (data || []).map((c: any) => ({
    id: c.id, title: c.title, specialty: c.specialty, created_at: c.created_at,
    dentist_id: c.dentist_id, author: c.dentists?.name || 'a dentist',
  }))
}

export function sinceDaysAgo(days = DIGEST_DAYS): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

/**
 * One-line summary for the digest message, e.g.
 * "Dr. Mehta posted a new implant case, and 2 more cases from dentists you follow".
 */
export function digestLine(cases: FollowedCase[]): string {
  if (!cases.length) return ''
  const first = cases[0]
  const spec = getSpecialty(first.specialty || '')?.label?.toLowerCase()
  const lead = `Dr. ${first.author} posted a new ${spec ? spec + ' ' : ''}case`
  const rest = cases.length - 1
  return rest > 0 ? `${lead}, and ${rest} more case${rest === 1 ? '' : 's'} from dentists you follow` : lead
}
