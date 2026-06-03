// POST /api/famdent/track — logs a Famdent booth QR lead. The /famdent
// landing page fires this (keepalive, fire-and-forget) the instant a dentist
// picks their city, just before redirecting to that city's registration.
//
// Writes via the service role: famdent_leads carries no public RLS policy
// (booth analytics is admin-only) and the insert must succeed for anonymous
// visitors who have no Supabase session.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request) {
  let city = ''
  try {
    const body = await request.json()
    const label = typeof body?.city === 'string' ? body.city.slice(0, 80) : ''
    // "Other" clicks carry the free-text city the dentist typed in `cityInput`.
    // Store that as the city so booth analytics records their real location
    // instead of a generic "Other". Fixed-button clicks send no cityInput.
    const typed = typeof body?.cityInput === 'string' ? body.cityInput.trim().slice(0, 80) : ''
    city = typed || label
  } catch {
    // Malformed body — still return ok so the client (which has already
    // navigated away) never sees an error; just nothing gets logged.
    return NextResponse.json({ ok: true })
  }

  if (city) {
    await supabase.from('famdent_leads').insert({
      city,
      user_agent: request.headers.get('user-agent'),
    })
  }

  return NextResponse.json({ ok: true })
}
