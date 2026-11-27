// /api/auth/clinic-handoff — "Manage my clinic" from the dentistinindia.in home.
//
// POST (on dentistinindia.in): the signed-in dentist taps a clinic link. We
//   create a one-time token (2 minutes, single use) and send the browser to
//   the GET below on their city domain.
// GET (on the city domain, or on dentistinindia.in for the reverse trip
//   from ../india-handoff): uses up the token, signs the dentist in on this
//   domain (same generateLink → verifyOtp pattern as remember-me) and opens
//   the dashboard page they picked. Any failure lands on the normal login
//   page with the same page as ?next=, so they can still get in.
// See src/lib/clinicHandoff.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getViewerDentist } from '@/lib/national'
import { CLINIC_PAGES, INDIA_PAGES, clinicCity, clinicPath, createHandoff, consumeHandoff } from '@/lib/clinicHandoff'
import { isNationalHost } from '@/config/cities'
import { REMEMBER_COOKIE, rememberCookieOptions, issueRememberToken } from '@/lib/auth/rememberMe'

function admin() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function requestHost(request: NextRequest): string {
  return (request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).hostname)
    .split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const path = clinicPath(String(form?.get('page') || ''))

  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.redirect(new URL(`/for-dentists/login?next=${encodeURIComponent('/')}`, request.url), 303)

  const city = clinicCity(viewer.city)
  // No city site for this dentist: the dashboard works on this domain too.
  if (!city) return NextResponse.redirect(new URL(path, request.url), 303)

  // Production goes to the real city domain. Previews (and local dev) are
  // served from one URL, so stay on it and pick the city with the preview
  // ?__host= override that proxy.ts already supports.
  const production = process.env.VERCEL_ENV === 'production'
  const base = production ? `https://${city.domain}` : new URL(request.url).origin
  const withHost = (u: URL) => { if (!production) u.searchParams.set('__host', city.domain); return u }

  const token = await createHandoff(admin(), viewer.id, city.domain)
  if (!token) {
    const login = withHost(new URL('/for-dentists/login', base))
    login.searchParams.set('next', path)
    return NextResponse.redirect(login.toString(), 303)
  }

  const target = withHost(new URL('/api/auth/clinic-handoff', base))
  target.searchParams.set('t', token)
  target.searchParams.set('next', path)
  return NextResponse.redirect(target.toString(), 303)
}

export async function GET(request: NextRequest) {
  const nextParam = request.nextUrl.searchParams.get('next') || ''
  // On dentistinindia.in this is the end of "My India profile" from a city
  // dashboard (see ../india-handoff), so the India pages are allowed there.
  const national = isNationalHost(requestHost(request))
  const allowed = Object.values(national ? INDIA_PAGES : CLINIC_PAGES)
  const path = allowed.includes(nextParam) ? nextParam : (national ? INDIA_PAGES.home : clinicPath(null))
  const toLogin = () => NextResponse.redirect(new URL(`/for-dentists/login?next=${encodeURIComponent(path)}`, request.url))

  const db = admin()
  const dentistId = await consumeHandoff(db, request.nextUrl.searchParams.get('t') || '', requestHost(request))
  if (!dentistId) return toLogin()

  const { data: dentist } = await db.from('dentists').select('id, email, is_active').eq('id', dentistId).maybeSingle()
  if (!dentist?.email || dentist.is_active === false) return toLogin()

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email: dentist.email })
  const hashedToken = link?.properties?.hashed_token ?? null
  if (linkErr || !hashedToken) return toLogin()

  const response = NextResponse.redirect(new URL(path, request.url))
  // The token is in this URL; keep it out of the next page's Referer.
  response.headers.set('Referrer-Policy', 'no-referrer')
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
  if (sessionErr) return toLogin()

  // Stay signed in on the city site for 30 days, like the other logins.
  const cookieValue = await issueRememberToken(db, dentist.id)
  if (cookieValue) response.cookies.set(REMEMBER_COOKIE, cookieValue, rememberCookieOptions())
  return response
}
