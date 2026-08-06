// Anti-spam guards shared by the two public dentist-registration endpoints:
//   • /api/india/register   (national /join LinkedIn-style flow)
//   • /api/registrations     (city-domain instant-on flow)
//
// Added 2026-08-06 after a form-spam bot created ~13 junk
// dentist_registrations rows on the Ahmedabad domain — random mixed-case
// names/clinics ("kSEfkzmjhksYmDWIFBCldP"), scraped-looking emails, random
// 10-digit US-area-code phone numbers, and random ".com" LinkedIn URLs. The
// bot filled EVERY visible field (it selected the first non-empty <option>),
// so a CSS-hidden honeypot field plus server-side plausibility checks stop it
// without a CAPTCHA. Direct JSON posters that skip the form are still caught
// by the plausibility checks + rate limit.
//
// Bias: keep false-positives near zero. A blocked real dentist is a lost
// signup (= lost revenue), so every heuristic here is tuned against the
// observed spam and errs toward letting humans through.

import type { NextRequest } from 'next/server'

// The honeypot input both forms render. It is hidden with CSS
// (display:none / off-screen), NOT type=hidden — bots skip type=hidden but
// happily fill a text input whose label they can't see. Any value here means
// "not a human".
export const HONEYPOT_FIELD = 'website'

/** True when the payload's honeypot field carries a value → treat as a bot. */
export function honeypotTripped(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const v = (payload as Record<string, unknown>)[HONEYPOT_FIELD]
  return typeof v === 'string' && v.trim().length > 0
}

// ── Gibberish / random-token detector ──────────────────────────────────────
// Flags a SINGLE space-less token that looks machine-generated. We only judge
// space-less tokens: real multi-word names and clinic names ("Smile Dental
// Care", "Dr Nayak's Dental Clinic") contain spaces and are exempted here —
// the space/keyword rules below cover them. Tuned so real one-word names
// ("Parklane", "Smilekraft", "Dentzz") pass while random strings are caught.
export function looksLikeRandomToken(raw: string | null | undefined): boolean {
  if (!raw) return false
  const s = raw.trim()
  if (/\s/.test(s)) return false          // has a space — not our target
  const letters = s.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 8) return false    // too short to judge confidently

  // Signal 1: erratic mid-word capitalisation — an uppercase letter directly
  // after a lowercase one. Human text (Title Case, lowercase, UPPERCASE) has
  // ~0 of these; "kSEfkzmjhksYmDWIFBCldP" has many.
  let erraticCaps = 0
  for (let i = 1; i < s.length; i++) {
    if (/[A-Z]/.test(s[i]) && /[a-z]/.test(s[i - 1])) erraticCaps++
  }
  if (erraticCaps >= 3) return true

  // Signal 2: implausibly low vowel ratio. English-ish words sit around
  // 35-45% vowels; random consonant soup is far lower.
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length
  if (vowels / letters.length < 0.28) return true

  return false
}

/**
 * Validate a human name. Returns an error string, or null when acceptable.
 * Rule (per product owner): must contain a space OR start with "Dr." — this
 * rejects the single random tokens the bot submitted. Gibberish is rejected
 * outright regardless.
 */
export function validateHumanName(name: string): string | null {
  const s = name.trim()
  if (s.length < 2) return 'Please enter your full name.'
  if (looksLikeRandomToken(s)) return 'Please enter a valid name.'
  const hasSpace = /\s/.test(s)
  const startsWithDr = /^dr\.?\b/i.test(s)
  if (!hasSpace && !startsWithDr) {
    return 'Please enter your full name (e.g. "Dr. Rahul Sharma").'
  }
  return null
}

// Words that legitimately appear in a one-word-ish clinic name, so a real
// clinic like "SmileCare" or "Dentzz" isn't blocked by the space requirement.
const CLINIC_KEYWORDS = /(dental|dentist|clinic|care|smile|teeth|tooth|ortho|oral|health|centre|center|hospital|polyclinic|implant)/i

/**
 * Validate a clinic name. Returns an error string, or null when acceptable.
 * Rule: ≥5 chars AND (contains a space OR a common clinic keyword). Gibberish
 * is rejected outright.
 */
export function validateClinicName(clinic: string): string | null {
  const s = clinic.trim()
  if (s.length < 5) return 'Please enter your clinic name (at least 5 characters).'
  if (looksLikeRandomToken(s)) return 'Please enter a valid clinic name.'
  const hasSpace = /\s/.test(s)
  if (!hasSpace && !CLINIC_KEYWORDS.test(s)) {
    return 'Please enter your full clinic name.'
  }
  return null
}

/**
 * Normalise to a 10-digit Indian mobile number, or null if it isn't one.
 * Strips +91 / leading 0 / spaces / punctuation, then requires exactly 10
 * digits starting 6-9 (the valid Indian mobile range). The bot's numbers used
 * US area codes (starting 2-5), so this rejects them while accepting every
 * real Indian mobile.
 */
export function normalizeIndianMobile(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  let digits = String(raw).replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (!/^[6-9]\d{9}$/.test(digits)) return null
  return digits
}

/**
 * A provided LinkedIn URL must actually be a LinkedIn URL. Empty is fine
 * (the field is optional). The bot filled it with random ".com" domains.
 */
export function linkedinLooksFake(url: string | null | undefined): boolean {
  if (!url) return false
  const s = url.trim()
  if (!s) return false
  return !/^https?:\/\/([a-z0-9-]+\.)*linkedin\.[a-z.]+\//i.test(s)
}

// ── In-memory per-IP rate limiter ───────────────────────────────────────────
// Deliberately dependency-free and schema-free: the Supabase schema is managed
// out-of-band (no migrations can be pushed from here), so a DB-backed limiter
// isn't an option right now. This is per-serverless-instance state — it resets
// on cold start and isn't shared across concurrent instances, so treat it as
// defense-in-depth BEHIND the honeypot + plausibility checks, not the primary
// gate. It still crushes the common case: one bot hammering one warm instance.
const HITS = new Map<string, number[]>()
let lastSweep = 0

export function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Sliding-window limiter. Returns true when the caller is WITHIN the limit
 * (allowed), false when it has exceeded `max` hits in `windowMs`.
 */
export function withinRateLimit(key: string, max = 3, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now()

  // Opportunistic sweep so the map can't grow unbounded across many IPs.
  if (now - lastSweep > windowMs) {
    for (const [k, ts] of HITS) {
      const fresh = ts.filter(t => now - t < windowMs)
      if (fresh.length === 0) HITS.delete(k)
      else HITS.set(k, fresh)
    }
    lastSweep = now
  }

  const recent = (HITS.get(key) || []).filter(t => now - t < windowMs)
  if (recent.length >= max) {
    HITS.set(key, recent) // keep pruned list; do not record this attempt
    return false
  }
  recent.push(now)
  HITS.set(key, recent)
  return true
}
