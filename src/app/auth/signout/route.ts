// Cookie-aware sign-out so server-rendered pages (e.g. the staff portal) can
// ship a plain HTML form button instead of becoming a client component. Also
// revokes the "remember me" token + clears its httpOnly cookie (client JS can't
// touch an httpOnly cookie, so this MUST happen server-side).
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { REMEMBER_COOKIE, clearRememberCookieOptions, revokeRememberSeries } from '@/lib/auth/rememberMe'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const response = NextResponse.redirect(new URL('/for-dentists/login', request.url))

  // Belt and braces: expire the Supabase session cookies on this redirect too.
  // The login page now skips the form for a signed-in dentist, so a session
  // cookie that survived logout would send them straight back to the dashboard.
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith('sb-')) response.cookies.set(c.name, '', { path: '/', maxAge: 0 })
  }

  const remember = request.cookies.get(REMEMBER_COOKIE)?.value
  if (remember) {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    await revokeRememberSeries(admin, remember)
    response.cookies.set(REMEMBER_COOKIE, '', clearRememberCookieOptions())
  }

  return response
}
