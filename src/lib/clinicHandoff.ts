// "Manage my clinic" on dentistinindia.in (Nov 2026).
//
// Each domain has its own login cookie, so a dentist signed in on
// dentistinindia.in is not signed in on dentistinpune.in. The button posts to
// /api/auth/clinic-handoff on the national site, which stores a random
// one-time token (only its SHA-256 hash, in login_handoffs) and sends the
// browser to the same route on the dentist's city domain. That GET marks the
// token used (one atomic update: unused + not expired) and signs the dentist
// in there, then opens the dashboard page they picked.
//
// Tokens live 2 minutes and work once. If the table is missing (SQL not run
// yet) the button falls back to the city site's normal login page.

import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, type CityConfig } from '@/config/cities'

export const HANDOFF_TTL_SECONDS = 120

// Dashboard pages the card links to. Anything else falls back to the
// dashboard home, so the route can't be used as an open redirect.
export const CLINIC_PAGES: Record<string, string> = {
  home: '/for-dentists/dashboard',
  appointments: '/for-dentists/dashboard/appointments',
  patients: '/for-dentists/dashboard/patients',
  billing: '/for-dentists/dashboard/billing',
  calendar: '/for-dentists/dashboard/calendar',
  google: '/for-dentists/dashboard/google-booking',
  reviews: '/for-dentists/dashboard/reviews',
  profile: '/for-dentists/dashboard/profile',
}

export function clinicPath(key: string | null | undefined): string {
  return (key && CLINIC_PAGES[key]) || CLINIC_PAGES.home
}

/** The dentist's city site, or null when their city has no domain. */
export function clinicCity(citySlug: string | null | undefined): CityConfig | null {
  if (!citySlug) return null
  return (CITY_CONFIGS as Record<string, CityConfig>)[citySlug] ?? null
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Creates a one-time token for this dentist. Returns null if the table is missing. */
export async function createHandoff(db: SupabaseClient, dentistId: string, targetHost: string): Promise<string | null> {
  const token = randomBytes(32).toString('base64url')
  const { error } = await db.from('login_handoffs').insert({
    token_hash: hashToken(token),
    dentist_id: dentistId,
    target_host: targetHost,
    expires_at: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000).toISOString(),
  })
  if (error) return null
  // Old rows are useless after 2 minutes; tidy up now and then.
  if (Math.random() < 0.05) {
    await db.from('login_handoffs').delete().lt('expires_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
  }
  return token
}

/** Marks the token used and returns its dentist, or null if unknown, used, expired or for another host. */
export async function consumeHandoff(db: SupabaseClient, token: string, host: string): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 100) return null
  const { data, error } = await db
    .from('login_handoffs')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('dentist_id, target_host')
    .maybeSingle()
  if (error || !data) return null
  const want = String(data.target_host || '').replace(/^www\./, '')
  if (want !== host.replace(/^www\./, '')) return null
  return data.dentist_id as string
}
