// Razorpay webhook handler — flips invoices to 'paid' when a payment link
// is fulfilled. Configure in Razorpay Dashboard → Webhooks pointing at
// https://<host>/api/payments/razorpay-webhook with event
// payment_link.paid subscribed.
//
// Required env:
//   RAZORPAY_WEBHOOK_SECRET     — the secret string set in Razorpay's
//                                 webhook config; used to HMAC-verify.
//   SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS to update the invoice.
//   NEXT_PUBLIC_SUPABASE_URL
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.error('[razorpay-webhook] missing RAZORPAY_WEBHOOK_SECRET')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Signature is HMAC-SHA256 of the raw body with the webhook secret.
  // We MUST hash the raw text, not a re-serialised JSON.
  const signature = request.headers.get('x-razorpay-signature') || ''
  const raw = await request.text()

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex')

  const expBuf = Buffer.from(expected)
  const sigBuf = Buffer.from(signature)
  if (expBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expBuf, sigBuf)) {
    console.error('[razorpay-webhook] signature mismatch')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: any
  try { payload = JSON.parse(raw) } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const event = payload?.event
  // We only care about payment_link.paid — Razorpay also fires events for
  // partial paid, expired, etc., which we acknowledge but ignore.
  if (event !== 'payment_link.paid') {
    return NextResponse.json({ ok: true, ignored: event })
  }

  const link = payload?.payload?.payment_link?.entity
  const invoice_id = link?.notes?.invoice_id
  if (!invoice_id) {
    console.error('[razorpay-webhook] payment_link.paid without notes.invoice_id', { link_id: link?.id })
    // Acknowledge — there's nothing to update, and 200 stops Razorpay's
    // retry loop. The mismatch is logged for manual reconciliation.
    return NextResponse.json({ ok: true, ignored: 'no invoice_id' })
  }

  const admin_db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // payment_status='paid' is idempotent, so duplicate webhook deliveries
  // (Razorpay retries on 5xx) won't cause incorrect state.
  const { error } = await admin_db
    .from('invoices')
    .update({ payment_status: 'paid' })
    .eq('id', invoice_id)
  if (error) {
    console.error('[razorpay-webhook] invoice update failed', { invoice_id, error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[razorpay-webhook] invoice marked paid', { invoice_id, link_id: link?.id })
  return NextResponse.json({ ok: true })
}
