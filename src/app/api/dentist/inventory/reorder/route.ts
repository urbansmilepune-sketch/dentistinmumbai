// Reorder action — two channels:
//
//   whatsapp     — logs an inventory_reorders row (status='pending') and
//                  returns the wa.me deep-link the client opens. The actual
//                  WhatsApp send happens in the user's browser, so this
//                  endpoint is just the audit trail + URL builder.
//
//   dentalsamaan — mints a short-lived SSO JWT carrying the dentist's
//                  identity + this single item as a pre-loaded cart, logs the
//                  reorder (with ds_product_slug so the inbound webhook can
//                  correlate the order back), and returns the DentalSamaan
//                  redirect URL the client opens in a new tab.
//
// The supplier_phone column is normalised through whatsappLink so a stored
// '+91 9876 543 210' produces a clean wa.me URL — only relevant to the
// whatsapp channel; dentalsamaan needs no supplier contact.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'
import { whatsappLink } from '@/lib/phone'
import { mintDentalSamaanToken } from '@/lib/integrations/dentalsamaan-token'

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

// "Composite Resin A2" -> "composite-resin-a2". DentalSamaan resolves this
// against Product.slug; unknown slugs are dropped on its side, so a no-match
// just means the dentist lands on an empty cart rather than an error.
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Best-effort 6-digit Indian PIN extraction from a free-text address. The
// dentists table has no dedicated pincode column, so we scrape it; an empty
// string is fine — DentalSamaan stores the address either way.
function extractPincode(addr: string | null | undefined): string {
  if (!addr) return ''
  const m = addr.match(/\b(\d{6})\b/)
  return m ? m[1] : ''
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const itemId = typeof body.item_id === 'string' ? body.item_id : ''
    if (!itemId) return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
    const channel = typeof body.channel === 'string' ? body.channel.toLowerCase() : 'whatsapp'
    if (channel !== 'whatsapp' && channel !== 'dentalsamaan') {
      return NextResponse.json({ error: 'Unsupported reorder channel' }, { status: 400 })
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

    // Default reorder quantity = enough to refill above min_stock_level when
    // the caller didn't pass a quantity. Shared across both channels.
    const min = Number(item.min_stock_level || 0)
    const cur = Number(item.current_stock || 0)
    const refill = Math.max(1, Math.ceil(min * 2 - cur))
    const qty = quantity ?? refill

    // ---- DentalSamaan channel ---------------------------------------------
    if (channel === 'dentalsamaan') {
      const { data: dentist, error: dentistErr } = await db
        .from('dentists')
        .select('id, name, clinic_name, phone, address, city, gstin')
        .eq('id', owner.id)
        .maybeSingle()
      if (dentistErr) return fail('reorder.dentist-lookup', dentistErr)

      const slug = slugify(item.name)
      const address = (dentist?.address as string | null) ?? null
      const deliveryAddress = address
        ? { line1: address, city: (dentist?.city as string | null) ?? '', pincode: extractPincode(address) }
        : null

      let token: string
      try {
        token = await mintDentalSamaanToken({
          dentistId: owner.id,
          email: owner.email,
          name: (dentist?.name as string | null) ?? owner.name ?? '',
          clinicName: (dentist?.clinic_name as string | null) ?? owner.clinic_name ?? '',
          phone: (dentist?.phone as string | null) ?? null,
          gstin: (dentist?.gstin as string | null) ?? null,
          deliveryAddress,
          cartItems: [{ productSlug: slug, quantity: qty, productName: item.name }],
        })
      } catch (err) {
        return fail('reorder.mint', err)
      }

      const base = process.env.DENTAL_SAMAAN_BASE_URL || 'https://dentalsamaan.com'
      const redirectUrl = `${base}/api/auth/dentistin?ds_token=${encodeURIComponent(token)}`

      const { data: inserted, error: insertErr } = await db
        .from('inventory_reorders')
        .insert({
          dentist_id: owner.id,
          item_id: itemId,
          channel: 'dentalsamaan',
          quantity: qty,
          status: 'pending',
          ds_product_slug: slug,
        })
        .select('id, created_at')
        .single()
      if (insertErr) return fail('reorder.insert', insertErr)

      return NextResponse.json({
        success: true,
        reorder: inserted,
        redirect_url: redirectUrl,
        quantity: qty,
      })
    }

    // ---- WhatsApp channel -------------------------------------------------
    if (!item.supplier_phone) {
      return NextResponse.json({
        error: 'No supplier contact saved for this item',
        code: 'NO_SUPPLIER_PHONE',
      }, { status: 400 })
    }

    const message = `Hi, I need to reorder ${qty} ${item.unit} of ${item.name}. Please confirm availability.`
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
        quantity: qty,
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
      quantity: qty,
    })
  } catch (err) {
    return fail('reorder', err)
  }
}
