// Single source of truth for "is this the demo profile?".
//
// The demo account lets prospects walk through the full dashboard without
// ever appearing on the public city directory. The mechanism is:
//   - dentists.is_active stays `false` on the demo row, so every public
//     listing query (which filters by is_active = true) skips it.
//   - The dashboard layout has a targeted bypass that lets the demo email
//     past the !is_active redirect to /for-dentists/pending.
//   - The bookings API refuses to insert appointments against the demo
//     dentist_id, so even someone who guessed the public profile URL
//     can't seed it with real patient data.
//
// Keep this file as the one place the demo email is named so the bypass
// surface stays auditable. Comparison is case-insensitive — Supabase
// stores emails lowercase but auth flows occasionally surface mixed case.

export const DEMO_DENTIST_EMAIL = 'ashish17dighade@gmail.com'

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === DEMO_DENTIST_EMAIL
}
