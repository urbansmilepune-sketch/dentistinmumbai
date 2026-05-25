// Alerts feed for the inventory dashboard — surfaces every item that
// crossed a threshold (stock-out, low stock, expiring in the next 30 days,
// already expired). The dashboard renders a banner from this so the
// dentist sees the worst items even when they're scrolled out of view in
// the main table.
//
// Returned shape is bucketed (out/low/expired/expiringSoon) so the banner
// can show counts per kind without re-deriving on the client.
import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'

const EXPIRING_SOON_DAYS = 30

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

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoPlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET() {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = admin()
    // Items + last-30-days 'use' movements in parallel — the summary row
    // needs both (low/expiring counts come from items, monthly-usage value
    // comes from movements × unit_cost).
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const [{ data, error }, { data: usageMovements, error: movementErr }] = await Promise.all([
      db
        .from('inventory_items')
        .select('id, name, category, current_stock, min_stock_level, unit, expiry_date, supplier_name, supplier_phone, unit_cost')
        .eq('dentist_id', owner.id),
      db
        .from('inventory_movements')
        .select('item_id, quantity')
        .eq('dentist_id', owner.id)
        .eq('type', 'use')
        .gte('created_at', thirtyDaysAgo.toISOString()),
    ])
    if (error) return fail('alerts.select', error)
    if (movementErr) return fail('alerts.movements', movementErr)

    // Map item_id → unit_cost so we can value each 'use' movement without
    // re-joining server-side.
    const unitCostById = new Map<string, number>()
    for (const item of data ?? []) {
      unitCostById.set(item.id, Number(item.unit_cost ?? 0))
    }
    let monthlyUsageValue = 0
    for (const m of usageMovements ?? []) {
      const cost = unitCostById.get(m.item_id) ?? 0
      monthlyUsageValue += cost * Number(m.quantity ?? 0)
    }

    const today = todayIso()
    const horizon = isoPlusDays(EXPIRING_SOON_DAYS)

    const out: typeof data = []
    const low: typeof data = []
    const expired: typeof data = []
    const expiringSoon: typeof data = []

    for (const item of data ?? []) {
      const stock = Number(item.current_stock || 0)
      const min = Number(item.min_stock_level || 0)
      if (stock <= 0) out.push(item)
      else if (stock <= min) low.push(item)

      if (item.expiry_date) {
        if (item.expiry_date < today) expired.push(item)
        else if (item.expiry_date <= horizon) expiringSoon.push(item)
      }
    }

    return NextResponse.json({
      out, low, expired, expiringSoon,
      counts: { out: out.length, low: low.length, expired: expired.length, expiringSoon: expiringSoon.length },
      monthly_usage_value: monthlyUsageValue,
      total_items: (data ?? []).length,
    })
  } catch (err) {
    return fail('alerts', err)
  }
}
