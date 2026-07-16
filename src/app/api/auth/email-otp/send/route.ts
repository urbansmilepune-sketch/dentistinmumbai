// POST /api/auth/email-otp/send — issues a 6-digit login code for the
// "Email OTP" method on the dentist login page. Generates the code, stores
// only its bcrypt hash in email_otps (expires in 10 minutes), and emails the
// plaintext code via Resend.
//
// We always return success regardless of whether the email maps to a real
// account: revealing "no such account" here would turn this into an email
// enumeration oracle. The code is useless without an account anyway — the
// verify step refuses to mint a session for an email with no auth user.
//
// Writes go through the service-role key; email_otps has RLS enabled with no
// policies, so it is only reachable this way.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { sendLoginOtpEmail } from '@/lib/email'
import { getCityByDomain } from '@/config/cities'

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  // Loose RFC-ish check — just enough to reject obvious junk before we spend
  // an OTP row and an email send on it.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Rate limit: cap OTP requests to 3 per email per rolling 10-minute window
  // so this endpoint can't be used to email-bomb an address with login codes.
  // Counted on the service-role client because email_otps has RLS enabled with
  // no policies. Checked BEFORE the insert below so a rejected request neither
  // counts against itself nor leaves a burnt row behind.
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count, error: countErr } = await admin
    .from('email_otps')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gt('created_at', windowStart)
  if (countErr) {
    console.error('[auth/email-otp/send] rate-limit count failed', {
      code: countErr.code, message: countErr.message,
    })
    return NextResponse.json({ error: 'Could not issue a login code. Please try again.' }, { status: 500 })
  }
  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait 10 minutes before requesting another OTP.' },
      { status: 429 },
    )
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const otp_hash = await bcrypt.hash(otp, 10)
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: insertErr } = await admin
    .from('email_otps')
    .insert({ email, otp_hash, expires_at })
  if (insertErr) {
    console.error('[auth/email-otp/send] insert failed', {
      code: insertErr.code, message: insertErr.message,
    })
    return NextResponse.json({ error: 'Could not issue a login code. Please try again.' }, { status: 500 })
  }

  // City from-address comes from the host the dentist is signing in on, so the
  // email matches the brand of the domain they're using (and stays DKIM-valid).
  const host = request.headers.get('host')
  const city = getCityByDomain(host)

  try {
    await sendLoginOtpEmail({ to_email: email, otp, city: city.citySlug })
  } catch (err) {
    console.error('[auth/email-otp/send] email send failed', err)
    return NextResponse.json({ error: 'Could not send the login code. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
