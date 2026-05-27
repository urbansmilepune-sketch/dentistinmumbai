// Required environment variables:
//   RAZORPAY_KEY_ID                 — Razorpay key id
//   RAZORPAY_KEY_SECRET             — Razorpay key secret (used to verify the HMAC signature and to fetch the order)
//   NEXT_PUBLIC_SUPABASE_URL        — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY       — service-role key, used to update the dentists.tier column
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import Razorpay from 'razorpay'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { sendUpgradeConfirmationEmail } from '@/lib/email'
import { getCityBySlug } from '@/config/cities'

const FALLBACK_PERIOD_DAYS = 30
const VALID_TIERS = ['silver', 'gold'] as const
type PaidTier = typeof VALID_TIERS[number]

export async function POST(request: NextRequest) {
  if (!process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_KEY_ID) {
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

  // Pull the trusted order from Razorpay so we extend the tier by the period
  // and tier the dentist actually paid for. We never trust the client to tell
  // us which plan they bought — a malicious caller could pay Silver-monthly
  // and claim Gold-annual otherwise.
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })

  let amountPaise = 0
  let periodDays = FALLBACK_PERIOD_DAYS
  let paidTier: PaidTier | null = null
  let orderStatus: string | undefined
  try {
    const order: any = await razorpay.orders.fetch(razorpay_order_id)
    amountPaise = Number(order?.amount) || 0
    orderStatus = typeof order?.status === 'string' ? order.status : undefined
    const noteDays = Number(order?.notes?.period_days)
    if (Number.isFinite(noteDays) && noteDays > 0) periodDays = noteDays
    const notePlan = order?.notes?.plan
    if (notePlan === 'silver' || notePlan === 'gold') paidTier = notePlan
  } catch (err) {
    console.error('[razorpay verify] order fetch failed', { razorpay_order_id, err })
    return NextResponse.json({ error: 'Could not verify order — please contact support with payment id ' + razorpay_payment_id }, { status: 500 })
  }

  // A valid HMAC signature only proves the payment_id was issued against this
  // order_id by Razorpay — it does NOT prove the payment was captured. An
  // attacker who triggers an order, signs it, then ABORTS before capture
  // would still pass the signature check above. Only Razorpay's own
  // accounting (order.status === 'paid') tells us the money actually moved.
  if (orderStatus !== 'paid') {
    console.error('[razorpay verify] order not in paid status', { razorpay_order_id, razorpay_payment_id, orderStatus })
    return NextResponse.json({ error: 'Payment not captured yet — please retry in a few seconds, or contact support with payment id ' + razorpay_payment_id }, { status: 400 })
  }

  if (!paidTier) {
    console.error('[razorpay verify] order missing trusted plan note', { razorpay_order_id, razorpay_payment_id })
    return NextResponse.json({ error: 'Order is missing plan info — please contact support with payment id ' + razorpay_payment_id }, { status: 500 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: dentist, error: dentistErr } = await admin
    .from('dentists')
    .select('id, name, email, city, tier, tier_expires_at')
    .eq('email', user.email)
    .single()
  if (dentistErr || !dentist) {
    return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })
  }

  // Record the payment first. The unique constraint on razorpay_payment_id
  // is what blocks replay attacks: a second verify call with the same
  // payment id hits 23505 and we return 409 without re-extending the tier.
  const { error: paymentErr } = await admin.from('payments').insert({
    razorpay_payment_id,
    razorpay_order_id,
    dentist_id: dentist.id,
    amount_paise: amountPaise,
    plan: paidTier,
  })
  if (paymentErr) {
    if (paymentErr.code === '23505') {
      return NextResponse.json({ error: 'Payment already processed' }, { status: 409 })
    }
    console.error('[razorpay verify] payment insert failed', { razorpay_payment_id, error: paymentErr.message })
    return NextResponse.json({ error: 'Could not record payment — please contact support with payment id ' + razorpay_payment_id }, { status: 500 })
  }

  const now = new Date()
  const base = dentist.tier_expires_at && new Date(dentist.tier_expires_at) > now
    ? new Date(dentist.tier_expires_at)
    : now
  const newExpiry = new Date(base.getTime() + periodDays * 24 * 60 * 60 * 1000)

  const { error: updateErr } = await admin
    .from('dentists')
    .update({ tier: paidTier, tier_expires_at: newExpiry.toISOString() })
    .eq('id', dentist.id)

  if (updateErr) {
    console.error('[razorpay verify] tier update failed', { dentist_id: dentist.id, razorpay_payment_id, error: updateErr.message })
    return NextResponse.json({ error: 'Payment verified but upgrade failed — please contact support with payment id ' + razorpay_payment_id }, { status: 500 })
  }

  // Notifications are intentionally fire-and-forget after the tier has been
  // updated. The dentist has already paid and their tier is correct in the
  // DB; a Resend hiccup or the WhatsApp stub returning slow must NOT make
  // this route 500, because that would surface as "your payment failed"
  // in CheckoutButton and the dentist would assume their money is stuck.
  // Both helpers log their own failures.
  const tierExpiresIso = newExpiry.toISOString()
  const periodLabel = periodDays === 365 ? 'Annual' : 'Monthly'
  const amountInr = Math.round(amountPaise / 100)
  const cityCfg = getCityBySlug(dentist.city)
  if (dentist.email) {
    sendUpgradeConfirmationEmail({
      to_email: dentist.email,
      name: dentist.name || 'there',
      tier: paidTier,
      tier_expires_at: tierExpiresIso,
      city: dentist.city || undefined,
    }).catch(err => console.error('[razorpay verify] upgrade email failed', err))
  }

  const validUntilHuman = newExpiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const tierLabel = paidTier === 'silver' ? 'Silver' : 'Gold'
  const adminMessage = `💰 New Payment!\n\nDentist: ${dentist.name || 'Unknown'}\nPlan: ${tierLabel} ${periodLabel}\nAmount: ₹${amountInr}\nValid until: ${validUntilHuman}\nCity: ${cityCfg.cityName}`
  // Reuse the platform's existing WhatsApp endpoint. It currently logs but
  // does not deliver until a WATI/Twilio/MSG91 backend is wired into
  // /api/notifications/whatsapp — same pattern the registrations route uses.
  const origin = new URL(request.url).origin
  fetch(`${origin}/api/notifications/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: adminMessage }),
  }).catch(err => console.error('[razorpay verify] admin whatsapp failed', err))

  return NextResponse.json({ success: true, tier: paidTier, tier_expires_at: tierExpiresIso, period_days: periodDays })
}
