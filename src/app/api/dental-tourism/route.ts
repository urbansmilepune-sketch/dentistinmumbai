// POST /api/dental-tourism — accept contact-form submissions from the
// /dental-tourism page on dentistinindia.in. Writes to
// `dental_tourism_enquiries` via the service role because the table has
// RLS with no public policies (PII shouldn't be readable by the anon
// key). Validation mirrors the waitlist route: trim, length-cap, and
// reject obviously broken inputs but otherwise be permissive about
// international names / addresses / phone formats.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cap(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.slice(0, max)
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name    = cap(payload.name, 120)
  const email   = cap(payload.email, 200)?.toLowerCase()
  const phone   = cap(payload.phone, 40)
  const country = cap(payload.country, 80)
  const message = cap(payload.message, 2000)
  const source  = cap(payload.source, 60)

  const rawTreatments = Array.isArray(payload.treatments) ? payload.treatments : []
  // Keep treatments minimal — we only persist values that come back as
  // non-empty trimmed strings, and we cap each individual entry so a
  // malformed multi-select can't fill the column with noise.
  const treatments = rawTreatments
    .map(v => (typeof v === 'string' ? v.trim().slice(0, 60) : ''))
    .filter(Boolean)
    .slice(0, 20)

  if (!name)                       return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

  const { error } = await supabase
    .from('dental_tourism_enquiries')
    .insert({ name, email, phone, country, treatments, message, source })

  if (error) {
    return NextResponse.json({ error: 'Could not save right now' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
