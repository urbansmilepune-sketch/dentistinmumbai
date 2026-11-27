// Signed "open my case draft" links sent in WhatsApp replies (Nov 2026).
//
// A dentist who sends case photos on WhatsApp gets a link like
// https://dentistinindia.in/wa/<token>. Opening it on their phone signs them
// in on dentistinindia.in and lands on /cases/new with the photos filled in,
// even if they have only ever signed in on their city site (each domain has
// its own login cookie, so a city-site session doesn't carry over).
//
// The token only goes to the dentist's own WhatsApp number. It carries the
// dentist id and an expiry, signed with a key derived from the Supabase
// service key, so it can't be forged or edited. The /wa page asks for one
// tap before signing in, so WhatsApp's link-preview robot can't use it.
import { createHmac, createHash, timingSafeEqual } from 'crypto'
import { NATIONAL_ORIGIN } from '@/config/cities'

const TTL_SECONDS = 48 * 3600

function key(): Buffer | null {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) return null
  return createHash('sha256').update(`wa-case-login:v1:${base}`).digest()
}

function sign(body: string, k: Buffer): string {
  return createHmac('sha256', k).update(body).digest('base64url').slice(0, 32)
}

export function waLoginToken(dentistId: string, now = Date.now()): string | null {
  const k = key()
  if (!k) return null
  const body = `${dentistId}.${Math.floor(now / 1000) + TTL_SECONDS}`
  return `${Buffer.from(body).toString('base64url')}.${sign(body, k)}`
}

/** Link for a WhatsApp reply; falls back to the plain page if no key is set. */
export function waCaseLink(dentistId: string): string {
  const t = waLoginToken(dentistId)
  return t ? `${NATIONAL_ORIGIN}/wa/${t}` : `${NATIONAL_ORIGIN}/cases/new`
}

/** Link for the WhatsApp activity summary: one tap signs in and opens /alerts. */
export function waAlertsLink(dentistId: string): string {
  const t = waLoginToken(dentistId)
  return t ? `${NATIONAL_ORIGIN}/wa/${t}?to=alerts` : `${NATIONAL_ORIGIN}/alerts`
}

export type WaTokenCheck = { ok: true; dentistId: string } | { ok: false; reason: 'invalid' | 'expired' }

export function checkWaLoginToken(token: string, now = Date.now()): WaTokenCheck {
  const k = key()
  const [b64, sig] = String(token || '').split('.')
  if (!k || !b64 || !sig) return { ok: false, reason: 'invalid' }
  let body = ''
  try { body = Buffer.from(b64, 'base64url').toString('utf8') } catch { return { ok: false, reason: 'invalid' } }
  const expected = sign(body, k)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' }
  const [dentistId, exp] = body.split('.')
  if (!dentistId || !/^\d+$/.test(exp || '')) return { ok: false, reason: 'invalid' }
  if (Number(exp) * 1000 < now) return { ok: false, reason: 'expired' }
  return { ok: true, dentistId }
}

/** Link for the Monday "Your week" recap: one tap signs in and opens /week. */
export function waWeekLink(dentistId: string): string {
  const t = waLoginToken(dentistId)
  return t ? `${NATIONAL_ORIGIN}/wa/${t}?to=week` : `${NATIONAL_ORIGIN}/week`
}
