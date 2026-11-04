// GET /api/patient/google/callback — where Google sends a patient back after
// "Continue with Google" on /patient. Uses the same Supabase Google sign-in as
// dentists, but only to learn the patient's verified email: we then set the
// patient app cookie for that email and drop the Supabase session (patients
// are not dentist-app users). Records are matched on patients.email.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { setPatientSessionCookie, byEmail, normEmail, isEmail } from '@/lib/patientPortal'
import { loadClinicsFor } from '@/lib/patientClinics'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const back = (q: string) => NextResponse.redirect(`${origin}/patient?${q}`)

  const code = searchParams.get('code')
  if (!code) return back('error=google_failed')

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[patient/google] exchangeCodeForSession failed', error.message)
    return back('error=google_failed')
  }
  const { data: { user } } = await supabase.auth.getUser()
  const email = normEmail(user?.email)

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Keep the Supabase session only if this person is also a dentist, so a
  // dentist testing the patient app on their own phone stays signed in there.
  const { data: dentistRow } = isEmail(email)
    ? await db.from('dentists').select('id').eq('email', email).maybeSingle()
    : { data: null }
  if (!dentistRow) await supabase.auth.signOut({ scope: 'local' })

  if (!isEmail(email)) return back('error=google_failed')

  const who = byEmail(email)
  const { clinics, error: lookupErr } = await loadClinicsFor(db, who)
  if (lookupErr) {
    console.error('[patient/google] clinics lookup failed', lookupErr)
    return back('error=google_failed')
  }
  if (clinics.length === 0) return back(`error=google_no_records&email=${encodeURIComponent(email)}`)

  const res = back('login=google')
  await setPatientSessionCookie(res, who)
  return res
}
