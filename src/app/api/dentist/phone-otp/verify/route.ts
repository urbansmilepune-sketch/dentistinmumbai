// POST /api/dentist/phone-otp/verify — accepts the 6-digit OTP that was
// texted by /api/dentist/phone-otp/send. On a match (not used, not
// expired, snapshot phone still equals the dentist's current phone),
// flips dentists.phone_verified = true and burns the OTP row.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const cookieSupabase = await createCookieClient()
  const { data: { user } } = await cookieSupabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your SMS.' }, { status: 400 })
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
  if (dentist.phone_verified) {
    return NextResponse.json({ success: true, already_verified: true })
  }

  const { data: row } = await admin
    .from('dentist_phone_otps')
    .select('id, phone, otp, expires_at, used')
    .eq('dentist_id', dentist.id)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ error: 'No active code — request a new one.' }, { status: 400 })
  }
  if (row.used) {
    return NextResponse.json({ error: 'That code was already used — request a new one.' }, { status: 400 })
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired — request a new one.' }, { status: 400 })
  }
  // Phone-edit-after-send guard: the OTP is tied to the phone that was
  // listed when the code was issued. If the dentist edited their phone
  // since then, refuse the code and force a re-send.
  const currentDigits = (dentist.phone || '').replace(/\D/g, '')
  if (row.phone !== currentDigits) {
    return NextResponse.json({ error: 'Phone number changed since the code was sent — request a new one.' }, { status: 400 })
  }
  if (row.otp !== otp) {
    return NextResponse.json({ error: 'Incorrect code. Check the SMS and try again.' }, { status: 400 })
  }

  // Two writes (burn OTP, flip flag). We do the dentist update second so
  // a failure there leaves the row burnt — a stale OTP can't be re-used
  // to flip the flag on a subsequent retry, the dentist just has to
  // request a fresh code.
  await admin.from('dentist_phone_otps').update({ used: true }).eq('id', row.id)

  const { error: updErr } = await admin
    .from('dentists')
    .update({ phone_verified: true })
    .eq('id', dentist.id)
  if (updErr) {
    console.error('[dentist phone-otp verify] dentist update failed', updErr)
    return NextResponse.json({ error: 'Could not mark phone verified — please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
