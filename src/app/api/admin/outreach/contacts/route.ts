// Contact list + by-city counts + bulk delete for the Outreach tab.
//
//   GET    → ?city=<slug>&status=<status>&limit=<n>  list contacts (default 200 rows)
//            also returns { city_counts: { city → total } } for the panel
//   DELETE → ?city=<slug>  bulk-delete every contact in that city
//
// All reads/writes go through the service-role client; the route enforces
// admin identity via admin_users like every other /api/admin/* surface.
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
  const status = url.searchParams.get('status')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1000)

  const db = admin()
  let q = db
    .from('outreach_contacts')
    .select('id, name, clinic_name, email, phone, city, area, source, status, campaign_id, sent_at, opened_at, clicked_at, registered_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (city)   q = q.eq('city', city)
  if (status) q = q.eq('status', status)
  const { data: contacts, error } = await q
  if (error) {
    console.error('[outreach/contacts GET] failed', error)
    return NextResponse.json({ error: error.message, contacts: [], city_counts: {} }, { status: 500 })
  }

  // City counts — small enough to compute JS-side without an RPC.
  const { data: cityRows } = await db
    .from('outreach_contacts')
    .select('city, status')
  const city_counts: Record<string, { total: number; pending: number; sent: number; opened: number; clicked: number; registered: number }> = {}
  for (const r of (cityRows ?? []) as Array<{ city: string | null; status: string | null }>) {
    const c = r.city || 'unknown'
    if (!city_counts[c]) city_counts[c] = { total: 0, pending: 0, sent: 0, opened: 0, clicked: 0, registered: 0 }
    city_counts[c].total++
    const s = r.status as keyof typeof city_counts[string] | null
    if (s && s !== 'total' && (city_counts[c] as any)[s] !== undefined) {
      (city_counts[c] as any)[s]++
    }
  }

  return NextResponse.json({ contacts: contacts ?? [], city_counts })
}

export async function DELETE(request: NextRequest) {
  const ok = await adminGate()
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const city = url.searchParams.get('city')
  if (!city) return NextResponse.json({ error: 'Missing city' }, { status: 400 })

  const db = admin()
  const { error, count } = await db
    .from('outreach_contacts')
    .delete({ count: 'exact' })
    .eq('city', city)
  if (error) {
    console.error('[outreach/contacts DELETE] failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ deleted: count ?? 0 })
}
