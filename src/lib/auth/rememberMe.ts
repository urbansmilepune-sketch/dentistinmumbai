// "Remember me" persistent-login workaround for the free Supabase plan (which
// doesn't let us raise the session inactivity timeout). A dentist gets a
// long-lived, httpOnly cookie whose secret half is stored HASHED in
// dentist_remember_tokens; when the Supabase session is gone, the proxy bounces
// through /api/auth/remember-me, which validates the cookie and mints a fresh
// session.
//
// Security model:
//   - httpOnly + Secure cookie → not readable by JS, so XSS can't steal it.
//   - Cookie value is "<seriesId>.<validator>". seriesId is the DB row id
//     (stable across rotations); validator is a 256-bit CSPRNG secret. Only the
//     SHA-256 of the validator is stored, so a DB read can't reconstruct a
//     usable cookie.
//   - Rotation + reuse detection: every successful use rotates the validator.
//     Presenting a stale validator for a known series means the old cookie was
//     replayed (theft) → we revoke EVERY token for that dentist.
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
  if (error || !data) return null
  return `${data.id}.${validator}`
}

type ConsumeResult =
  | { ok: true; email: string; cookieValue: string }
  | { ok: false }

// Validates a remember cookie and, on success, rotates the validator and returns
// the dentist's email plus the fresh cookie value. Detects replay of a stale
// validator (theft) and revokes the whole family. Returns { ok: false } for any
// invalid / expired / theft case — the caller should clear the cookie.
export async function consumeRememberToken(
  admin: SupabaseClient,
  cookieValue: string,
): Promise<ConsumeResult> {
  const dot = cookieValue.indexOf('.')
  if (dot < 1) return { ok: false }
  const seriesId = cookieValue.slice(0, dot)
  const validator = cookieValue.slice(dot + 1)
  if (!validator || !UUID_RE.test(seriesId)) return { ok: false }

  const { data: row } = await admin
    .from('dentist_remember_tokens')
    .select('id, dentist_id, token_hash, expires_at')
    .eq('id', seriesId)
    .maybeSingle()
  if (!row) return { ok: false }

  // Expired — clean up and reject.
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from('dentist_remember_tokens').delete().eq('id', row.id)
    return { ok: false }
  }

  // Theft: the series exists but the validator doesn't match the stored hash, so
  // an already-rotated (old) cookie is being replayed. Revoke every token for
  // this dentist and reject.
  if (sha256(validator) !== row.token_hash) {
    await admin.from('dentist_remember_tokens').delete().eq('dentist_id', row.dentist_id)
    return { ok: false }
  }

  const { data: dentist } = await admin
    .from('dentists')
    .select('email')
    .eq('id', row.dentist_id)
    .maybeSingle()
  if (!dentist?.email) {
    await admin.from('dentist_remember_tokens').delete().eq('id', row.id)
    return { ok: false }
  }

  // Rotate: new validator, same series id and same absolute expiry (so the
  // 30-day cap can't be extended indefinitely by using it).
  const nextValidator = newValidator()
  const { error: rotateErr } = await admin
    .from('dentist_remember_tokens')
    .update({ token_hash: sha256(nextValidator) })
    .eq('id', row.id)
  if (rotateErr) return { ok: false }

  return { ok: true, email: dentist.email, cookieValue: `${row.id}.${nextValidator}` }
}

// Revokes a single series — used on explicit logout. Best-effort.
export async function revokeRememberSeries(admin: SupabaseClient, cookieValue: string): Promise<void> {
  const dot = cookieValue.indexOf('.')
  const seriesId = dot > 0 ? cookieValue.slice(0, dot) : cookieValue
  if (!UUID_RE.test(seriesId)) return
  await admin.from('dentist_remember_tokens').delete().eq('id', seriesId)
}
