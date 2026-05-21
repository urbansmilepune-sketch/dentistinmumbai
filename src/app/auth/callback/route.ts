import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isNationalHost } from '@/config/cities'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // dentistinindia.in is the professional-network surface, so a signed-in
  // dentist landing on the national host wants the feed, not the city
  // dashboard. Detect via the forwarded host (set by the platform proxy)
  // with a fall-back to the parsed URL host for local dev.
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const national = isNationalHost(forwardedHost) || isNationalHost(new URL(request.url).hostname)
  const dentistLanding = national ? '/feed' : '/for-dentists/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/for-dentists/login?error=oauth_failed&reason=no_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed', { message: error.message })
    return NextResponse.redirect(
      `${origin}/for-dentists/login?error=oauth_failed&reason=${encodeURIComponent(error.message)}`
    )
  }

  // Two account types share the same login: dentists (who own a row in the
  // dentists table) and staff (who own a row in clinic_staff). Route to
  // whichever applies. If neither, fall through to the dentist landing
  // and let its layout redirect to /register — preserves the pre-staff
  // behaviour for any login that doesn't fit either bucket.
  //
  // We deliberately stay on the same origin for every redirect here. Each
  // city is a separate apex domain (and dentistinindia.in is a separate
  // apex too) so the supabase auth cookie is host-scoped — a cross-domain
  // redirect would land the user at the new host with no session and loop
  // them back to login. The dashboard / feed read the dentist row by email,
  // so the data is correct regardless of which domain they signed in on;
  // only the surface (city directory vs national feed) follows the host.
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email
  if (!userEmail) return NextResponse.redirect(`${origin}${dentistLanding}`)

  // Service role for the dentists / clinic_staff lookups — staff invites
  // don't grant the new user a self-read policy on dentists, and we want
  // both checks to behave identically regardless of which RLS rules exist.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: dentistRow } = await admin
    .from('dentists')
    .select('id')
    .eq('email', userEmail)
    .maybeSingle()
  if (dentistRow) {
    return NextResponse.redirect(`${origin}${dentistLanding}`)
  }

  // No dentists row → could be a staff invite acceptance. Look up the
  // clinic_staff row and promote it to 'active' if found. We don't update
  // the dentists table; the staff lives entirely in clinic_staff land.
  // Staff always go to /for-dentists/staff regardless of host — there's no
  // national equivalent and the staff portal is intentionally city-scoped.
  const { data: staffRow } = await admin
    .from('clinic_staff')
    .select('id, status, user_id')
    .ilike('email', userEmail)
    .neq('status', 'removed')
    .maybeSingle()
  if (staffRow) {
    await admin
      .from('clinic_staff')
      .update({ status: 'active', user_id: user!.id })
      .eq('id', staffRow.id)
    return NextResponse.redirect(`${origin}/for-dentists/staff`)
  }

  // Authenticated but unrecognised — let the landing page's layout decide
  // (the dashboard layout redirects to /register; /feed handles unsigned-up
  // users gracefully).
  return NextResponse.redirect(`${origin}${dentistLanding}`)
}
