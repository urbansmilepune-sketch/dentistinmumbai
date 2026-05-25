// Restock action — adds quantity to current_stock and writes an
// inventory_movements row of type 'restock'. The movement log is what the
// monthly-usage analytics + reorder history derive from, so the insert
// happens BEFORE the stock update; if either fails, the response surfaces
// the underlying message so the dashboard can show it instead of swallowing.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'

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

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const quantity = Number(body.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    const db = admin()
    const { data: item, error: lookupErr } = await db
      .from('inventory_items')
      .select('id, dentist_id, current_stock')
      .eq('id', id)
      .maybeSingle()
    if (lookupErr) return fail('restock.lookup', lookupErr)
    if (!item || item.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const newStock = Number(item.current_stock || 0) + quantity

    const { error: movementErr } = await db.from('inventory_movements').insert({
      dentist_id: owner.id,
      item_id: id,
      type: 'restock',
      quantity,
      notes,
    })
    if (movementErr) return fail('restock.movement-insert', movementErr)

    const { data: updated, error: updateErr } = await db
      .from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, category, current_stock, min_stock_level, unit, expiry_date, supplier_name, supplier_phone, unit_cost, notes, created_at, updated_at')
      .single()
    if (updateErr) return fail('restock.update', updateErr)

    return NextResponse.json({ item: updated, success: true })
  } catch (err) {
    return fail('restock', err)
  }
}
