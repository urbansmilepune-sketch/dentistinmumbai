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

// Indian mobile: 10 digits starting 6-9, optionally prefixed +91 / 91 / 0.
function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

export async function POST(request: Request) {
  let payload: { email?: unknown; phone?: unknown; area?: unknown; city_slug?: unknown; source?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const citySlug = typeof payload.city_slug === 'string' ? payload.city_slug.trim() : ''
  const source = typeof payload.source === 'string' ? payload.source.slice(0, 60) : null
  if (!knownSlug(citySlug)) return NextResponse.json({ error: 'Unknown city' }, { status: 400 })

  // Opening city homepages send a WhatsApp number (+ area) instead of an email.
  if (payload.phone !== undefined) {
    const phone = normalizePhone(payload.phone)
    if (!phone) return NextResponse.json({ error: 'Enter a 10-digit mobile number' }, { status: 400 })
    const area = typeof payload.area === 'string' ? payload.area.trim().slice(0, 80) || null : null
    const { error } = await supabase
      .from('city_waitlist')
      .upsert({ phone, area, city_slug: citySlug, source }, { onConflict: 'phone,city_slug', ignoreDuplicates: true })
    if (error) {
      console.error('[api/waitlist] phone insert failed', error)
      return NextResponse.json({ error: 'Could not save right now' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email))    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

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
