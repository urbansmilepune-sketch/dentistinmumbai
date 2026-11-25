// Razorpay payment links for paid Featured event / course listings.
//
// Off until EVENT_PAYMENTS_ENABLED=true. While it's off, a Featured request
// is still saved (payment_status 'pending', no link) and shows in the admin
// Events tab, so nothing is lost; the admin can create the link later.
//
// The matching payment_link.paid event lands on the existing webhook
// /api/payments/razorpay-webhook, which reads notes.event_id and marks the
// listing paid.
//
// Env: EVENT_PAYMENTS_ENABLED, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// (the key pair the dentist invoices already use).

import Razorpay from 'razorpay'
import { NATIONAL_ORIGIN } from '@/config/cities'

export function eventPaymentsEnabled(): boolean {
  return process.env.EVENT_PAYMENTS_ENABLED === 'true' && !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET
}

export async function createEventPaymentLink(ev: {
  id: string
  title: string
  amount_rupees: number
  submitter_email: string | null
  submitter_phone: string | null
  organiser: string | null
}): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  if (!eventPaymentsEnabled()) return { ok: false, error: 'Payments are not switched on yet (EVENT_PAYMENTS_ENABLED)' }
  const paise = Math.round(ev.amount_rupees * 100)
  if (!Number.isFinite(paise) || paise <= 0) return { ok: false, error: 'Invalid amount' }
  const digits = (ev.submitter_phone || '').replace(/\D/g, '')
  const contact = digits.length >= 10 ? `+91${digits.slice(-10)}` : undefined
  try {
    const rz = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! })
    const link = await (rz as any).paymentLink.create({
      amount: paise,
      currency: 'INR',
      accept_partial: false,
      description: `Featured listing on DentistIn India: ${ev.title}`.slice(0, 2048),
      customer: {
        name: (ev.organiser || 'Organiser').slice(0, 100),
        ...(ev.submitter_email ? { email: ev.submitter_email } : {}),
        ...(contact ? { contact } : {}),
      },
      notify: { sms: false, email: false },
      reminder_enable: true,
      callback_url: `${NATIONAL_ORIGIN}/events/listing/${ev.id}`,
      callback_method: 'get',
      notes: { event_id: ev.id, kind: 'event_featured' },
    })
    return { ok: true, id: link.id, url: link.short_url }
  } catch (err: any) {
    console.error('[eventPayments] create link failed', err)
    return { ok: false, error: err?.error?.description || err?.message || 'Could not create payment link' }
  }
}
