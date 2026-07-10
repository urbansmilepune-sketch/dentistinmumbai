import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { resolveMapsEmbed } from '@/lib/mapsResolve'

// Field allowlist — admins can edit the public profile + moderation/tier
// columns on behalf of a dentist (the rep-onboarding use case). Every key
// here is a REAL column on `dentists` (verified against the live schema).
// Deliberately EXCLUDED: identity/auth columns (email, slug) so a redirect-
// bearing slug can't be silently rewritten and the auth link can't be broken;
// denormalised stats (profile_views, whatsapp_clicks, avg_rating, rating,
// review_count, rank_score, enquiry_count, *_clicks, ref, founding_number)
// so they can't be spoofed via the request body. The pre-allowlist version
// accepted any field, which was a mass-assignment vector.
const ALLOWED_FIELDS = new Set([
  // moderation / account
  'tier',
  'is_verified',
  'is_active',
  // identity (admin/rep may correct these; slug + email stay locked)
  'name',
  'clinic_name',
  // bio & credentials
  'bio',
  'qualifications',
  'specialties',
  'registration_number',
  'experience_years',
  'gender',
  // contact & location
  'area_id',
  'phone',
  'whatsapp',
  'address',
  'maps_embed',
  'lat',
  'lng',
  // photos (written directly after the admin upload route returns a URL)
  'profile_photo',
  'cover_photo',
  // online presence (only these two social columns exist on the schema)
  'website',
  'linkedin_url',
  // hours & fees
  'working_hours',
  'consultation_fee',
  'languages',
])

const DAY_KEYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
const TIME_RE = /^\d{2}:\d{2}$/

// Validates the working_hours JSON before it hits the column. Shape mirrors
// the dentist dashboard hours page: an object keyed by 3-letter day, each day
// { is_open: bool, open_time/close_time: "HH:MM", optional break fields }.
// `null` is allowed so an admin can clear it. We reject anything malformed so
// a hand-crafted request can't poison the column that the public "Open Now"
// banner reads.
function isValidWorkingHours(v: unknown): boolean {
  if (v === null) return true
  if (typeof v !== 'object' || Array.isArray(v)) return false
  for (const [k, dayRaw] of Object.entries(v as Record<string, unknown>)) {
    if (!DAY_KEYS.has(k)) return false
    if (typeof dayRaw !== 'object' || dayRaw === null || Array.isArray(dayRaw)) return false
    const d = dayRaw as Record<string, unknown>
    if (typeof d.is_open !== 'boolean') return false
    for (const t of ['open_time', 'close_time', 'break_start', 'break_end'] as const) {
      if (d[t] !== undefined && !(typeof d[t] === 'string' && TIME_RE.test(d[t] as string))) return false
    }
    if (d.has_break !== undefined && typeof d.has_break !== 'boolean') return false
  }
  return true
}

export async function POST(request: NextRequest) {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const { id, ...rest } = body as Record<string, unknown> & { id?: unknown }
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  const rejected: string[] = []
  for (const [key, value] of Object.entries(rest)) {
    if (ALLOWED_FIELDS.has(key)) updates[key] = value
    else rejected.push(key)
  }
  if (rejected.length > 0) {
    // 400 with the explicit list rather than silently dropping — the admin UI
    // only ever sends allowlisted fields, so this means a hand-crafted request.
    return NextResponse.json({ error: `Disallowed fields: ${rejected.join(', ')}` }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields to update' }, { status: 400 })
  }

  // Validate working_hours shape before writing (the public Open-Now banner
  // reads this column, so a malformed blob would break rendering).
  if ('working_hours' in updates && !isValidWorkingHours(updates.working_hours)) {
    return NextResponse.json({ error: 'Invalid working_hours shape' }, { status: 400 })
  }

  // Verify the row exists first. Supabase UPDATE silently succeeds on zero
  // matched rows, so a stale id would otherwise 200 while the client's
  // optimistic state diverges from the DB. We also pull name/clinic_name here
  // to feed the maps normaliser's clinic-name fallback.
  const { data: existing, error: lookupErr } = await admin_db
    .from('dentists')
    .select('id, name, clinic_name')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Dentist not found' }, { status: 404 })

  // Normalise maps_embed the same way the dentist route does: a pasted link /
  // clinic name becomes a renderable iframe, and any coordinates we can
  // extract are persisted UNLESS the admin explicitly set lat/lng in this
  // same request (their manual entry wins). An already-normalised iframe or a
  // blank value passes through with no network call.
  if ('maps_embed' in updates) {
    const raw = typeof updates.maps_embed === 'string' ? updates.maps_embed : ''
    if (!raw.trim()) {
      // Blank means "no map" — clear it rather than fabricating a place-name
      // search embed from the clinic name (which is what resolveMapsEmbed
      // would do with an empty input). Mirrors the dentist-side flow, which
      // skips normalisation entirely when the field is left empty.
      updates.maps_embed = ''
    } else {
      const resolved = await resolveMapsEmbed(raw, String(existing.name || ''), String(existing.clinic_name || ''))
      if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 422 })
      updates.maps_embed = resolved.maps_embed
      if (resolved.lat !== undefined && !('lat' in updates)) updates.lat = resolved.lat
      if (resolved.lng !== undefined && !('lng' in updates)) updates.lng = resolved.lng
    }
  }

  const { error } = await admin_db.from('dentists').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Pull the email up-front so we can delete the matching auth.users row
  // after the dentists delete. The dentists schema has no FK to auth.users
  // (the link is implicit via the email column), so the auth user has to
  // be looked up and deleted explicitly.
  const { data: dentist, error: lookupErr } = await admin_db
    .from('dentists')
    .select('id, email')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  if (!dentist) return NextResponse.json({ error: 'Dentist not found' }, { status: 404 })

  // Manual cascade for the legacy tables (appointments, patients, invoices,
  // reviews) that predate the migration directory and may not have
  // `on delete cascade` on their dentist_id FK. Newer child tables in
  // /supabase/migrations all set cascade, so they clean up automatically
  // when the dentists row is deleted below. Order: most-leaf first.
  for (const table of ['appointments', 'invoices', 'reviews', 'patients'] as const) {
    const { error: childErr } = await admin_db.from(table).delete().eq('dentist_id', id)
    if (childErr) {
      return NextResponse.json({ error: `Failed to delete ${table}: ${childErr.message}` }, { status: 500 })
    }
  }

  const { error: dentErr } = await admin_db.from('dentists').delete().eq('id', id)
  if (dentErr) return NextResponse.json({ error: dentErr.message }, { status: 500 })

  // Best-effort auth-user cleanup. The dentist row is already gone, so a
  // failure here leaves an orphaned auth user but does not leave a broken
  // public profile — surface it to the admin via the response but don't
  // 500 the whole request. supabase-js has no getUserByEmail admin call so
  // we paginate listUsers; dentist auth volume is small (<1k) so 5 pages
  // of 200 covers it comfortably.
  if (dentist.email) {
    const needle = dentist.email.toLowerCase()
    let authUserId: string | null = null
    for (let page = 1; page <= 5; page++) {
      const { data, error: listErr } = await admin_db.auth.admin.listUsers({ page, perPage: 200 })
      if (listErr) break
      const hit = (data.users || []).find(u => u.email?.toLowerCase() === needle)
      if (hit) { authUserId = hit.id; break }
      if (!data.users || data.users.length < 200) break
    }
    if (authUserId) {
      const { error: authErr } = await admin_db.auth.admin.deleteUser(authUserId)
      if (authErr) {
        return NextResponse.json({ success: true, auth_warning: authErr.message })
      }
    }
  }

  return NextResponse.json({ success: true })
}
