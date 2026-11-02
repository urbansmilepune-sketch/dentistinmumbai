// "Remember me" persistent-login workaround for the free Supabase plan (which
// doesn't let us raise the session inactivity timeout). A dentist gets a
// long-lived, httpOnly cookie whose secret half is stored HASHED in
// dentist_remember_tokens; when the Supabase session is gone, the proxy bounces
// through /api/auth/remember-me, which validates the cookie and mints a fresh
// session.
//
// Security model:
//   - httpOnly + Secure cookie → not readable by JS, so XSS can't steal it.
//   - Cookie value is "<seriesId>.<validator>". seriesId is the DB row id;
//     validator is a 256-bit CSPRNG secret. Only the SHA-256 of the validator
//     is stored, so a DB read can't reconstruct a usable cookie.
//   - 30-day sliding expiry: each silent re-login extends the token (and the
//     cookie) by another 30 days. Not used for 30 days → back to /login.
//   - Logout revokes the token row, so a copied cookie stops working too.
//   - Table is service-role only (RLS on, no policies) — never touched by the
//     anon/user clients.

import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const REMEMBER_COOKIE = 'dentistin_remember'
export const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60 // 30 days, in seconds

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function rememberCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: REMEMBER_MAX_AGE,
  }
}

// Options for clearing the cookie (same attributes, expired).
export function clearRememberCookieOptions() {
  return { ...rememberCookieOptions(), maxAge: 0 }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function newValidator(): string {
  return randomBytes(32).toString('base64url')
}

// Creates a remember-me row for a dentist and returns the cookie value to set,
// or null if the row couldn't be written.
export async function issueRememberToken(
  admin: SupabaseClient,
  dentistId: string,
): Promise<string | null> {
  const validator = newValidator()
  const expires_at = new Date(Date.now() + REMEMBER_MAX_AGE * 1000).toISOString()
  const { data, error } = await admin
    .from('dentist_remember_tokens')
    .insert({ dentist_id: dentistId, token_hash: sha256(validator), expires_at })
    .select('id')
    .single()
  if (error || !data) {
    // Loud on purpose: if this fails the dentist silently loses 30-day login.
    console.error('[rememberMe] could not issue token', { message: error?.message })
    return null
  }
  return `${data.id}.${validator}`
}

type ConsumeResult =
  | { ok: true; email: string; cookieValue: string }
  | { ok: false }

// Validates a remember cookie and, on success, slides its expiry forward another
// 30 days and returns the dentist's email plus the cookie value to re-set.
// Returns { ok: false } for any invalid / expired case — the caller should
// clear the cookie.
//
// The validator is NOT rotated on use. It used to be, with "a stale validator
// means theft → revoke every token for this dentist". In practice the stale
// case was almost always innocent: two requests racing through re-auth at once
// (two tabs, the installed app plus a browser tab, a double tap, or a response
// the phone dropped while switching networks). The loser looked like a thief,
// so every device got logged out long before 30 days. The cookie stays httpOnly
// + Secure and only its hash is stored, and logout still revokes it.
export async function consumeRememberToken(
  admin: SupabaseClient,
  cookieValue: string,
): Promise<ConsumeResult> {
  const dot = cookieValue.indexOf('.')
  if (dot < 1) return { ok: false }
  const seriesId = cookieValue.slice(0, dot)
  const validator = cookieValue.slice(dot + 1)
  if (!validator || !UUID_RE.test(seriesId)) return { ok: false }

  const { data: row, error: readErr } = await admin
    .from('dentist_remember_tokens')
    .select('id, dentist_id, token_hash, expires_at')
    .eq('id', seriesId)
    .maybeSingle()
  if (readErr) {
    console.error('[rememberMe] token lookup failed', { message: readErr.message })
    return { ok: false }
  }
  if (!row) return { ok: false }

  // Expired — clean up and reject.
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from('dentist_remember_tokens').delete().eq('id', row.id)
    return { ok: false }
  }

  // Wrong secret for this series: reject, but leave the dentist's other
  // devices alone.
  if (sha256(validator) !== row.token_hash) return { ok: false }

  const { data: dentist } = await admin
    .from('dentists')
    .select('email')
    .eq('id', row.dentist_id)
    .maybeSingle()
  if (!dentist?.email) {
    await admin.from('dentist_remember_tokens').delete().eq('id', row.id)
    return { ok: false }
  }

  // Sliding expiry: every silent re-login pushes the cap out to 30 days from
  // now, so a dentist who opens the app at least once a month stays signed in.
  // Best-effort — a failed update just means the old expiry still applies.
  const expires_at = new Date(Date.now() + REMEMBER_MAX_AGE * 1000).toISOString()
  await admin.from('dentist_remember_tokens').update({ expires_at }).eq('id', row.id)

  return { ok: true, email: dentist.email, cookieValue }
}

// Revokes a single series — used on explicit logout. Best-effort.
export async function revokeRememberSeries(admin: SupabaseClient, cookieValue: string): Promise<void> {
  const dot = cookieValue.indexOf('.')
  const seriesId = dot > 0 ? cookieValue.slice(0, dot) : cookieValue
  if (!UUID_RE.test(seriesId)) return
  await admin.from('dentist_remember_tokens').delete().eq('id', seriesId)
}
