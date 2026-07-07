// POST /api/onboard/complete — marks the signed-in dentist's onboarding as
// done (dentists.onboarding_completed = true). Called by the wizard's final
// "Go to dashboard" button and every "Skip setup" link so the dashboard
// layout stops redirecting them to /onboard on the next visit.
//
// Service role so the write doesn't depend on the dentists UPDATE RLS policy.
// We match the row by the SESSION email (never the request body) so a stale
// tab can't flip someone else's flag.

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await admin
    .from('dentists')
    .update({ onboarding_completed: true })
    .eq('email', user.email)

  if (error) {
    // The column is added out-of-band and may not exist yet. Don't fail the
    // flow — the dashboard gate treats an unreadable flag as "done" anyway, so
    // the wizard still won't re-trigger. Log for visibility.
    console.error('[onboard/complete] flag update failed', error)
    return NextResponse.json({ success: false, error: error.message })
  }

  return NextResponse.json({ success: true })
}
