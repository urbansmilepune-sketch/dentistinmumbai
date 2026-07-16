// POST /api/auth/password-login — signs a dentist in with email + password
// server-side and sets the Supabase session cookies on THIS response, then
// returns { success: true }. The client hard-navigates to its landing page so
// the dashboard's SSR auth gate sees the session on the very first server
// render — the same server-set-cookie pattern the email-OTP verify route uses
// (see api/auth/email-otp/verify/route.ts).
//
// Why not signInWithPassword on the browser client: that path set the session
// via the browser SDK and then did a soft (RSC) navigation, which didn't
// reliably deliver the cookie to the first server render — the gate saw no
// user and bounced back to /login.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { REMEMBER_COOKIE, rememberCookieOptions, issueRememberToken } from '@/lib/auth/rememberMe'

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: 'Enter your password.' }, { status: 400 })
  }

  // SSR server client — in a Route Handler its setAll can write cookies onto
  // the response, so a successful sign-in lands the session cookie here.
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    // Google-only / invite-only / never-set-a-password accounts fail here.
    // Mirror the client's existing copy that steers them toward Email OTP.
    return NextResponse.json(
      { error: 'Incorrect email or password. If you signed in with Google before, or never set a password, use a one-time email code instead.' },
      { status: 401 },
    )
  }

  // Session cookies are queued on this response. The client hard-navigates to
  // its computed landing (national /feed vs city dashboard, honouring ?next=).
  const response = NextResponse.json({ success: true })

  // "Remember me" (default on): issue a long-lived rotating token so an expired
  // session can be silently re-minted (free plan has no configurable timeout).
  // Owner dentists only — staff have no dentists row for the FK; they fall back
  // to the normal session.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: dentist } = await admin
    .from('dentists')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (dentist?.id) {
    const cookieValue = await issueRememberToken(admin, dentist.id)
    if (cookieValue) response.cookies.set(REMEMBER_COOKIE, cookieValue, rememberCookieOptions())
  }

  return response
}
