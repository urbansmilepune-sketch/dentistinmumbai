// POST /api/patient/otp/send — issues a 6-digit login code for the patient
// app, by SMS (body { phone }) or by email (body { email }). The patient owns
// their records: any clinic on DentistIn that has this phone or email on file
// shows up after login, with no switch for the dentist to turn on. We only
// send if the phone or email is on file at some clinic, so random numbers or
// addresses can't have codes sent to them.
//
// SMS template, first one set wins. The dentist login OTP template is the
// one already live, so patients reuse it unless a patient-only one is added:
//   MSG91_TEMPLATE_ID_PATIENT_OTP
//   MSG91_TEMPLATE_ID_DENTIST_OTP
//   MSG91_TEMPLATE_ID_REVIEW_OTP
// Email uses the same login-code email as dentists (Resend).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { sendLoginOtpEmail } from '@/lib/email'
import { getCityByDomain } from '@/config/cities'
import { phoneTail10, normEmail, isEmail, byPhone, byEmail, patientMatch, otpKeyFor } from '@/lib/patientPortal'
import { isMissingColumnError } from '@/lib/otpAttempts'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const viaEmail = typeof body?.email === 'string'
  const email = normEmail(body?.email)
  const phone = phoneTail10(body?.phone)
  if (viaEmail ? !isEmail(email) : !/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: viaEmail ? 'Enter a valid email address.' : 'Enter a valid 10-digit mobile number.' }, { status: 400 })
  }
  const who = viaEmail ? byEmail(email) : byPhone(phone)

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[patient/otp/send] missing supabase env vars')
    return NextResponse.json({ error: 'Portal not configured' }, { status: 500 })
  }

  const db = admin()

  // Gate: the phone or email must be on file at one clinic at least.
  const match = patientMatch(who)
  const { data: matches, error: lookupErr } = await db
    .from('patients')
    .select('id')
    .ilike(match.column, match.pattern)
    .limit(1)
  if (lookupErr) {
    console.error('[patient/otp/send] lookup failed', lookupErr)
    return NextResponse.json({ error: 'Could not look up your records' }, { status: 500 })
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({
      error: viaEmail
        ? 'We could not find any dental records for this email. Use the email you gave at the clinic, or log in with your mobile number.'
        : 'We could not find any dental records for this number. Use the mobile number you gave at the clinic, or book a visit first.',
    }, { status: 404 })
  }

  // One row per login in patient_portal_otps. Its `phone` column holds the
  // 10-digit phone, or "email:<address>" for email logins (see otpKeyFor).
  const key = otpKeyFor(who)

  // Rate limit: the row is upserted on every send, so reject if this phone or
  // email was sent a code in the last 3 minutes. Stops SMS/email bombing.
  const { data: lastOtp } = await db
    .from('patient_portal_otps')
    .select('created_at')
    .eq('phone', key)
    .maybeSingle()
  if (lastOtp?.created_at && Date.now() - new Date(lastOtp.created_at).getTime() < 3 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes before requesting another code.' },
      { status: 429 },
    )
  }

  const tpl = process.env.MSG91_TEMPLATE_ID_PATIENT_OTP
    || process.env.MSG91_TEMPLATE_ID_DENTIST_OTP
    || process.env.MSG91_TEMPLATE_ID_REVIEW_OTP
  // In production a missing template means no SMS goes out. Saying "sent"
  // there left patients waiting for a code that never came, so fail loudly.
  if (!viaEmail && !tpl && process.env.VERCEL_ENV === 'production') {
    console.error('[patient/otp/send] no MSG91 OTP template set (PATIENT / DENTIST / REVIEW); login SMS cannot be sent')
    return NextResponse.json({ error: 'Login by SMS is not set up yet. Please log in with email or Google.' }, { status: 503 })
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // A re-send reuses the row, so reset the wrong-guess counter too.
  // If the failed_attempts column hasn't been added yet, retry without it.
  const otpRow = { phone: key, otp, expires_at, used: false, created_at: new Date().toISOString() }
  let { error: upsertErr } = await db
    .from('patient_portal_otps')
    .upsert({ ...otpRow, failed_attempts: 0 }, { onConflict: 'phone' })
  if (isMissingColumnError(upsertErr)) {
    ;({ error: upsertErr } = await db
      .from('patient_portal_otps')
      .upsert(otpRow, { onConflict: 'phone' }))
  }
  if (upsertErr) {
    console.error('[patient/otp/send] upsert failed', upsertErr)
    return NextResponse.json({ error: 'Could not issue a code' }, { status: 500 })
  }

  if (viaEmail) {
    try {
      const city = getCityByDomain(request.headers.get('host'))
      await sendLoginOtpEmail({ to_email: email, otp, city: city.citySlug })
    } catch (err) {
      console.error('[patient/otp/send] email send failed', err)
      return NextResponse.json({ error: 'Could not send the code. Please try again.' }, { status: 502 })
    }
    return NextResponse.json({ success: true })
  }

  if (!tpl) {
    // Local dev without a DLT template: log the code and carry on.
    console.log('[patient/otp/send] no template id; OTP for', phone, ':', otp)
    return NextResponse.json({ success: true })
  }

  const result = await sendSMS(phone, tpl, [otp])
  if (!result.success) {
    console.error('[patient/otp/send] SMS send failed', result)
    return NextResponse.json({ error: 'Failed to send OTP. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
