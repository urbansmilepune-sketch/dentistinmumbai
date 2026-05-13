// Required environment variables:
//   NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY      — service-role key (server-only)
//   MSG91_AUTH_KEY                 — MSG91 auth key; without it notifyDentist() logs to stdout instead of sending
//   MSG91_BOOKING_TEMPLATE_ID      — MSG91 flow template id for the booking-notification message
//   MSG91_SENDER_ID                — DLT-registered 6-char header passed as `sender` in the flow body
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const reference_no = generateRef()

    const { data: dentist } = await supabase.from('dentists').select('name, phone, whatsapp, clinic_name').eq('id', dentist_id).single()

    let treatmentName = 'General Consultation'
    if (treatment_id) {
      const { data: treatment } = await supabase.from('treatments').select('name').eq('id', treatment_id).single()
      if (treatment) treatmentName = treatment.name
    }

    const { data, error } = await supabase.from('appointments')
      .insert({ dentist_id, patient_name, patient_phone, appt_date, time_slot, treatment_id: treatment_id || null, notes: notes || null, status: 'scheduled', reference_no })
      .select('id, reference_no').single()

    if (error) throw error

    if (dentist) {
      const dentistPhone = dentist.whatsapp || dentist.phone
      const formattedDate = new Date(appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      const message = `🦷 New Appointment — dentistinmumbai.in\n\nRef: ${reference_no}\nPatient: ${patient_name}\nPhone: ${patient_phone}\nTreatment: ${treatmentName}\nDate: ${formattedDate} at ${time_slot}${notes ? `\nNote: ${notes}` : ''}\n\nManage: dentistinmumbai.in/for-dentists/dashboard`
      if (dentistPhone) await notifyDentist(dentistPhone, message)
    }

    return NextResponse.json({ success: true, reference_no: data.reference_no, id: data.id })
  } catch (error: any) {
    console.error('Booking error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
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
