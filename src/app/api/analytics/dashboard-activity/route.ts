import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Dentist-side dashboard activity logging. This is the WRITE half of the
// admin "Dentist Health" activity view — until this route existed, nothing
// recorded that a dentist logged in or which dashboard section they opened.
// (analytics_events otherwise only holds PUBLIC profile engagement —
// profile_view / whatsapp_click / … keyed to the *viewed* dentist.)
//
// We reuse the same analytics_events table but with a disjoint event_type
// namespace so the existing public-engagement queries are unaffected:
//   - 'dashboard_login'            → one per browser session (sessionStart)
//   - 'dashboard_view:<section>'   → one per dashboard route visit
// dentist_id here is the ACTING dentist (clinic owner, or the owner a staff
// member acts on), resolved server-side from the session — never trusted
// from the client.
//
// Crucially we do NOT call increment_counter: those counters track public
// profile engagement, and dashboard activity must not inflate them.

// Derive a stable, low-cardinality section key from the pathname. Anything
// outside the dashboard tree, or a segment with unexpected characters,
// collapses to 'overview' so a crafted path can't explode event_type
// cardinality.
function sectionFromPath(path: unknown): string {
  if (typeof path !== 'string') return 'overview'
  const base = '/for-dentists/dashboard'
  if (!path.startsWith(base)) return 'overview'
  const rest = path.slice(base.length).replace(/^\/+/, '')
  const seg = rest.split('/')[0] ?? ''
  const clean = seg.toLowerCase().replace(/[^a-z-]/g, '')
  return clean || 'overview'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // Tracker only mounts inside the authed dashboard, but a session can
    // lapse mid-visit — return a quiet noop rather than a 401 so the client
    // fetch never surfaces a console error.
    if (!user?.email) return NextResponse.json({ ok: false }, { status: 200 })

    const body = await request.json().catch(() => ({}))
    const section = sectionFromPath(body?.path)
    const sessionStart = body?.sessionStart === true

    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : null

    // Resolve the acting dentist the same two-tier way the dashboard layout
    // does (owner by email → staff's owner dentist), via service role so the
    // RLS gate on dentists/clinic_staff can't drop the lookup.
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    let dentistId: string | null = null
    const { data: ownDentist } = await admin
      .from('dentists').select('id').eq('email', user.email).maybeSingle()
    if (ownDentist) {
      dentistId = ownDentist.id
    } else {
      const { data: staffRow } = await admin
        .from('clinic_staff').select('dentist_id').ilike('email', user.email).eq('status', 'active').maybeSingle()
      dentistId = staffRow?.dentist_id ?? null
    }
    if (!dentistId) return NextResponse.json({ ok: false }, { status: 200 })

    const createdAt = new Date().toISOString()
    const rows: Array<{ dentist_id: string; event_type: string; ip: string | null; created_at: string }> = [
      { dentist_id: dentistId, event_type: `dashboard_view:${section}`, ip, created_at: createdAt },
    ]
    if (sessionStart) {
      rows.push({ dentist_id: dentistId, event_type: 'dashboard_login', ip, created_at: createdAt })
    }
    await admin.from('analytics_events').insert(rows)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message }, { status: 200 })
  }
}
