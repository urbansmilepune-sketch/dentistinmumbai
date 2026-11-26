// Invite a colleague (dentistinindia.in growth work, Nov 2026).
//
// Each dentist has a short personal code (dentists.invite_code). Their link
// is /invite/<CODE>; a colleague who joins through it gets the code saved in
// their own dentists.ref, which is how "joined" is counted. "Invites sent"
// counts the inviter's invite_share analytics events.
//
// Columns come from supabase/migrations/20261126200000_invite_codes.sql,
// run by hand. Until it runs, every helper here returns null and the
// invite box stays hidden.

import { adminDb, isMissingColumnError } from '@/lib/national'

const CODE_RE = /^[A-Z0-9]{4,12}$/
// No 0/O or 1/I so a code read out loud or retyped can't be mixed up.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return CODE_RE.test(code) ? code : null
}

function newCode(): string {
  let s = ''
  for (let i = 0; i < 7; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

/** The dentist's invite code, creating one if they have none. Null before the SQL runs. */
export async function getOrCreateInviteCode(dentistId: string): Promise<string | null> {
  const db = adminDb()
  const { data, error } = await db.from('dentists').select('invite_code').eq('id', dentistId).maybeSingle()
  if (error) {
    if (!isMissingColumnError(error)) console.error('[invites] read code failed', error)
    return null
  }
  const existing = (data as { invite_code?: string | null } | null)?.invite_code
  if (existing) return existing
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode()
    const { error: upErr } = await db.from('dentists').update({ invite_code: code }).eq('id', dentistId).is('invite_code', null)
    if (!upErr) {
      // Re-read: if two tabs raced, keep whichever code won.
      const { data: again } = await db.from('dentists').select('invite_code').eq('id', dentistId).maybeSingle()
      return (again as { invite_code?: string | null } | null)?.invite_code || null
    }
    if (isMissingColumnError(upErr)) return null
    // Unique clash with another dentist's code: try a new one.
  }
  return null
}

export interface InviteStats {
  sent: number
  joined: number
  recent: Array<{ name: string; slug: string; created_at: string }>
}

export async function loadInviteStats(dentistId: string, code: string): Promise<InviteStats> {
  const db = adminDb()
  const [sentRes, joinedRes] = await Promise.all([
    db.from('analytics_events').select('id', { count: 'exact', head: true }).eq('dentist_id', dentistId).eq('event_type', 'invite_share'),
    db.from('dentists').select('name, slug, created_at', { count: 'exact' }).eq('ref', code).order('created_at', { ascending: false }).limit(10),
  ])
  const joined = joinedRes.error ? 0 : (joinedRes.count ?? 0)
  return {
    // Someone who joined was invited at least once, even if the share
    // wasn't logged (copied link, shared from another device).
    sent: Math.max(sentRes.count ?? 0, joined),
    joined,
    recent: joinedRes.error ? [] : ((joinedRes.data || []) as InviteStats['recent']),
  }
}

export interface Inviter {
  id: string
  name: string
  slug: string
  city: string | null
  profile_photo: string | null
  created_at: string | null
  is_verified: boolean | null
}

export async function findInviter(code: string): Promise<Inviter | null> {
  const { data, error } = await adminDb()
    .from('dentists')
    .select('id, name, slug, city, profile_photo, created_at, is_verified, is_active')
    .eq('invite_code', code)
    .maybeSingle()
  if (error || !data || (data as { is_active?: boolean }).is_active === false) return null
  return data as Inviter
}
