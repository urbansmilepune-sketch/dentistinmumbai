import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

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
  // whichever applies. If neither, fall through to the dentist dashboard
  // and let its layout redirect to /register — preserves the pre-staff
  // behaviour for any login that doesn't fit either bucket.
  //
  // We deliberately stay on the same origin for every redirect here. Each
  // city is a separate apex domain so the supabase auth cookie is
  // host-scoped — a cross-domain redirect would land the user at the new
  // host with no session and loop them back to login. The dashboard reads
  // the dentist row by email, so the data is correct regardless of which
  // city domain they signed in on; only the city branding follows the
  // current host.
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email
  if (!userEmail) return NextResponse.redirect(`${origin}/for-dentists/dashboard`)

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
    return NextResponse.redirect(`${origin}/for-dentists/dashboard`)
  }

  // No dentists row → could be a staff invite acceptance. Look up the
  // clinic_staff row and promote it to 'active' if found. We don't update
  // the dentists table; the staff lives entirely in clinic_staff land.
  const { data: staffRow } = await admin
    .from('clinic_staff')
    .select('id, status, user_id')
    .ilike('email', userEmail)
    .neq('status', 'removed')
    .maybeSingle()
  if (staffRow) {
    // Only set joined_at the first time, so re-logins don't keep bumping it.
    const patch: Record<string, any> = { status: 'active', user_id: user!.id }
    if (!staffRow.user_id) patch.joined_at = new Date().toISOString()
    await admin.from('clinic_staff').update(patch).eq('id', staffRow.id)
    return NextResponse.redirect(`${origin}/for-dentists/staff`)
  }

  // Authenticated but unrecognised — let the dashboard layout decide
  // (it will redirect to /register).
  return NextResponse.redirect(`${origin}/for-dentists/dashboard`)
}
