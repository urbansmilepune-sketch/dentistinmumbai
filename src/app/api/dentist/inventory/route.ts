// Inventory CRUD (list + create) for the dashboard. Scoped to whatever
// dentist owns the current session — dentist_id is taken from the session,
// never accepted from the client. Service role bypasses RLS so we re-verify
// ownership on every mutation.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'

const CATEGORIES = ['consumables', 'instruments', 'medicines', 'ppe', 'lab_materials'] as const
type Category = typeof CATEGORIES[number]

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function fail(scope: string, err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
  console.error(`[inventory:${scope}]`, err)
  return NextResponse.json({ error: message, scope }, { status })
}

function normaliseCategory(raw: unknown): Category | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().replace(/\s+/g, '_')
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : null
}

export async function GET() {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = admin()
    const { data, error } = await db
      .from('inventory_items')
      .select('id, name, category, current_stock, min_stock_level, unit, expiry_date, supplier_name, supplier_phone, unit_cost, notes, created_at, updated_at')
      .eq('dentist_id', owner.id)
      .order('name')
    if (error) return fail('GET.select', error)
    return NextResponse.json({ items: data ?? [] })
  } catch (err) {
    return fail('GET', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const category = normaliseCategory(body.category)
    const unit = typeof body.unit === 'string' ? body.unit.trim() : ''
    const currentStockRaw = body.current_stock
    const minStockRaw = body.min_stock_level

    if (!name) return NextResponse.json({ error: 'Item name is required' }, { status: 400 })
    if (!category) return NextResponse.json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` }, { status: 400 })
    if (!unit) return NextResponse.json({ error: 'Unit is required (e.g. box, piece, ml)' }, { status: 400 })

    const current_stock = Number(currentStockRaw ?? 0)
    const min_stock_level = Number(minStockRaw ?? 0)
    if (!Number.isFinite(current_stock) || current_stock < 0) return NextResponse.json({ error: 'current_stock must be a non-negative number' }, { status: 400 })
    if (!Number.isFinite(min_stock_level) || min_stock_level < 0) return NextResponse.json({ error: 'min_stock_level must be a non-negative number' }, { status: 400 })

    const payload = {
      dentist_id: owner.id,
      name,
      category,
      current_stock,
      min_stock_level,
      unit,
      expiry_date: typeof body.expiry_date === 'string' && body.expiry_date ? body.expiry_date : null,
      supplier_name: typeof body.supplier_name === 'string' ? body.supplier_name.trim() || null : null,
      supplier_phone: typeof body.supplier_phone === 'string' ? body.supplier_phone.trim() || null : null,
      unit_cost: body.unit_cost === '' || body.unit_cost == null ? null : Number(body.unit_cost),
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    }

    const db = admin()
    const { data, error } = await db
      .from('inventory_items')
      .insert(payload)
      .select('id, name, category, current_stock, min_stock_level, unit, expiry_date, supplier_name, supplier_phone, unit_cost, notes, created_at, updated_at')
      .single()
    if (error) return fail('POST.insert', error)
    return NextResponse.json({ item: data, success: true })
  } catch (err) {
    return fail('POST', err)
  }
}
