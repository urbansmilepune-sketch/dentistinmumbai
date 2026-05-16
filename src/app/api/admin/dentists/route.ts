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

  const { error } = await admin_db.from('dentists').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
