// Required environment variables:
//   RAZORPAY_KEY_ID                 — Razorpay key id
//   RAZORPAY_KEY_SECRET             — Razorpay key secret (used to verify the HMAC signature)
//   NEXT_PUBLIC_SUPABASE_URL        — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY       — service-role key, used to update the dentists.tier column
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

const GOLD_PERIOD_DAYS = 30

export async function POST(request: NextRequest) {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 500 })
  }

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json()
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (expected !== razorpay_signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: dentist, error: dentistErr } = await admin
    .from('dentists')
    .select('id, tier, tier_expires_at')
    .eq('email', user.email)
    .single()
  if (dentistErr || !dentist) {
    return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })
  }

  const now = new Date()
  const base = dentist.tier_expires_at && new Date(dentist.tier_expires_at) > now
    ? new Date(dentist.tier_expires_at)
    : now
  const newExpiry = new Date(base.getTime() + GOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  const { error: updateErr } = await admin
    .from('dentists')
    .update({ tier: 'gold', tier_expires_at: newExpiry.toISOString() })
    .eq('id', dentist.id)

  if (updateErr) {
    console.error('[razorpay verify] tier update failed', { dentist_id: dentist.id, razorpay_payment_id, error: updateErr.message })
    return NextResponse.json({ error: 'Payment verified but upgrade failed — please contact support with payment id ' + razorpay_payment_id }, { status: 500 })
  }

  return NextResponse.json({ success: true, tier: 'gold', tier_expires_at: newExpiry.toISOString() })
}
