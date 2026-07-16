import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getCityByDomain, isNationalHost } from '@/config/cities'
import { REMEMBER_COOKIE } from '@/lib/auth/rememberMe'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  // Resolve the host once. dentistinindia.in is the national parent — we
  // tag the request with x-is-national:1 and skip city resolution so pages
  // can branch on national mode. Every other host falls through to the
  // existing CITY_BY_DOMAIN lookup, which still defaults to Mumbai.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
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

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
