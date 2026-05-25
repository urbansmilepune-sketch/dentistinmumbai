// Reorder action — logs an inventory_reorders row (channel='whatsapp',
// status='pending') and returns the wa.me deep-link the client should
// open. The actual WhatsApp send happens in the user's browser, so this
// endpoint is just the audit trail + URL builder.
//
// The supplier_phone column is normalised through formatIndianWhatsAppDigits
// so a stored '+91 9876 543 210' produces a clean wa.me URL. If the column
// is empty or unusable, we return 400 and the dashboard prompts the dentist
// to add a supplier contact instead of opening WhatsApp to nothing.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'
import { whatsappLink } from '@/lib/phone'

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

export async function POST(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const itemId = typeof body.item_id === 'string' ? body.item_id : ''
    if (!itemId) return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
    const channel = typeof body.channel === 'string' ? body.channel.toLowerCase() : 'whatsapp'
    if (channel !== 'whatsapp') {
      return NextResponse.json({ error: 'Only the whatsapp channel is supported right now' }, { status: 400 })
    }
    const quantityRaw = body.quantity
    const quantity = quantityRaw == null || quantityRaw === '' ? null : Number(quantityRaw)
    if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
    }

    const db = admin()
    const { data: item, error: lookupErr } = await db
      .from('inventory_items')
      .select('id, dentist_id, name, unit, current_stock, min_stock_level, supplier_name, supplier_phone')
      .eq('id', itemId)
      .maybeSingle()
    if (lookupErr) return fail('reorder.lookup', lookupErr)
    if (!item || item.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (!item.supplier_phone) {
      return NextResponse.json({
        error: 'No supplier contact saved for this item',
        code: 'NO_SUPPLIER_PHONE',
      }, { status: 400 })
    }

    // Default reorder quantity = enough to refill above min_stock_level when
    // the caller didn't pass a quantity. Most dentists just want "order
    // enough to be safe", and this gives them a sensible non-zero number
    // without forcing a form before the WhatsApp opens.
    const min = Number(item.min_stock_level || 0)
    const cur = Number(item.current_stock || 0)
    const refill = Math.max(1, Math.ceil(min * 2 - cur))
    const qtyForMessage = quantity ?? refill

    const message = `Hi, I need to reorder ${qtyForMessage} ${item.unit} of ${item.name}. Please confirm availability.`
    const waUrl = whatsappLink(item.supplier_phone, message)
    if (!waUrl) {
      return NextResponse.json({
        error: 'Supplier phone is not a valid Indian mobile number',
        code: 'INVALID_SUPPLIER_PHONE',
      }, { status: 400 })
    }

    const { data: inserted, error: insertErr } = await db
      .from('inventory_reorders')
      .insert({
        dentist_id: owner.id,
        item_id: itemId,
        channel: 'whatsapp',
        quantity: qtyForMessage,
        status: 'pending',
      })
      .select('id, created_at')
      .single()
    if (insertErr) return fail('reorder.insert', insertErr)

    return NextResponse.json({
      success: true,
      reorder: inserted,
      whatsapp_url: waUrl,
      supplier_name: item.supplier_name,
      quantity: qtyForMessage,
    })
  } catch (err) {
    return fail('reorder', err)
  }
}
