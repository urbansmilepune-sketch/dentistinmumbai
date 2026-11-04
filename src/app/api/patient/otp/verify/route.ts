// POST /api/patient/otp/verify — checks the 6-digit code (body { phone, otp }
// or { email, otp }), and on success
// sets the 7-day httpOnly portal session cookie and returns the list of clinics (one per dentist) where
// this phone or email is a patient. The patient picks a clinic and
// the dashboard fetches that clinic's records with the token.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setPatientSessionCookie, phoneTail10, normEmail, isEmail, byPhone, byEmail, otpKeyFor } from '@/lib/patientPortal'
import { loadClinicsFor } from '@/lib/patientClinics'
import { guardRequest } from '@/lib/apiGuards'
import { MAX_OTP_ATTEMPTS, failedAttemptsFor, recordFailedAttempt } from '@/lib/otpAttempts'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  // Per-IP cap on guesses, on top of the per-code lockout below.
  const limited = guardRequest(request, 'patient-otp-verify', {
    max: 20, windowMs: 10 * 60 * 1000, retryAfterSeconds: 300,
    message: 'Too many attempts. Please wait a few minutes and try again.',
  })
  if (limited) return limited

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const viaEmail = typeof body?.email === 'string'
  const email = normEmail(body?.email)
  const phone = phoneTail10(body?.phone)
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''
  if (viaEmail ? !isEmail(email) : !/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: viaEmail ? 'Enter a valid email address.' : 'Enter a valid 10-digit mobile number.' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: `Enter the 6-digit code from your ${viaEmail ? 'email' : 'SMS'}.` }, { status: 400 })
  }
  const who = viaEmail ? byEmail(email) : byPhone(phone)

  const db = admin()

  const { data: row } = await db
    .from('patient_portal_otps')
    .select('*')
    .eq('phone', otpKeyFor(who))
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'No active code — request a new one.' }, { status: 400 })
  if (row.used) return NextResponse.json({ error: 'That code was already used — request a new one.' }, { status: 400 })
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired — request a new one.' }, { status: 400 })
  }
  if (failedAttemptsFor(row) >= MAX_OTP_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many wrong codes — request a new one.' }, { status: 429 })
  }
  if (row.otp !== otp) {
    const fails = await recordFailedAttempt(db, 'patient_portal_otps', row)
    if (fails >= MAX_OTP_ATTEMPTS) {
      await db.from('patient_portal_otps').update({ used: true }).eq('id', row.id)
      return NextResponse.json({ error: 'Too many wrong codes — request a new one.' }, { status: 429 })
    }
    return NextResponse.json({ error: `Incorrect code. Check the ${viaEmail ? 'email' : 'SMS'} and try again.` }, { status: 400 })
  }

  // Burn the OTP before issuing the token so a replayed request can't re-verify.
  await db.from('patient_portal_otps').update({ used: true }).eq('id', row.id)

  // Every clinic this phone or email is a patient at.
  const { clinics, error: pErr } = await loadClinicsFor(db, who)
  if (pErr) {
    console.error('[patient/otp/verify] patients lookup failed', pErr)
    return NextResponse.json({ error: 'Could not load your records' }, { status: 500 })
  }
  if (clinics.length === 0) {
    return NextResponse.json({ error: 'We could not find any dental records for this login.' }, { status: 404 })
  }

  // The token lives only in the httpOnly cookie, never in the JSON body.
  const res = NextResponse.json({ success: true, clinics })
  await setPatientSessionCookie(res, who)
  return res
}
