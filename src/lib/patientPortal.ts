// Patient-portal session token. After a patient verifies their phone via OTP
// we mint an HS256 JWT bound to that phone and put it in an httpOnly cookie
// (JS can't read it, so an XSS bug can't steal it). The token lasts 7 days and
// is re-minted on every API call, so it only expires after 7 days of no use. The portal's data
// API trusts this token to prove phone ownership, then re-checks that any
// patient_id it's asked about actually belongs to that phone — the token alone
// never grants access to a record. There is no per-clinic switch: a patient
// sees every clinic that has their number on file.
//
// Signing secret: a dedicated PATIENT_PORTAL_JWT_SECRET if set, otherwise the
// server-only SUPABASE_SERVICE_ROLE_KEY (never exposed to the browser). This
// keeps the portal working with zero extra config while allowing a dedicated
// secret in production.
import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'

// Logged out after this many days without using the app.
export const PATIENT_IDLE_DAYS = 7
const IDLE_SECONDS = PATIENT_IDLE_DAYS * 24 * 60 * 60
const TOKEN_TTL = `${IDLE_SECONDS}s`

export const PATIENT_SESSION_COOKIE = 'dentistin_patient_session'

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    // Only the patient APIs ever need it.
    path: '/api/patient',
    maxAge,
  }
}

// Mint a fresh 7-day token for this phone and put it on the response. Called
// at login and on every authenticated patient API call (sliding expiry).
export async function setPatientSessionCookie(res: NextResponse, phone: string): Promise<void> {
  const token = await mintPatientToken(phone)
  res.cookies.set(PATIENT_SESSION_COOKIE, token, cookieOptions(IDLE_SECONDS))
}

export function clearPatientSessionCookie(res: NextResponse): void {
  res.cookies.set(PATIENT_SESSION_COOKIE, '', cookieOptions(0))
}

// The session token: the httpOnly cookie, or (for sessions saved before the
// cookie existed) an Authorization: Bearer header. The bearer path can be
// removed once old 24h tokens have all expired.
export function patientTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(PATIENT_SESSION_COOKIE)?.value || bearerFromRequest(request)
}

function getSecret(): Uint8Array {
  const secret = process.env.PATIENT_PORTAL_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || secret.length < 32) {
    throw new Error('PATIENT_PORTAL_JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY missing or too short')
  }
  return new TextEncoder().encode(secret)
}

export interface PatientPortalClaims {
  // Always the last-10-digits form so it matches regardless of how the phone
  // was stored on the patient row ("+91 98…", "098…", etc.).
  phone: string
}

export async function mintPatientToken(phone: string): Promise<string> {
  return await new SignJWT({ phone })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('patient_portal')
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret())
}

export async function verifyPatientToken(token: string): Promise<PatientPortalClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { subject: 'patient_portal' })
    const phone = typeof payload.phone === 'string' ? payload.phone : ''
    if (!/^\d{10}$/.test(phone)) return null
    return { phone }
  } catch {
    return null
  }
}

// Normalise any stored/typed phone to the 10-digit subscriber number so login
// matching is tolerant of "+91", spaces and leading zeros.
export function phoneTail10(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.slice(-10)
}

// Pull the bearer token out of an Authorization header.
export function bearerFromRequest(request: Request): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!auth) return null
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}
