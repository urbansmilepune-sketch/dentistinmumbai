// Patient-portal session token. After a patient verifies their phone via OTP
// we mint a short-lived (24h) HS256 JWT bound to that phone. The portal's data
// API trusts this token to prove phone ownership, then re-checks that any
// patient_id it's asked about actually belongs to that phone AND has
// portal_access enabled — the token alone never grants access to a record.
//
// Signing secret: a dedicated PATIENT_PORTAL_JWT_SECRET if set, otherwise the
// server-only SUPABASE_SERVICE_ROLE_KEY (never exposed to the browser). This
// keeps the portal working with zero extra config while allowing a dedicated
// secret in production.
import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL = '24h'

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
