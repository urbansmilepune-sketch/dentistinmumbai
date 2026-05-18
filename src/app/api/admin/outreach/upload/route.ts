// Admin-only CSV upload for cold-outreach prospect lists.
//
// Accepts either:
//   - multipart/form-data with a `file` field (the CSV), or
//   - application/json with { csv: "<raw csv text>" }
//
// The route parses, de-duplicates against existing outreach_contacts rows by
// (lower(email)), and inserts the new rows. Re-uploads of the same list are
// no-ops because of the unique index on lower(email).
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { buildHeaderIndex, looksLikeEmail, parseCsv } from '@/lib/outreach'
import { CITY_CONFIGS } from '@/config/cities'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function adminGate(req: NextRequest): Promise<NextResponse | null> {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: row } = await db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

// Normalize a city value from the CSV into our canonical slug. The CSV may
// say "Mumbai" or "navi mumbai" — we lowercase, strip spaces, and try the
// slug. Anything we can't match goes in as the raw lower-cased value so the
// admin can still filter on it later.
function normalizeCity(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v)) return v
  return raw.trim().toLowerCase() || null
}

export async function POST(request: NextRequest) {
  const gate = await adminGate(request)
  if (gate) return gate

  // Read the CSV from whichever transport the admin used.
  let csvText: string | null = null
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    if (file && typeof file !== 'string') {
      csvText = await file.text()
    }
  } else {
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    if (typeof body.csv === 'string') csvText = body.csv
  }

  if (!csvText || !csvText.trim()) {
    return NextResponse.json({ error: 'No CSV content provided' }, { status: 400 })
  }

  const rows = parseCsv(csvText.trim())
  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV needs a header row and at least one data row' }, { status: 400 })
  }

  const header = buildHeaderIndex(rows[0])
  if (header.email === -1) {
    return NextResponse.json({ error: 'CSV must contain an "email" column' }, { status: 400 })
  }

  const seenEmails = new Set<string>()
  const toInsert: Array<Record<string, unknown>> = []
  let skippedInvalid = 0
  let skippedDuplicateInFile = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length === 0) continue
    const email = (r[header.email] || '').trim()
    if (!looksLikeEmail(email)) { skippedInvalid++; continue }
    const key = email.toLowerCase()
    if (seenEmails.has(key)) { skippedDuplicateInFile++; continue }
    seenEmails.add(key)

    toInsert.push({
      name:        header.name        > -1 ? (r[header.name]        || '').trim() || null : null,
      clinic_name: header.clinic_name > -1 ? (r[header.clinic_name] || '').trim() || null : null,
      email,
      phone:       header.phone       > -1 ? (r[header.phone]       || '').trim() || null : null,
      city:        normalizeCity(header.city > -1 ? (r[header.city] || '') : null),
      area:        header.area        > -1 ? (r[header.area]        || '').trim() || null : null,
      source:      header.source      > -1 ? (r[header.source]      || '').trim() || null : null,
      status: 'pending',
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      inserted: 0, skipped_existing: 0, skipped_invalid: skippedInvalid, skipped_duplicate_in_file: skippedDuplicateInFile,
      error: 'No valid rows to insert',
    }, { status: 400 })
  }

  // Upsert on the unique lower(email) index. ignoreDuplicates returns the
  // unchanged set so we can compute the inserted-vs-skipped split server-side.
  // Chunked into 500-row batches so a 5k-row CSV doesn't hit Postgres's
  // statement size limit.
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
      console.error('[outreach/upload] insert failed', error)
      return NextResponse.json({ error: error.message, inserted }, { status: 500 })
    }
    inserted += (data || []).length
  }

  return NextResponse.json({
    inserted,
    skipped_existing: toInsert.length - inserted,
    skipped_invalid: skippedInvalid,
    skipped_duplicate_in_file: skippedDuplicateInFile,
    total_in_file: rows.length - 1,
  })
}
