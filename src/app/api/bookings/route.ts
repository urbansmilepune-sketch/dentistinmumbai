// Required environment variables:
//   NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY      — service-role key (server-only)
//   MSG91_AUTH_KEY                 — MSG91 auth key; without it notifyDentist() logs to stdout instead of sending
//   MSG91_BOOKING_TEMPLATE_ID      — MSG91 flow template id for the booking-notification message
//   MSG91_SENDER_ID                — DLT-registered 6-char header passed as `sender` in the flow body
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCityBySlug } from '@/config/cities'

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

async function notifyDentist(phone: string, message: string) {
  if (!process.env.MSG91_AUTH_KEY) {
    console.log('[MSG91 not configured] Would send to', phone, ':', message)
    return
  }
  // NOTE: MSG91 Flow templates render PRE-REGISTERED text using named variables
  // passed per recipient (e.g. { mobiles, patient_name, date, ... }). The
  // `message` field below is ignored by Flow and exists only so the function
  // signature still carries the human-readable text for logging/fallback.
  // To make the dentist actually receive a useful SMS, edit your MSG91 flow
  // template to accept the booking fields and pass them by name here.
  try {
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY },
      body: JSON.stringify({
        template_id: process.env.MSG91_BOOKING_TEMPLATE_ID,
        sender: process.env.MSG91_SENDER_ID,
        short_url: '0',
        recipients: [{ mobiles: `91${phone.replace(/\D/g, '')}`, message }],
      }),
    })
    if (!res.ok) console.error('[MSG91 Flow]', res.status, await res.text().catch(() => ''))
  } catch (err) { console.error('[MSG91 Error]', err) }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { dentist_id, patient_name, patient_phone, appt_date, time_slot, treatment_id, notes } = body

    if (!dentist_id || !patient_name || !patient_phone || !appt_date || !time_slot) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[bookings] missing supabase env vars', {
        has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
      return NextResponse.json({ error: 'Bookings backend not configured' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // Double-booking guard. This is a check-then-insert and still has a small
    // race window — for stronger guarantees add a partial unique index on
    // (dentist_id, appt_date, time_slot) WHERE status != 'cancelled' and let
    // the constraint surface 23505 here.
    const { data: clash, error: clashErr } = await supabase
      .from('appointments')
      .select('id')
      .eq('dentist_id', dentist_id)
      .eq('appt_date', appt_date)
      .eq('time_slot', time_slot)
      .neq('status', 'cancelled')
      .maybeSingle()
    if (clashErr) {
      console.error('[bookings] clash check failed', {
        dentist_id, appt_date, time_slot,
        code: clashErr.code, message: clashErr.message, details: clashErr.details, hint: clashErr.hint,
      })
      return NextResponse.json({
        error: 'Could not check slot availability',
        code: clashErr.code, message: clashErr.message, details: clashErr.details, hint: clashErr.hint,
      }, { status: 500 })
    }
    if (clash) {
      return NextResponse.json({ error: 'This slot is already booked. Please choose another time.' }, { status: 409 })
    }

    const reference_no = generateRef()

    const { data: dentist, error: dentistErr } = await supabase
      .from('dentists').select('name, phone, whatsapp, clinic_name, city').eq('id', dentist_id).single()
    if (dentistErr) {
      console.error('[bookings] dentist lookup failed', {
        dentist_id,
        code: dentistErr.code, message: dentistErr.message, details: dentistErr.details, hint: dentistErr.hint,
      })
      // Don't 500 the patient on a dentist lookup failure — the notify step
      // below already skips when `dentist` is null. But surface the issue
      // if it's a real error rather than just a missing row.
      if (dentistErr.code !== 'PGRST116') {
        return NextResponse.json({
          error: 'Could not look up dentist',
          code: dentistErr.code, message: dentistErr.message, details: dentistErr.details, hint: dentistErr.hint,
        }, { status: 500 })
      }
    }

    let treatmentName = 'General Consultation'
    if (treatment_id) {
      const { data: treatment } = await supabase.from('treatments').select('name').eq('id', treatment_id).single()
      if (treatment) treatmentName = treatment.name
    }

    const insertPayload = {
      dentist_id,
      patient_name,
      patient_phone,
      appt_date,
      time_slot,
      treatment_id: treatment_id || null,
      notes: notes || null,
      // CHECK constraint on appointments.status only allows pending, confirmed,
      // completed, cancelled, no_show. 'scheduled' was rejected, surfacing as
      // 23514 on every booking. New patient-booked rows start as 'pending'
      // until the dentist confirms in the dashboard.
      status: 'pending',
      reference_no,
    }

    const { data, error } = await supabase.from('appointments')
      .insert(insertPayload)
      .select('id, reference_no').single()

    if (error) {
      // Log the full Postgres-shaped error so a) the Vercel logs name the
      // failing column/constraint and b) the response includes the same
      // detail so the patient can be told what to retry. The status echo is
      // intentional — if a CHECK constraint on `status` rejects 'scheduled',
      // we want to see that immediately, not after grepping logs.
      console.error('[bookings] insert failed', {
        code: error.code, message: error.message, details: error.details, hint: error.hint,
        payload_keys: Object.keys(insertPayload),
      })
      return NextResponse.json({
        error: 'Failed to create booking',
        code: error.code, message: error.message, details: error.details, hint: error.hint,
      }, { status: 500 })
    }

    if (dentist) {
      const dentistPhone = dentist.whatsapp || dentist.phone
      const formattedDate = new Date(appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      const cityCfg = getCityBySlug((dentist as any).city)
      const message = `🦷 New Appointment — ${cityCfg.domain}\n\nRef: ${reference_no}\nPatient: ${patient_name}\nPhone: ${patient_phone}\nTreatment: ${treatmentName}\nDate: ${formattedDate} at ${time_slot}${notes ? `\nNote: ${notes}` : ''}\n\nManage: ${cityCfg.domain}/for-dentists/dashboard`
      // Don't let an SMS-provider hiccup nuke the booking response — the
      // appointment row is already committed. Catch + log + carry on.
      if (dentistPhone) {
        try { await notifyDentist(dentistPhone, message) }
        catch (notifyErr) { console.error('[bookings] notifyDentist failed (booking succeeded)', notifyErr) }
      }
    }

    return NextResponse.json({ success: true, reference_no: data.reference_no, id: data.id })
  } catch (error: any) {
    console.error('[bookings] unexpected error', {
      name: error?.name, message: error?.message, stack: error?.stack,
      code: error?.code, details: error?.details, hint: error?.hint,
    })
    return NextResponse.json({
      error: 'Failed to create booking',
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dentist_id = searchParams.get('dentist_id')
  const date = searchParams.get('date')
  if (!dentist_id || !date) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await supabase.from('appointments').select('time_slot').eq('dentist_id', dentist_id).eq('appt_date', date).neq('status', 'cancelled')
  return NextResponse.json({ booked_slots: (data || []).map((a: any) => a.time_slot) })
}
