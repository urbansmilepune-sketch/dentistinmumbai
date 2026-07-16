// POST /api/dentist/phone-otp/send — texts a 6-digit OTP to the
// signed-in dentist's listed phone so they can verify ownership of the
// number. Mirrors the patient-side /api/reviews/otp shape (MSG91 Flow,
// 10-minute expiry), but stores rows in dentist_phone_otps keyed on
// dentist_id to avoid colliding with the patient-keyed review_otps table.
//
// Template env: MSG91_TEMPLATE_ID_DENTIST_OTP, falling back to the proven
// MSG91_TEMPLATE_ID_REVIEW_OTP (same single-variable OTP template) so the
// flow works without a dedicated id wired. If neither is set we return a
// 503 rather than silently no-op'ing — an unconfigured OTP service must
// surface as an error, not a fake success.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/sms'

export async function POST(_request: NextRequest) {
  // Authn — the OTP is bound to the signed-in dentist, so we never trust
  // a dentist_id or phone from the request body.
  const cookieSupabase = await createCookieClient()
  const { data: { user } } = await cookieSupabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: dentist } = await admin
    .from('dentists')
    .select('id, phone, phone_verified')
    .eq('email', user.email)
    .maybeSingle()
  if (!dentist) {
    return NextResponse.json({ error: 'No dentist profile is linked to this account' }, { status: 404 })
  }

  const phoneDigits = (dentist.phone || '').replace(/\D/g, '')
  if (!/^\d{10}$/.test(phoneDigits)) {
    return NextResponse.json({ error: 'Set a valid 10-digit phone on your profile before verifying.' }, { status: 400 })
  }

  // Cheap short-circuit so we don't burn an SMS / OTP row on a dentist
  // who already cleared verification.
  if (dentist.phone_verified) {
    return NextResponse.json({ success: true, already_verified: true })
  }

  // Rate limit: dentist_phone_otps is one-row-per-dentist (upsert below), so we
  // throttle by minimum interval rather than counting rows — reject if this
  // dentist was sent a code in the last 3 minutes. Caps ~3 sends per 10 min and
  // stops SMS-bombing the listed number. Relies on the upsert refreshing
  // created_at.
  const { data: lastOtp } = await admin
    .from('dentist_phone_otps')
    .select('created_at')
    .eq('dentist_id', dentist.id)
    .maybeSingle()
  if (lastOtp?.created_at && Date.now() - new Date(lastOtp.created_at).getTime() < 3 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes before requesting another OTP.' },
      { status: 429 },
    )
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Upsert on dentist_id so a re-click of "Send OTP" (mistyped first
  // code, SMS late, etc.) resets the row instead of failing on the
  // unique constraint, and refreshes created_at so the rate-limit window
  // above measures from the latest send.
  const { error: insertErr } = await admin
    .from('dentist_phone_otps')
    .upsert(
      { dentist_id: dentist.id, phone: phoneDigits, otp, expires_at, used: false, created_at: new Date().toISOString() },
      { onConflict: 'dentist_id' },
    )
  if (insertErr) {
    console.error('[dentist phone-otp send] upsert failed', {
      code: insertErr.code, message: insertErr.message, details: insertErr.details,
    })
    return NextResponse.json({ error: 'Could not issue OTP' }, { status: 500 })
  }

  const tpl = process.env.MSG91_TEMPLATE_ID_DENTIST_OTP
    || process.env.MSG91_TEMPLATE_ID_REVIEW_OTP
  if (!tpl) {
    return NextResponse.json({ error: 'OTP service not configured' }, { status: 503 })
  }

  const result = await sendSMS(phoneDigits, tpl, [otp])
  if (!result.success) {
    console.error('[dentist phone-otp send] SMS send failed', result)
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
