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
import { createClient } from '@/lib/supabase/server'

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
  return NextResponse.json({ success: true })
}
