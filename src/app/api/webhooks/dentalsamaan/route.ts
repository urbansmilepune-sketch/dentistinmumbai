// Inbound webhook from DentalSamaan — order lifecycle for reorders that
// originated from the inventory dashboard's "Order on DentalSamaan" button.
//
// DentalSamaan signs the raw body with HMAC-SHA256 over DENTISTIN_WEBHOOK_SECRET
// and sends it as X-DentalSamaan-Signature. We verify before trusting anything.
//
// Correlation: at mint time the reorder route logged an inventory_reorders row
// with channel='dentalsamaan', status='pending', and ds_product_slug = the
// slugified item name (no order number yet — the DentalSamaan order is created
// later at checkout). The webhook carries { orderNumber, dentistId, items[] },
// so we match a pending/confirmed row by (dentist_id, ds_product_slug) and
// stamp ds_order_number on first contact.
//
// Idempotency: each handler only touches rows in the *pre-transition* status
// (confirmed ← pending, delivered ← pending/confirmed, cancelled ←
// pending/confirmed). A duplicate delivery therefore matches nothing and is a
// no-op — in particular stock is never double-incremented.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface WebhookItem {
  productSlug: string
  productName: string
  quantity: number
}
interface WebhookPayload {
  event: 'order.confirmed' | 'order.delivered' | 'order.cancelled'
  orderNumber: string
  dentistId: string
  items: WebhookItem[]
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.DENTISTIN_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  // Length check first — timingSafeEqual throws on length mismatch.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  // Read the RAW body — JSON.parse + re-stringify would not reproduce the exact
  // bytes DentalSamaan signed, breaking the HMAC.
  const raw = await request.text()
  const signature = request.headers.get('x-dentalsamaan-signature')
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { event, orderNumber, dentistId, items } = payload
  if (!event || !dentistId) {
    return NextResponse.json({ error: 'Missing event or dentistId' }, { status: 400 })
  }
  const list = Array.isArray(items) ? items : []

  const db = admin()

  try {
    if (event === 'order.confirmed') {
      for (const item of list) {
        const { data: row } = await db
          .from('inventory_reorders')
          .select('id')
          .eq('dentist_id', dentistId)
          .eq('channel', 'dentalsamaan')
          .eq('ds_product_slug', item.productSlug)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (row) {
          await db
            .from('inventory_reorders')
            .update({ status: 'confirmed', ds_order_number: orderNumber })
            .eq('id', row.id)
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (event === 'order.delivered') {
      for (const item of list) {
        // Prefer an order-number + slug match; fall back to slug alone in case
        // the confirmed event never arrived to stamp the order number.
        const matched = await db
          .from('inventory_reorders')
          .select('id, item_id, quantity')
          .eq('dentist_id', dentistId)
          .eq('channel', 'dentalsamaan')
          .eq('ds_order_number', orderNumber)
          .eq('ds_product_slug', item.productSlug)
          .in('status', ['pending', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        let row = matched.data
        if (!row) {
          const fallback = await db
            .from('inventory_reorders')
            .select('id, item_id, quantity')
            .eq('dentist_id', dentistId)
            .eq('channel', 'dentalsamaan')
            .eq('ds_product_slug', item.productSlug)
            .in('status', ['pending', 'confirmed'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          row = fallback.data
        }
        if (!row) continue

        const qty = Number(item.quantity) > 0 ? Number(item.quantity) : Number(row.quantity || 0)

        await db
          .from('inventory_reorders')
          .update({ status: 'delivered', ds_order_number: orderNumber })
          .eq('id', row.id)

        // Restock the inventory item: paper-trail movement first, then bump
        // current_stock — same ordering as the manual /restock endpoint.
        if (row.item_id && qty > 0) {
          await db.from('inventory_movements').insert({
            dentist_id: dentistId,
            item_id: row.item_id,
            type: 'restock',
            quantity: qty,
            notes: `DentalSamaan delivery · order ${orderNumber}`,
          })
          const { data: invItem } = await db
            .from('inventory_items')
            .select('current_stock')
            .eq('id', row.item_id)
            .maybeSingle()
          const newStock = Number(invItem?.current_stock || 0) + qty
          await db
            .from('inventory_items')
            .update({ current_stock: newStock, updated_at: new Date().toISOString() })
            .eq('id', row.item_id)
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (event === 'order.cancelled') {
      for (const item of list) {
        const { data: row } = await db
          .from('inventory_reorders')
          .select('id')
          .eq('dentist_id', dentistId)
          .eq('channel', 'dentalsamaan')
          .eq('ds_product_slug', item.productSlug)
          .in('status', ['pending', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (row) {
          await db
            .from('inventory_reorders')
            .update({ status: 'cancelled', ds_order_number: orderNumber })
            .eq('id', row.id)
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true, ignored: event })
  } catch (err) {
    console.error('[webhook:dentalsamaan]', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
