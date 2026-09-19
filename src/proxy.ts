import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getCityByDomain, isNationalHost } from '@/config/cities'
import { REMEMBER_COOKIE } from '@/lib/auth/rememberMe'

/** Cookie that remembers a ?__host= preview override. Non-production only. */
const PREVIEW_HOST_COOKIE = '__preview_host'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  // Resolve the host once. dentistinindia.in is the national parent — we
  // tag the request with x-is-national:1 and skip city resolution so pages
  // can branch on national mode. Every other host falls through to the
  // existing CITY_BY_DOMAIN lookup, which still defaults to Mumbai.
  const realHost = request.headers.get('x-forwarded-host') || request.headers.get('host')

  // Preview-only host override.
  //
  // Every surface on this platform is selected by Host header, but preview
  // deployments are served from *.vercel.app — so on a preview, every host
  // resolves to the Mumbai fallback and the national parent (and every city
  // that isn't Mumbai) is simply unreachable for review. ?__host=<domain>
  // stands in for the real Host header and is remembered in a cookie so it
  // survives navigation.
  //
  // Hard-gated to non-production: on VERCEL_ENV=production the param and the
  // cookie are both ignored, so this cannot be used to make dentistinmumbai.in
  // serve another city's content. Safe to delete once previews are no longer
  // needed for host-specific work.
  const isProduction = process.env.VERCEL_ENV === 'production'
  const overrideParam = isProduction ? null : request.nextUrl.searchParams.get('__host')
  const overrideCookie = isProduction ? null : (request.cookies.get(PREVIEW_HOST_COOKIE)?.value ?? null)
  const host = overrideParam || overrideCookie || realHost

  const national = isNationalHost(host)
  const city = getCityByDomain(host)
  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.set('x-city-slug', city.citySlug)
  if (national) forwardedHeaders.set('x-is-national', '1')

  let response = NextResponse.next({ request: { headers: forwardedHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: forwardedHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Free-plan "remember me": if the Supabase session is gone but a remember
  // cookie is present, bounce through the silent re-auth route (validate +
  // rotate the token, mint a fresh session, then return to `next`) instead of
  // letting the dashboard gate drop the dentist at /login. Scoped to the
  // dentist dashboard; the re-auth route clears the cookie on any failure, so
  // there is no redirect loop.
  const path = request.nextUrl.pathname
  if (!user && path.startsWith('/for-dentists/dashboard') && request.cookies.get(REMEMBER_COOKIE)) {
    const reauth = new URL('/api/auth/remember-me', request.url)
    reauth.searchParams.set('next', path + request.nextUrl.search)
    return NextResponse.redirect(reauth)
  }

  // Persist a fresh ?__host= override so it survives navigation. Session
  // cookie, non-production only — see the override block above.
  if (overrideParam) {
    response.cookies.set(PREVIEW_HOST_COOKIE, overrideParam, { path: '/', httpOnly: true, sameSite: 'lax' })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
