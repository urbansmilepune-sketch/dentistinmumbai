// Read-only visit-log feed for the admin "Visit Logs" tab.
//
//   GET → ?city=<slug>&limit=<n>  list visit_logs, newest first (default 500)
//
// visit_logs is the field-visit audit trail written by the dentauraprime.com
// employee platform (see supabase/migrations/20260627130000_visit_logs.sql).
// This site only READS it for admin visibility — no writes here.
//
// The table carries no city column (city lives on the joined dentist), and
// the visit_logs→dentists FK isn't relied on for an embedded PostgREST join
// (the same FK-resolution flakiness documented in admin/page.tsx for
// appointments→dentists). So we fetch the logs, then hydrate dentist
// name/city from a slim lookup keyed by the dentist_ids actually referenced.
// A ?city= filter is translated into a dentist_id IN (…) clause up front.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

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

export async function GET(request: NextRequest) {
  const ok = await adminGate()
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const city = url.searchParams.get('city')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 2000)

  const db = admin()

  // Resolve the city filter to a dentist_id allow-list. A city with no
  // dentists yields an empty list → no rows (the correct answer), so we
  // short-circuit rather than issue a `.in('dentist_id', [])` query.
  let cityDentistIds: string[] | null = null
  if (city) {
    const { data: cityDentists } = await db
      .from('dentists')
      .select('id')
      .eq('city', city)
    cityDentistIds = (cityDentists ?? []).map((d: { id: string }) => d.id)
    if (cityDentistIds.length === 0) {
      return NextResponse.json({ logs: [] })
    }
  }

  let q = db
    .from('visit_logs')
    .select('id, dentist_id, employee_ref, visit_date, notes, outcome, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (cityDentistIds) q = q.in('dentist_id', cityDentistIds)

  const { data: logs, error } = await q
  if (error) {
    console.error('[admin/visit-logs GET] failed', error)
    return NextResponse.json({ error: error.message, logs: [] }, { status: 500 })
  }

  // Hydrate dentist name/city from a lookup keyed by the referenced ids only.
  const ids = Array.from(
    new Set((logs ?? []).map((l: { dentist_id: string | null }) => l.dentist_id).filter(Boolean)),
  ) as string[]
  const dentistById = new Map<string, { name: string | null; clinic_name: string | null; city: string | null }>()
  if (ids.length > 0) {
    const { data: dentists } = await db
      .from('dentists')
      .select('id, name, clinic_name, city')
      .in('id', ids)
    for (const d of (dentists ?? []) as Array<{ id: string; name: string | null; clinic_name: string | null; city: string | null }>) {
      dentistById.set(d.id, { name: d.name, clinic_name: d.clinic_name, city: d.city })
    }
  }

  const hydrated = (logs ?? []).map((l: any) => {
    const d = l.dentist_id ? dentistById.get(l.dentist_id) ?? null : null
    return {
      ...l,
      dentist_name: d?.name ?? null,
      dentist_clinic: d?.clinic_name ?? null,
      dentist_city: d?.city ?? null,
    }
  })

  return NextResponse.json({ logs: hydrated })
}
