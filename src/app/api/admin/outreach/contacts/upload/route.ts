// Bulk-insert cold-outreach contacts. Called from the Outreach tab after the
// admin parses + previews a CSV client-side and confirms the import.
//
//   POST { contacts: [{ name, clinic_name, email, city, sr_no? }, ...] }
//
// Server-side we re-validate emails (defence-in-depth — the client already
// ran the same check), dedupe against existing rows by lower(email), and
// insert in 500-row chunks. The unique constraint on email makes re-imports
// idempotent.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { looksLikeEmail, normalizeCsvCity } from '@/lib/outreach'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function adminGate() {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return null
  const db = admin()
  const { data: row } = await db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  return row ? user.email : null
}

interface IncomingContact {
  name?: unknown
  clinic_name?: unknown
  email?: unknown
  city?: unknown
}

export async function POST(request: NextRequest) {
  const ok = await adminGate()
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await request.json().catch(() => ({} as Record<string, unknown>))
  const incoming: IncomingContact[] = Array.isArray((payload as any).contacts) ? (payload as any).contacts : []
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 })
  }

  const seen = new Set<string>()
  const toInsert: Array<Record<string, unknown>> = []
  let invalid = 0
  let dupeInFile = 0

  for (const r of incoming) {
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : ''
    const name  = typeof r.name === 'string'  ? r.name.trim()  : ''
    if (!looksLikeEmail(email) || !name) { invalid++; continue }
    if (seen.has(email)) { dupeInFile++; continue }
    seen.add(email)
    toInsert.push({
      name,
      clinic_name: typeof r.clinic_name === 'string' && r.clinic_name.trim() ? r.clinic_name.trim() : null,
      email,
      city: normalizeCsvCity(typeof r.city === 'string' ? r.city : null),
      status: 'pending',
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      inserted: 0,
      duplicates_skipped: 0,
      invalid_skipped: invalid,
      duplicate_in_file_skipped: dupeInFile,
      error: 'No valid rows to insert',
    }, { status: 400 })
  }

  // Upsert ignoring duplicates → conflicts (existing emails) just get
  // skipped server-side. The returned rows are the actual inserts, which
  // is how we split inserted vs. duplicates_skipped.
  const db = admin()
  let inserted = 0
  const CHUNK = 500
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK)
    const { data, error } = await db
      .from('outreach_contacts')
      .upsert(slice, { onConflict: 'email', ignoreDuplicates: true })
      .select('id')
    if (error) {
      console.error('[outreach/contacts/upload] insert failed', error)
      return NextResponse.json({ error: error.message, inserted }, { status: 500 })
    }
    inserted += (data || []).length
  }

  return NextResponse.json({
    inserted,
    duplicates_skipped: (toInsert.length - inserted) + dupeInFile,
    invalid_skipped: invalid,
  })
}
