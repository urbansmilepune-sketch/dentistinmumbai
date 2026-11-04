// POST /api/patient/otp/send — issues a 6-digit login OTP to a patient's
// phone for the patient app. The patient owns their records: any clinic on
// DentistIn that has this number on file shows up after login, with no
// switch for the dentist to turn on. We only send if the number is on file
// at some clinic, so random numbers can't have codes texted out.
//
// SMS template, first one set wins. The dentist login OTP template is the
// one already live, so patients reuse it unless a patient-only one is added:
//   MSG91_TEMPLATE_ID_PATIENT_OTP
//   MSG91_TEMPLATE_ID_DENTIST_OTP
//   MSG91_TEMPLATE_ID_REVIEW_OTP
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { phoneTail10 } from '@/lib/patientPortal'
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

  const phone = phoneTail10(body?.phone)
  if (!/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[patient/otp/send] missing supabase env vars')
    return NextResponse.json({ error: 'Portal not configured' }, { status: 500 })
  }

  const db = admin()

  // Gate: the number must be on file at one clinic at least.
  const { data: matches, error: lookupErr } = await db
    .from('patients')
    .select('id')
    .ilike('phone', `%${phone}`)
    .limit(1)
  if (lookupErr) {
    console.error('[patient/otp/send] lookup failed', lookupErr)
    return NextResponse.json({ error: 'Could not look up your records' }, { status: 500 })
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({
      error: 'We could not find any dental records for this number. Use the mobile number you gave at the clinic, or book a visit first.',
    }, { status: 404 })
  }

  // Rate limit: patient_portal_otps is one-row-per-phone (upsert below), so we
  // throttle by minimum interval rather than counting rows — reject if this
  // number was sent a code in the last 3 minutes. Caps ~3 sends per 10 min and
  // stops SMS-bombing a victim's phone. Relies on the upsert refreshing
  // created_at.
  const { data: lastOtp } = await db
    .from('patient_portal_otps')
    .select('created_at')
    .eq('phone', phone)
    .maybeSingle()
  if (lastOtp?.created_at && Date.now() - new Date(lastOtp.created_at).getTime() < 3 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes before requesting another OTP.' },
      { status: 429 },
    )
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // A re-send reuses the phone's row, so reset the wrong-guess counter too.
  // If the failed_attempts column hasn't been added yet, retry without it.
  const otpRow = { phone, otp, expires_at, used: false, created_at: new Date().toISOString() }
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
    return NextResponse.json({ error: 'Could not issue OTP' }, { status: 500 })
  }

  const tpl = process.env.MSG91_TEMPLATE_ID_PATIENT_OTP
    || process.env.MSG91_TEMPLATE_ID_DENTIST_OTP
    || process.env.MSG91_TEMPLATE_ID_REVIEW_OTP
  if (!tpl) {
    // In production a missing template means no SMS goes out. Saying "sent"
    // there left patients waiting for a code that never came, so fail
    // loudly instead. Local dev still logs the code and carries on.
    if (process.env.VERCEL_ENV === 'production') {
      console.error('[patient/otp/send] no MSG91 OTP template set (PATIENT / DENTIST / REVIEW); login SMS cannot be sent')
      return NextResponse.json({ error: 'Login by SMS is not set up yet. Please ask your clinic.' }, { status: 503 })
    }
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
