// POST /api/auth/whatsapp-link — the "Continue to my case" button on /wa/<token>.
// Checks the signed token from our WhatsApp reply, signs that dentist in on
// this domain (same generateLink → verifyOtp pattern as remember-me) and
// sends them to /cases/new, where their WhatsApp photos are filled in.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkWaLoginToken } from '@/lib/waLoginLink'
import { REMEMBER_COOKIE, rememberCookieOptions, issueRememberToken } from '@/lib/auth/rememberMe'

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const token = String(form?.get('token') || '')
  // to=alerts: the WhatsApp activity summary link opens /alerts instead.
  const alerts = String(form?.get('to') || '') === 'alerts'
  const back = (err: boolean) => NextResponse.redirect(new URL(
    err ? `/wa/${encodeURIComponent(token)}?error=1${alerts ? '&to=alerts' : ''}` : (alerts ? '/alerts' : '/cases/new'),
    request.url,
  ), 303)

  const check = checkWaLoginToken(token)
  if (!check.ok) return back(true)

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: dentist } = await admin.from('dentists').select('id, email, is_active').eq('id', check.dentistId).maybeSingle()
  if (!dentist?.email || dentist.is_active === false) return back(true)

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: dentist.email })
  const hashedToken = link?.properties?.hashed_token ?? null
  if (linkErr || !hashedToken) return back(true)

  const response = back(false)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  const { error: sessionErr } = await supabase.auth.verifyOtp({ token_hash: hashedToken, type: 'email' })
  if (sessionErr) return back(true)

  // Keep them signed in on dentistinindia.in for 30 days, like the other logins.
  const cookieValue = await issueRememberToken(admin, dentist.id)
  if (cookieValue) response.cookies.set(REMEMBER_COOKIE, cookieValue, rememberCookieOptions())
  return response
}
