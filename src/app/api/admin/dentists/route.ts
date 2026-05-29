import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  // Identity comes from the JWT; admin_users lookup runs on the service-role
  // client so it bypasses RLS (admins without a self-read policy would
  // otherwise get a spurious Unauthorized).
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin_db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: admin } = await admin_db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Field allowlist — admins should be able to flip moderation/tier columns
  // and lightly edit the public profile (bio, fee, languages, specialties,
  // experience). They should NOT be able to overwrite identity columns
  // (email, slug, name, founding_number) or denormalised stats
  // (profile_views, whatsapp_clicks, avg_rating, review_count) by passing
  // them in the request body. The pre-allowlist version of this route
  // accepted any field, which was a mass-assignment vector once the admin
  // gate fixed the auth side.
  const ALLOWED_FIELDS = new Set([
    'tier',
    'is_verified',
    'is_active',
    'consultation_fee',
    'bio',
    'specialties',
    'languages',
    'experience_years',
  ])

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
    // 400 with explicit list rather than silently dropping — the client
    // (AdminPageClient) only ever sends allowlisted fields, so this means
    // someone is crafting requests by hand. Don't help them guess.
    return NextResponse.json({ error: `Disallowed fields: ${rejected.join(', ')}` }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields to update' }, { status: 400 })
  }

  // Verify the row exists first. Supabase's UPDATE silently succeeds when
  // zero rows match, so a stale id from the admin UI would return 200
  // success and the optimistic state update in AdminPageClient would
  // diverge from the DB. The pre-check converts "no such dentist" into
  // a 404 that the client now surfaces as a toast.
  const { data: existing, error: lookupErr } = await admin_db
    .from('dentists')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Dentist not found' }, { status: 404 })

  const { error } = await admin_db.from('dentists').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin_db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: admin } = await admin_db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
