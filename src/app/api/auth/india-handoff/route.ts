// /api/auth/india-handoff — "My India profile" in the city-site dashboard
// (27 Nov 2026). The reverse of "Manage my clinic" on dentistinindia.in.
//
// GET (on the city domain, where the dentist is signed in): creates a
// one-time token (2 minutes, single use, see src/lib/clinicHandoff.ts) for
// dentistinindia.in and sends the browser to /api/auth/clinic-handoff there,
// which signs them in and opens the page in ?next= (home, alerts or post).
//
// It is a GET so phone-alert taps can use it too. It only ever signs the
// signed-in dentist into their own India account. Clinic staff (no dentist
// row for their email) go to the India login page instead.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getViewerDentist } from '@/lib/national'
import { NATIONAL_HOST, NATIONAL_ORIGIN, isNationalHost } from '@/config/cities'
import { INDIA_PAGES, createHandoff, indiaPath } from '@/lib/clinicHandoff'

export const dynamic = 'force-dynamic'

function requestHost(request: NextRequest): string {
  return (request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).hostname)
    .split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('next') || 'home'
  const path = indiaPath(key)

  // Already on dentistinindia.in: nothing to hand over.
  if (isNationalHost(requestHost(request))) return NextResponse.redirect(new URL(path, request.url))

  // Production goes to the real domain. Previews are one URL, so stay on it
  // and switch site with the ?__host= override that proxy.ts supports.
  const production = process.env.VERCEL_ENV === 'production'
  const base = production ? NATIONAL_ORIGIN : new URL(request.url).origin
  const withHost = (u: URL) => { if (!production) u.searchParams.set('__host', NATIONAL_HOST); return u }
  const indiaLogin = () => {
    const u = withHost(new URL('/for-dentists/login', base))
    u.searchParams.set('next', path)
    return NextResponse.redirect(u.toString())
  }

  const viewer = await getViewerDentist()
  if (!viewer || !viewer.is_active) {
    // Not signed in here (e.g. an old phone alert): sign in on the city site first.
    if (!viewer) {
      const back = `/api/auth/india-handoff?next=${encodeURIComponent(Object.keys(INDIA_PAGES).includes(key) ? key : 'home')}`
      return NextResponse.redirect(new URL(`/for-dentists/login?next=${encodeURIComponent(back)}`, request.url))
    }
    return indiaLogin()
  }

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const token = await createHandoff(db, viewer.id, NATIONAL_HOST)
  if (!token) return indiaLogin()

  const target = withHost(new URL('/api/auth/clinic-handoff', base))
  target.searchParams.set('t', token)
  target.searchParams.set('next', path)
  const res = NextResponse.redirect(target.toString())
  res.headers.set('Cache-Control', 'no-store')
  return res
}
