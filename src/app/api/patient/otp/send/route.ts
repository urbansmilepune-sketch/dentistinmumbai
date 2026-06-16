// POST /api/patient/otp/send — issues a 6-digit login OTP to a patient's
// phone for the public patient portal. We only send if at least one patient
// record on that number has portal_access enabled, so a dentist who hasn't
// switched the portal on for a patient can't have codes texted out.
//
// Optional env (falls back to the review-OTP template, same recipient type):
//   MSG91_TEMPLATE_ID_PATIENT_OTP
//   MSG91_TEMPLATE_ID_REVIEW_OTP
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { phoneTail10 } from '@/lib/patientPortal'

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

  // Gate: the number must map to at least one patient row with portal access.
  const { data: matches, error: lookupErr } = await db
    .from('patients')
    .select('id, portal_access')
    .ilike('phone', `%${phone}`)
    .eq('portal_access', true)
    .limit(1)
  if (lookupErr) {
    console.error('[patient/otp/send] lookup failed', lookupErr)
    return NextResponse.json({ error: 'Could not look up your records' }, { status: 500 })
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({
      error: 'No clinic has enabled portal access for this number yet. Please ask your dentist to enable it.',
    }, { status: 404 })
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: upsertErr } = await db
    .from('patient_portal_otps')
    .upsert({ phone, otp, expires_at, used: false }, { onConflict: 'phone' })
  if (upsertErr) {
    console.error('[patient/otp/send] upsert failed', upsertErr)
    return NextResponse.json({ error: 'Could not issue OTP' }, { status: 500 })
  }

  const tpl = process.env.MSG91_TEMPLATE_ID_PATIENT_OTP || process.env.MSG91_TEMPLATE_ID_REVIEW_OTP
  if (!tpl) {
    // Dev/staging without a DLT template wired — log and report success so the
    // UI can advance to the OTP-entry step.
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
