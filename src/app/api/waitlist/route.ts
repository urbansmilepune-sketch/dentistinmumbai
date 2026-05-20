// POST /api/waitlist — accept "notify me when [city] launches" signups
// from the national parent site. Writes to `city_waitlist` via the service
// role because the table has RLS with no public policies (no one but
// admins should be able to read the email list back out).
//
// Validation deliberately lives in this route rather than the DB schema
// so we can keep the city_slug column as plain text (see migration note)
// while still rejecting arbitrary inputs from the client. The slug must
// match either a live CITY_CONFIGS entry or a COMING_SOON_CITIES entry —
// nothing else gets persisted.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CITY_CONFIGS } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Standard RFC-5322-ish check. Not exhaustive, but rejects the typos
// (missing @, missing TLD, trailing space) that account for ~all real
// invalid submissions. The DB unique-constraint catches duplicates.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function knownSlug(slug: string): boolean {
  if (Object.prototype.hasOwnProperty.call(CITY_CONFIGS, slug)) return true
  return COMING_SOON_CITIES.some(c => c.slug === slug)
}

export async function POST(request: Request) {
  let payload: { email?: unknown; city_slug?: unknown; source?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const citySlug = typeof payload.city_slug === 'string' ? payload.city_slug.trim() : ''
  const source = typeof payload.source === 'string' ? payload.source.slice(0, 60) : null

  if (!EMAIL_RE.test(email))    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  if (!knownSlug(citySlug))     return NextResponse.json({ error: 'Unknown city' }, { status: 400 })

  // Upsert semantics so the same person can click "Notify me" twice without
  // an angry 409. `ignoreDuplicates: true` keeps the original created_at if
  // the row already exists, which is what we want analytically.
  const { error } = await supabase
    .from('city_waitlist')
    .upsert({ email, city_slug: citySlug, source }, { onConflict: 'email,city_slug', ignoreDuplicates: true })

  if (error) {
    return NextResponse.json({ error: 'Could not save right now' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
