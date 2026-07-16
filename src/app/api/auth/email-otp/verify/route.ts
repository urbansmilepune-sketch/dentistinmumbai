// POST /api/auth/email-otp/verify — verifies a 6-digit login code issued by
// /api/auth/email-otp/send and, on success, returns a one-time Supabase magic
// link the client navigates to. That link lands on /auth/callback, which
// exchanges it for a session cookie and routes the dentist to the dashboard —
// the same session mechanism the approval email uses (see lib/approval.ts).
//
// Checks performed (all must pass): a matching bcrypt hash, not expired
// (10-min window), and not already used. The code row is burned (used_at
// stamped) before the link is minted so a code can't be replayed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { REMEMBER_COOKIE, rememberCookieOptions, issueRememberToken } from '@/lib/auth/rememberMe'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Newest unused, unexpired code for this email. Resending issues a fresh
  // row, so the latest is the one the dentist is looking at.
  const nowIso = new Date().toISOString()
  const { data: row } = await admin
    .from('email_otps')
    .select('id, otp_hash, expires_at, used_at')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ error: 'That code has expired or was already used — request a new one.' }, { status: 400 })
  }

  const matches = await bcrypt.compare(otp, row.otp_hash)
  if (!matches) {
    return NextResponse.json({ error: 'Incorrect code. Check your email and try again.' }, { status: 400 })
  }

  // Burn the code first so a successful match can't be replayed even if the
  // session-minting below fails.
  await admin.from('email_otps').update({ used_at: new Date().toISOString() }).eq('id', row.id)

  // We've verified our own 6-digit code — now establish a Supabase session.
  // We can't hand our code to supabase.auth.verifyOtp directly: it's our own
  // bcrypt-hashed code, not a token GoTrue issued, so GoTrue wouldn't know it.
  // Instead mint a magic-link token server-side and consume its hashed_token
  // in the same request. generateLink(type:'magiclink') only resolves for an
  // existing auth user, so this also doubles as the "is this a real account?"
  // gate — we never create accounts from a login code.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const hashedToken = link?.properties?.hashed_token ?? null
  if (linkErr || !hashedToken) {
    console.error('[auth/email-otp/verify] generateLink failed', {
      message: linkErr?.message,
      status: (linkErr as { status?: number } | null)?.status,
      code: (linkErr as { code?: string } | null)?.code,
      hasHashedToken: !!hashedToken,
    })
    return NextResponse.json(
      { error: 'No account found for this email. Register first, or sign in with Google.' },
      { status: 404 },
    )
  }

  // Consume the token with the SSR server client so the session cookies land
  // on THIS response. Unlike a Server Component, a Route Handler is allowed to
  // write cookies (next/headers cookies() supports write here), so the
  // dashboard's SSR auth gate sees the session on the client's very next
  // (hard) navigation — no browser round-trip through a magic link, and no
  // implicit-flow #fragment that never reaches the server.
  // type:'email' — recent GoTrue unifies magic-link and email-OTP into one
  // token, so a magiclink-generated hashed_token verifies under 'email'. The
  // generateLink type and the verifyOtp type do not have to match.
  const supabase = await createClient()
  const { error: sessionErr } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'email',
  })
  if (sessionErr) {
    console.error('[auth/email-otp/verify] verifyOtp failed', {
      message: sessionErr.message,
      status: (sessionErr as { status?: number }).status,
      code: (sessionErr as { code?: string }).code,
      name: sessionErr.name,
    })
    return NextResponse.json(
      { error: 'Could not complete sign-in. Please request a new code and try again.' },
      { status: 500 },
    )
  }

  // Session cookies are now queued on this response. The client hard-navigates
  // to its own computed landing (nextPath handles national /feed vs city
  // dashboard and any ?next=), which carries the fresh cookie.
  const response = NextResponse.json({ success: true })

  // "Remember me" (default on): issue a long-lived rotating token so an expired
  // session can be silently re-minted (free plan has no configurable timeout).
  // Owner dentists only — staff have no dentists row for the FK.
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
