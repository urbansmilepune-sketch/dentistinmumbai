// Required environment variables:
//   RAZORPAY_KEY_ID         — Razorpay key id (server-only; the public key id is also sent to the browser)
//   RAZORPAY_KEY_SECRET     — Razorpay key secret (server-only, NEVER expose to the client)
import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

// (plan, billing) → server-authoritative price + period. The verify route
// re-reads these from the order's `notes` so the client never gets to dictate
// what they paid for.
const PLANS = {
  silver_monthly: { tier: 'silver', amount_paise: 49900,  period_days: 30,  label: 'Silver — Monthly (30 days)' },
  silver_annual:  { tier: 'silver', amount_paise: 499900, period_days: 365, label: 'Silver — Annual (365 days)' },
  gold_monthly:   { tier: 'gold',   amount_paise: 99900,  period_days: 30,  label: 'Gold — Monthly (30 days)' },
  gold_annual:    { tier: 'gold',   amount_paise: 999900, period_days: 365, label: 'Gold — Annual (365 days)' },
} as const
type PlanKey = keyof typeof PLANS

function planKey(plan: unknown, billing: unknown): PlanKey | null {
  const p = plan === 'silver' || plan === 'gold' ? plan : null
  const b = billing === 'monthly' || billing === 'annual' ? billing : null
  if (!p || !b) return null
  return `${p}_${b}` as PlanKey
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

  // 400 on malformed body instead of falling through to `{}` and then
  // surfacing the same "Invalid plan or billing period" message — that
  // conflated a missing field with an unparseable payload, which made
  // CheckoutButton harder to debug when the JSON was bad.
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const key = planKey(body?.plan, body?.billing)
  if (!key) {
    return NextResponse.json({ error: 'Invalid plan or billing period' }, { status: 400 })
  }
  const plan = PLANS[key]

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })

  try {
    const order = await razorpay.orders.create({
      amount: plan.amount_paise,
      currency: 'INR',
      receipt: `${key}_${dentist.id.slice(0, 8)}_${Date.now()}`,
      // notes are the trusted server-side record of what was sold; verify reads
      // them back from Razorpay so the client can't claim a different plan after
      // paying for a smaller one.
      notes: {
        dentist_id: dentist.id,
        plan: plan.tier,
        plan_period: key.endsWith('_annual') ? 'annual' : 'monthly',
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
      plan_tier: plan.tier,
    })
  } catch (err: any) {
    console.error('[razorpay create-order] failed', err)
    return NextResponse.json({ error: 'Could not create order' }, { status: 500 })
  }
}
