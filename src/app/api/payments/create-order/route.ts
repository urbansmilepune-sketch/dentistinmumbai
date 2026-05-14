// Required environment variables:
//   RAZORPAY_KEY_ID         — Razorpay key id (server-only; the public key id is also sent to the browser)
//   RAZORPAY_KEY_SECRET     — Razorpay key secret (server-only, NEVER expose to the client)
import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

const PLANS = {
  monthly: { amount_paise: 99900,  period_days: 30,  label: 'Gold — Monthly (30 days)' },
  annual:  { amount_paise: 999900, period_days: 365, label: 'Gold — Annual (365 days)' },
} as const
type PlanKey = keyof typeof PLANS

function normalizePlan(input: unknown): PlanKey {
  return input === 'annual' ? 'annual' : 'monthly'
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const planKey = normalizePlan(body?.plan)
  const plan = PLANS[planKey]

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })

  try {
    const order = await razorpay.orders.create({
      amount: plan.amount_paise,
      currency: 'INR',
      receipt: `gold_${planKey}_${dentist.id.slice(0, 8)}_${Date.now()}`,
      // notes are the trusted server-side record of what was sold; verify reads
      // them back from Razorpay so the client can't claim a different plan after
      // paying for a smaller one.
      notes: {
        dentist_id: dentist.id,
        plan: 'gold',
        plan_period: planKey,
        period_days: String(plan.period_days),
      },
    })

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      dentist_name: dentist.name,
      dentist_email: dentist.email,
      plan_label: plan.label,
      plan_period: planKey,
    })
  } catch (err: any) {
    console.error('[razorpay create-order] failed', err)
    return NextResponse.json({ error: 'Could not create order' }, { status: 500 })
  }
}
