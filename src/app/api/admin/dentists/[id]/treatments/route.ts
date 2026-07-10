// Admin-scoped treatments management for a specific dentist.
//
// Treatments are a join table (dentist_treatments) rather than a column, so
// they can't go through the generic column-update route. GET returns the full
// treatment catalogue plus this dentist's current selections + fees; POST
// upserts one selection (add, or update its fees); DELETE removes one. All
// via the service-role client so RLS (built around the dentist owner) doesn't
// block the admin.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'

const SELECT_COLS = 'id, treatment_id, fee_from, fee_to, duration_mins'

// Parses a fee/duration field: blank/absent → null, else a non-negative int.
// Returns undefined for an invalid value so the caller can 400.
function parseIntOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.floor(n)
}

async function requireDentist(admin_db: Awaited<ReturnType<typeof requireAdmin>>, id: string) {
  const { data } = await admin_db!.from('dentists').select('id').eq('id', id).maybeSingle()
  return !!data
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing dentist id' }, { status: 400 })
  if (!(await requireDentist(admin_db, id))) return NextResponse.json({ error: 'Dentist not found' }, { status: 404 })

  const [allResp, mineResp] = await Promise.all([
    admin_db.from('treatments').select('id, name, slug, icon').order('sort_order', { ascending: true, nullsFirst: false }).order('name'),
    admin_db.from('dentist_treatments').select(SELECT_COLS).eq('dentist_id', id),
  ])
  if (allResp.error) return NextResponse.json({ error: allResp.error.message }, { status: 500 })
  if (mineResp.error) return NextResponse.json({ error: mineResp.error.message }, { status: 500 })

  return NextResponse.json({ treatments: allResp.data || [], selected: mineResp.data || [] })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing dentist id' }, { status: 400 })
  if (!(await requireDentist(admin_db, id))) return NextResponse.json({ error: 'Dentist not found' }, { status: 404 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const treatment_id = typeof body.treatment_id === 'string' ? body.treatment_id : ''
  if (!treatment_id) return NextResponse.json({ error: 'Missing treatment_id' }, { status: 400 })

  const fee_from = parseIntOrNull(body.fee_from)
  const fee_to = parseIntOrNull(body.fee_to)
  const duration_mins = parseIntOrNull(body.duration_mins)
  if (fee_from === undefined || fee_to === undefined || duration_mins === undefined) {
    return NextResponse.json({ error: 'Fees and duration must be non-negative numbers' }, { status: 400 })
  }

  const payload = { fee_from, fee_to, duration_mins }

  // Manual upsert: no unique constraint on (dentist_id, treatment_id) is
  // guaranteed, so look for an existing row and update it, else insert. This
  // makes "check the box + set fees" idempotent — re-saving updates fees
  // rather than creating a duplicate join row.
  const { data: existing, error: findErr } = await admin_db
    .from('dentist_treatments')
    .select('id')
    .eq('dentist_id', id)
    .eq('treatment_id', treatment_id)
    .maybeSingle()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })

  if (existing) {
    const { data, error } = await admin_db
      .from('dentist_treatments').update(payload).eq('id', existing.id).select(SELECT_COLS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, row: data })
  }

  const { data, error } = await admin_db
    .from('dentist_treatments')
    .insert({ dentist_id: id, treatment_id, ...payload })
    .select(SELECT_COLS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, row: data })
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing dentist id' }, { status: 400 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const treatment_id = typeof body.treatment_id === 'string' ? body.treatment_id : ''
  if (!treatment_id) return NextResponse.json({ error: 'Missing treatment_id' }, { status: 400 })

  // .select() so a no-op delete (already gone) is observable, matching the
  // dentist-side pattern.
  const { data, error } = await admin_db
    .from('dentist_treatments')
    .delete()
    .eq('dentist_id', id)
    .eq('treatment_id', treatment_id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, removed: data?.length ?? 0 })
}
