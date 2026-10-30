// Wrong-guess lockout for 6-digit login codes (dentist email OTP and patient
// phone OTP). Without it a script could try all 1,000,000 codes inside the
// 10-minute window.
//
// The durable counter is a `failed_attempts` column on each OTP table
// (see supabase/migrations/20261030120000_otp_failed_attempts.sql). Until that
// SQL has been run, the column read returns undefined and the update errors,
// so we fall back to an in-memory count per code row. That fallback resets on
// a cold start, which is why the column is the real fix.

import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_OTP_ATTEMPTS = 5

const memoryFails = new Map<string, number>()

/** Failures so far for this code row (column value, or the in-memory fallback). */
export function failedAttemptsFor(row: { id: string; failed_attempts?: number | null }): number {
  const fromColumn = typeof row.failed_attempts === 'number' ? row.failed_attempts : 0
  return Math.max(fromColumn, memoryFails.get(row.id) ?? 0)
}

/**
 * Record one wrong guess. Returns the new failure count. Never throws: a
 * failed write falls back to the in-memory counter.
 */
export async function recordFailedAttempt(
  db: SupabaseClient,
  table: 'email_otps' | 'patient_portal_otps',
  row: { id: string; failed_attempts?: number | null },
): Promise<number> {
  const next = failedAttemptsFor(row) + 1
  memoryFails.set(row.id, next)
  if (memoryFails.size > 5000) memoryFails.clear() // keep memory bounded
  const { error } = await db.from(table).update({ failed_attempts: next }).eq('id', row.id)
  if (error) console.warn(`[otpAttempts] ${table}.failed_attempts not saved (column missing?)`, error.message)
  return next
}

/** True when a PostgREST error means "this column doesn't exist yet". */
export function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST204' || error.code === '42703' || /failed_attempts/.test(error.message || '')
}
