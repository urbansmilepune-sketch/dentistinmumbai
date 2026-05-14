// Creates a Razorpay Payment Link for an unpaid invoice and returns the
// short URL so the caller (the dentist's browser) can hand it off via
// WhatsApp. The matching payment_link.paid event is consumed by the
// webhook at /api/payments/razorpay-webhook to flip the invoice.
//
// Required env (same as the existing create-order route):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET
import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, name, clinic_name')
    .eq('email', user.email)
    .single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const invoice_id = typeof body?.invoice_id === 'string' ? body.invoice_id : null
  if (!invoice_id) return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 })

  // Pull the invoice + patient; verify it belongs to this dentist before
  // creating a payment link in their name.
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_no, total, payment_status, dentist_id, patients(name, phone)')
    .eq('id', invoice_id)
    .single()
  if (invErr || !invoice || invoice.dentist_id !== dentist.id) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  if (invoice.payment_status === 'paid') {
    return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 })
  }

  const patient = (invoice as any).patients as { name: string | null; phone: string | null } | null
  const amountPaise = Math.round(Number(invoice.total) * 100)
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return NextResponse.json({ error: 'Invalid invoice amount' }, { status: 400 })
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })

  // Razorpay's customer.contact must be in international (+91…) format.
  const rawPhone = patient?.phone ? String(patient.phone).replace(/\D/g, '') : ''
  const e164Phone = rawPhone ? `+91${rawPhone.slice(-10)}` : undefined

  try {
    const link = await (razorpay as any).paymentLink.create({
      amount: amountPaise,
      currency: 'INR',
      accept_partial: false,
      description: `Invoice ${invoice.invoice_no} — ${dentist.clinic_name || dentist.name || 'Clinic'}`,
      customer: {
        name: patient?.name || 'Patient',
        ...(e164Phone ? { contact: e164Phone } : {}),
      },
      // We deliver the link via WhatsApp ourselves; suppress Razorpay's own
      // SMS/email notifications so the patient hears from the dentist.
      notify: { sms: false, email: false },
      reminder_enable: true,
      // notes are the trusted breadcrumb the webhook reads to find the
      // matching invoice. Keep invoice_id stable here.
      notes: {
        invoice_id: invoice.id,
        invoice_no: invoice.invoice_no,
        dentist_id: dentist.id,
      },
    })

    return NextResponse.json({
      success: true,
      short_url: link.short_url,
      payment_link_id: link.id,
    })
  } catch (err: any) {
    console.error('[payments/create-link] failed', err)
    return NextResponse.json({
      error: 'Could not create payment link',
      detail: err?.error?.description || err?.message,
    }, { status: 500 })
  }
}
