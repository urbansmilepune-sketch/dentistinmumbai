// POST /api/dentist/phone-otp/send — texts a 6-digit OTP to the
// signed-in dentist's listed phone so they can verify ownership of the
// number. Mirrors the patient-side /api/reviews/otp shape (MSG91 Flow,
// 10-minute expiry, dev-fallback when no template id is configured),
// but stores rows in dentist_phone_otps keyed on dentist_id to avoid
// colliding with the patient-keyed review_otps table.
//
// Optional env: MSG91_TEMPLATE_ID_DENTIST_OTP. Without it the route
// logs the OTP and returns success — same dev-friendly behaviour the
// review OTP endpoint already uses.

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

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Upsert on dentist_id so a re-click of "Send OTP" (mistyped first
  // code, SMS late, etc.) resets the row instead of failing on the
  // unique constraint.
  const { error: insertErr } = await admin
    .from('dentist_phone_otps')
    .upsert(
      { dentist_id: dentist.id, phone: phoneDigits, otp, expires_at, used: false },
      { onConflict: 'dentist_id' },
    )
  if (insertErr) {
    console.error('[dentist phone-otp send] upsert failed', {
      code: insertErr.code, message: insertErr.message, details: insertErr.details,
    })
    return NextResponse.json({ error: 'Could not issue OTP' }, { status: 500 })
  }

  const tpl = process.env.MSG91_TEMPLATE_ID_DENTIST_OTP
  if (!tpl) {
    console.log('[dentist phone-otp send] no template id; OTP for', phoneDigits, ':', otp)
    return NextResponse.json({ success: true })
  }

  const result = await sendSMS(phoneDigits, tpl, [otp])
  if (!result.success) {
    console.error('[dentist phone-otp send] SMS send failed', result)
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
