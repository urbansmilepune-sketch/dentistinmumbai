// POST /api/reviews/otp — issues a 6-digit OTP to a patient phone before
// they leave a review, using the MSG91 DLT-approved REVIEW_OTP Flow
// template. The OTP is persisted to public.review_otps with a 10-minute
// expiry; verification happens elsewhere (the submit-review path checks
// the row and flips `used`).
//
// Required env:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   MSG91_AUTH_KEY
//   MSG91_TEMPLATE_ID_REVIEW_OTP
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const phoneRaw = typeof body?.phone === 'string' ? body.phone : ''
  const phone = phoneRaw.replace(/\s/g, '')
  const dentist_id = typeof body?.dentist_id === 'string' && body.dentist_id ? body.dentist_id : null

  if (!/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: 'Valid 10-digit phone required' }, { status: 400 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[reviews/otp] missing supabase env vars')
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Upsert on `phone` so a patient who re-clicks "Send OTP" (mistyped the
  // first code, didn't receive the SMS, etc.) gets a fresh OTP + expiry on
  // the SAME row instead of a 23505 from the phone-unique index. The
  // re-request also resets `used` to false so a previously-burnt row
  // doesn't lock the patient out of resending.
  const { error: insertErr } = await supabase
    .from('review_otps')
    .upsert(
      { phone, otp, dentist_id, expires_at, used: false },
      { onConflict: 'phone' },
    )
  if (insertErr) {
    console.error('[reviews/otp] upsert failed', {
      code: insertErr.code, message: insertErr.message, details: insertErr.details,
    })
    return NextResponse.json({ error: 'Could not issue OTP' }, { status: 500 })
  }

  const tpl = process.env.MSG91_TEMPLATE_ID_REVIEW_OTP
  if (!tpl) {
    // Mirror sms.ts behavior: if the template isn't wired we leave a log
    // trail (dev/staging) and still report success so the UI can move on.
    console.log('[reviews/otp] no template id; OTP for', phone, ':', otp)
    return NextResponse.json({ success: true })
  }

  const result = await sendSMS(phone, tpl, [otp])
  if (!result.success) {
    console.error('[reviews/otp] SMS send failed', result)
    // The OTP row is already in the DB; surface the failure so the client
    // can show an error and the patient can retry.
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
