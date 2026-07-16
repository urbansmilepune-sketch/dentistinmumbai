// GET /api/auth/remember-me?next=<relative path>
//
// Silent re-auth for the free-plan "remember me" workaround. The proxy redirects
// here (instead of letting the dashboard gate dump the dentist at /login) when
// it sees no Supabase session but a remember cookie. We validate + rotate the
// cookie, mint a fresh session, and bounce to `next`. Any failure clears the
// cookie and falls back to /login, so there's no redirect loop.
//
// It's a GET (redirect-driven, like an OAuth callback) but it does rotate the
// token — that's intentional and safe: the rotation is gated on possessing a
// valid httpOnly cookie, and reuse detection covers replay.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  REMEMBER_COOKIE,
  rememberCookieOptions,
  clearRememberCookieOptions,
  consumeRememberToken,
} from '@/lib/auth/rememberMe'

export async function GET(request: NextRequest) {
  const loginUrl = new URL('/for-dentists/login', request.url)

  // Open-redirect guard: only same-origin relative paths.
  const nextParam = request.nextUrl.searchParams.get('next') || '/for-dentists/dashboard'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/for-dentists/dashboard'

  const failToLogin = () => {
    const res = NextResponse.redirect(loginUrl)
    res.cookies.set(REMEMBER_COOKIE, '', clearRememberCookieOptions())
    return res
  }

  const cookieValue = request.cookies.get(REMEMBER_COOKIE)?.value
  if (!cookieValue) return NextResponse.redirect(loginUrl)

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const consumed = await consumeRememberToken(admin, cookieValue)
  if (!consumed.ok) return failToLogin()

  // Mint a real Supabase session for this email using the same
  // generateLink → verifyOtp pattern as /api/auth/email-otp/verify.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: consumed.email,
  })
  const hashedToken = link?.properties?.hashed_token ?? null
  if (linkErr || !hashedToken) return failToLogin()

  // Bind the SSR client to THIS redirect response so verifyOtp writes the
  // session cookies directly onto it (deterministic, unlike relying on
  // next/headers cookie merging into a manual redirect).
  const response = NextResponse.redirect(new URL(next, request.url))
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { error: sessionErr } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'email',
  })
  if (sessionErr) return failToLogin()

  // Session cookies are on `response`; add the rotated remember cookie too.
  response.cookies.set(REMEMBER_COOKIE, consumed.cookieValue, rememberCookieOptions())
  return response
}
