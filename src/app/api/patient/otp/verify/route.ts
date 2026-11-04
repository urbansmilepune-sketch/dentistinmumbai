// POST /api/patient/otp/verify — checks the 6-digit code, and on success
// sets the 7-day httpOnly portal session cookie and returns the list of clinics (one per dentist) where
// this phone is a patient. The patient picks a clinic and
// the dashboard fetches that clinic's records with the token.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setPatientSessionCookie, phoneTail10 } from '@/lib/patientPortal'
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

  const phone = phoneTail10(body?.phone)
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''
  if (!/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your SMS.' }, { status: 400 })
  }

  const db = admin()

  const { data: row } = await db
    .from('patient_portal_otps')
    .select('*')
    .eq('phone', phone)
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
    return NextResponse.json({ error: 'Incorrect code. Check the SMS and try again.' }, { status: 400 })
  }

  // Burn the OTP before issuing the token so a replayed request can't re-verify.
  await db.from('patient_portal_otps').update({ used: true }).eq('id', row.id)

  // Every clinic this number is a patient at.
  const { data: patientRows, error: pErr } = await db
    .from('patients')
    .select('id, name, dentist:dentists(id, name, clinic_name, city)')
    .ilike('phone', `%${phone}`)
  if (pErr) {
    console.error('[patient/otp/verify] patients lookup failed', pErr)
    return NextResponse.json({ error: 'Could not load your records' }, { status: 500 })
  }
  if (!patientRows || patientRows.length === 0) {
    return NextResponse.json({ error: 'We could not find any dental records for this number.' }, { status: 404 })
  }

  // Stamp last-login on all matched rows (best-effort; non-blocking semantics).
  const ids = patientRows.map((r: any) => r.id)
  await db.from('patients').update({ portal_last_login: new Date().toISOString() }).in('id', ids)

  const clinics = patientRows.map((r: any) => ({
    patient_id: r.id,
    patient_name: r.name,
    dentist_id: r.dentist?.id ?? null,
    dentist_name: r.dentist?.name ?? null,
    clinic_name: r.dentist?.clinic_name ?? null,
    city: r.dentist?.city ?? null,
  }))

  // The token lives only in the httpOnly cookie, never in the JSON body.
  const res = NextResponse.json({ success: true, clinics })
  await setPatientSessionCookie(res, phone)
  return res
}
