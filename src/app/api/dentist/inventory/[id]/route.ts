// PATCH / DELETE for a single inventory_items row. Companion file route.ts
// has the shared schema notes + categorisation helper. Stock changes go
// through /restock + /use, not PATCH, so movements get a paper trail.
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

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const db = admin()
    // Ownership check — service role bypasses RLS, so verify the row belongs
    // to the session dentist before letting the update through.
    const { data: existing, error: lookupErr } = await db.from('inventory_items').select('id, dentist_id').eq('id', id).maybeSingle()
    if (lookupErr) return fail('PATCH.lookup', lookupErr)
    if (!existing || existing.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const update: Record<string, any> = {}

    if (typeof body.name === 'string') {
      const trimmed = body.name.trim()
      if (!trimmed) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      update.name = trimmed
    }
    if (body.category !== undefined) {
      const cat = normaliseCategory(body.category)
      if (!cat) return NextResponse.json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` }, { status: 400 })
      update.category = cat
    }
    if (typeof body.unit === 'string') {
      const trimmed = body.unit.trim()
      if (!trimmed) return NextResponse.json({ error: 'Unit cannot be empty' }, { status: 400 })
      update.unit = trimmed
    }
    if (body.min_stock_level !== undefined) {
      const n = Number(body.min_stock_level)
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'min_stock_level must be a non-negative number' }, { status: 400 })
      update.min_stock_level = n
    }
    // current_stock is editable here too (e.g. correcting a typo), but the
    // expected flow is restock/use — we don't log a movement for direct edits.
    if (body.current_stock !== undefined) {
      const n = Number(body.current_stock)
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'current_stock must be a non-negative number' }, { status: 400 })
      update.current_stock = n
    }
    if (body.expiry_date !== undefined) {
      update.expiry_date = typeof body.expiry_date === 'string' && body.expiry_date ? body.expiry_date : null
    }
    if (body.supplier_name !== undefined) {
      update.supplier_name = typeof body.supplier_name === 'string' ? body.supplier_name.trim() || null : null
    }
    if (body.supplier_phone !== undefined) {
      update.supplier_phone = typeof body.supplier_phone === 'string' ? body.supplier_phone.trim() || null : null
    }
    if (body.unit_cost !== undefined) {
      update.unit_cost = body.unit_cost === '' || body.unit_cost == null ? null : Number(body.unit_cost)
    }
    if (body.notes !== undefined) {
      update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    update.updated_at = new Date().toISOString()

    const { data, error } = await db
      .from('inventory_items')
      .update(update)
      .eq('id', id)
      .select('id, name, category, current_stock, min_stock_level, unit, expiry_date, supplier_name, supplier_phone, unit_cost, notes, created_at, updated_at')
      .single()
    if (error) return fail('PATCH.update', error)
    return NextResponse.json({ item: data, success: true })
  } catch (err) {
    return fail('PATCH', err)
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const db = admin()
    const { data: existing, error: lookupErr } = await db.from('inventory_items').select('id, dentist_id').eq('id', id).maybeSingle()
    if (lookupErr) return fail('DELETE.lookup', lookupErr)
    if (!existing || existing.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const { error } = await db.from('inventory_items').delete().eq('id', id)
    if (error) return fail('DELETE.delete', error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return fail('DELETE', err)
  }
}
