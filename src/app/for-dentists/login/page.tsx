import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import LoginForm from './LoginForm'

// Already signed in? Skip the form.
//
// Supabase keeps a dentist signed in after the browser is closed, but this page
// used to show the sign-in form anyway. Dentists reopening the site and tapping
// "Dentist Login" saw the form and thought they had been logged out. Now a
// signed-in dentist (or clinic staff member) goes straight to the dashboard, or
// to ?next= when it is a same-origin path.
//
// The no-session + remember-cookie case is handled in layout.tsx, which runs
// first. Log out clears the session and the remember cookie, so after logging
// out this page shows the form as usual.
export default async function DentistLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user?.email && (await hasDashboardAccess(user.email))) {
    const params = await searchParams
    const next = typeof params.next === 'string' ? params.next : ''
    redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/for-dentists/dashboard')
  }

  return <LoginForm />
}

// Only skip the form for accounts the dashboard will actually let in (a dentist
// row, or an active staff invite — same lookups as the dashboard layout). Any
// other signed-in account still sees the form, so there is no redirect loop.
async function hasDashboardAccess(email: string): Promise<boolean> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: dentist, error: dentistErr } = await admin
    .from('dentists')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()
  if (dentistErr) return false
  if (dentist) return true

  const { data: staff, error: staffErr } = await admin
    .from('clinic_staff')
    .select('id')
    .ilike('email', email)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (staffErr) return false
  return !!staff
}
