// POST /api/dentist/review-requests — "Ask for review" from the dashboard.
// Body: { appointment_id } or { patient_name, patient_phone? }
//
// Creates (or reuses, for an appointment) a review link and returns a
// ready-to-send WhatsApp message. The dentist sends it from their own
// WhatsApp, so this works without any approved template.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { createReviewRequest, firstName, reviewLink } from '@/lib/reviewRequests'
import { whatsappLink } from '@/lib/phone'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const dentist = await resolveCurrentDentist<{ id: string; name: string | null; clinic_name: string | null; city: string | null }>(
    supabase, 'id, name, clinic_name, city',
  )
  if (!dentist) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as any
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  let patientName = typeof body.patient_name === 'string' ? body.patient_name.trim().slice(0, 80) : ''
  let patientPhone = typeof body.patient_phone === 'string' ? body.patient_phone.trim().slice(0, 20) : ''
  let appointmentId: string | null = null
  let treatment: string | null = null
  let visitDate: string | null = null

  if (typeof body.appointment_id === 'string' && body.appointment_id) {
    const { data: appt, error } = await db
      .from('appointments')
      .select('id, dentist_id, patient_name, patient_phone, appt_date, status, treatments(name)')
      .eq('id', body.appointment_id)
      .maybeSingle()
    if (error) {
      console.error('[review-requests] appointment lookup failed', error.message)
      return NextResponse.json({ error: 'Could not create the link. Please try again.' }, { status: 500 })
    }
    if (!appt || appt.dentist_id !== dentist.id) {
      return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })
    }
    if (appt.status !== 'completed') {
      return NextResponse.json({ error: 'Mark the visit Done first.' }, { status: 400 })
    }
    appointmentId = appt.id
    patientName = appt.patient_name || patientName
    patientPhone = appt.patient_phone || patientPhone
    visitDate = appt.appt_date
    treatment = (Array.isArray(appt.treatments) ? appt.treatments[0] : appt.treatments as any)?.name ?? null
  }

  if (!patientName) return NextResponse.json({ error: 'Enter the patient name.' }, { status: 400 })

  const created = await createReviewRequest(db, {
    dentist_id: dentist.id,
    appointment_id: appointmentId,
    patient_name: patientName,
    patient_phone: patientPhone || null,
    treatment,
    visit_date: visitDate,
    source: 'manual',
  })
  if (!created) return NextResponse.json({ error: 'Could not create the link. Please try again.' }, { status: 500 })

  // An auto request reused here is now being sent by hand: stop the cron
  // from sending it again.
  if (created.existed) {
    await db.from('review_requests')
      .update({ sent_at: new Date().toISOString(), send_channel: 'manual' })
      .eq('id', created.id)
      .is('sent_at', null)
  }

  const link = reviewLink(dentist.city, created.token)
  const clinic = dentist.clinic_name || dentist.name || 'our clinic'
  const message =
    `Hi ${firstName(patientName)}, thank you for visiting ${clinic}. ` +
    `How was your visit? Please rate it here, it takes 30 seconds: ${link}`
  const waUrl = whatsappLink(patientPhone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`

  return NextResponse.json({ success: true, link, message, waUrl })
}
