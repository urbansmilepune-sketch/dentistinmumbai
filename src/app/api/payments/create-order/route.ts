// Required environment variables:
//   RAZORPAY_KEY_ID         — Razorpay key id (server-only; the public key id is also sent to the browser)
//   RAZORPAY_KEY_SECRET     — Razorpay key secret (server-only, NEVER expose to the client)
import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

const GOLD_PRICE_INR = 999
const GOLD_PRICE_PAISE = GOLD_PRICE_INR * 100

export async function POST(_request: NextRequest) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, name, email')
    .eq('email', user.email)
    .single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })

  try {
    const order = await razorpay.orders.create({
      amount: GOLD_PRICE_PAISE,
      currency: 'INR',
      receipt: `gold_${dentist.id.slice(0, 8)}_${Date.now()}`,
      notes: { dentist_id: dentist.id, plan: 'gold' },
    })

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      dentist_name: dentist.name,
      dentist_email: dentist.email,
    })
  } catch (err: any) {
    console.error('[razorpay create-order] failed', err)
    return NextResponse.json({ error: 'Could not create order' }, { status: 500 })
  }
}
