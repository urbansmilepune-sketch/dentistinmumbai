// POST /api/patient/appointments — lets a signed-in patient move or cancel one
// of their own upcoming appointments from the patient app.
//
// Body: { patient_id, appointment_id, action: 'cancel' | 'reschedule',
//         appt_date?: 'YYYY-MM-DD', time_slot?: 'HH:MM' }
//
// Security mirrors /api/patient/data: the portal token proves phone
// ownership, then we re-load the patient row (phone must match, portal access
// still on) and the appointment (must belong to that patient and clinic, be
// pending/confirmed and not in the past). A moved appointment goes back to
// 'pending' so the clinic confirms the new time. The clinic gets an email.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPatientToken, phoneTail10, bearerFromRequest } from '@/lib/patientPortal'
import { guardRequest } from '@/lib/apiGuards'
import { addDaysIso, freeSlots, normaliseSlot, nowInIndia, RESCHEDULE_DAYS_AHEAD, slotLabel } from '@/lib/clinicSlots'
import { sendPatientChangedAppointmentToDentist } from '@/lib/email'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const limited = guardRequest(request, 'patient-appointments', {
    max: 20,
    windowMs: 60 * 60 * 1000,
    message: 'Too many changes from this connection. Please call the clinic.',
  })
  if (limited) return limited

  const token = bearerFromRequest(request)
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const claims = await verifyPatientToken(token)
  if (!claims) return NextResponse.json({ error: 'Session expired — please log in again.' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const patientId = typeof body?.patient_id === 'string' ? body.patient_id : ''
  const apptId = typeof body?.appointment_id === 'string' ? body.appointment_id : ''
  const action = body?.action
  if (!patientId || !apptId || (action !== 'cancel' && action !== 'reschedule')) {
    return NextResponse.json({ error: 'Missing details' }, { status: 400 })
  }

  const db = admin()

  const { data: patient } = await db
    .from('patients')
    .select('id, name, phone, dentist_id, portal_access, dentist:dentists(id, name, email, city, working_hours)')
    .eq('id', patientId)
    .maybeSingle()
  if (!patient || phoneTail10((patient as any).phone) !== claims.phone) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }
  if (!(patient as any).portal_access) {
    return NextResponse.json({ error: 'Portal access for this record has been turned off by your clinic.' }, { status: 403 })
  }
  const dentistId = (patient as any).dentist_id

  const { data: appt } = await db
    .from('appointments')
    .select('id, patient_id, dentist_id, appt_date, time_slot, status, reference_no, location_id')
    .eq('id', apptId)
    .maybeSingle()
  if (!appt || appt.patient_id !== patientId || appt.dentist_id !== dentistId) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }
  const today = nowInIndia().iso
  if (!['pending', 'confirmed'].includes(appt.status) || String(appt.appt_date) < today) {
    return NextResponse.json({ error: 'This appointment can no longer be changed online. Please call the clinic.' }, { status: 409 })
  }

  const dentist = (patient as any).dentist || {}
  const notify = async (extra: { new_date?: string; new_time?: string }) => {
    if (!dentist.email) return
    try {
      await sendPatientChangedAppointmentToDentist({
        to_email: dentist.email,
        dentist_name: dentist.name || 'Doctor',
        patient_name: (patient as any).name || 'Patient',
        patient_phone: (patient as any).phone || '',
        action: action === 'cancel' ? 'cancelled' : 'rescheduled',
        old_date: appt.appt_date,
        old_time: slotLabel(appt.time_slot),
        new_date: extra.new_date,
        new_time: extra.new_time ? slotLabel(extra.new_time) : undefined,
        reference_no: appt.reference_no,
        city: dentist.city,
      })
    } catch (err: any) {
      console.error('[patient/appointments] clinic email failed', err?.message)
    }
  }

  if (action === 'cancel') {
    const { error } = await db.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id)
    if (error) {
      console.error('[patient/appointments] cancel failed', error.message)
      return NextResponse.json({ error: 'Could not cancel. Please call the clinic.' }, { status: 500 })
    }
    await notify({})
    return NextResponse.json({ success: true })
  }

  // Reschedule: re-check the new slot against the clinic's hours and bookings.
  const newDate = typeof body?.appt_date === 'string' ? body.appt_date : ''
  const newSlot = normaliseSlot(body?.time_slot)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !newSlot) {
    return NextResponse.json({ error: 'Pick a day and time.' }, { status: 400 })
  }
  if (newDate < today || newDate > addDaysIso(today, RESCHEDULE_DAYS_AHEAD)) {
    return NextResponse.json({ error: `Pick a day in the next ${RESCHEDULE_DAYS_AHEAD} days.` }, { status: 400 })
  }

  let hours = dentist.working_hours ?? null
  if (appt.location_id) {
    const { data: loc } = await db.from('clinic_locations').select('working_hours').eq('id', appt.location_id).maybeSingle()
    if (loc?.working_hours) hours = loc.working_hours
  }

  let bookedQ = db.from('appointments')
    .select('id, time_slot')
    .eq('dentist_id', dentistId)
    .eq('appt_date', newDate)
    .neq('status', 'cancelled')
    .neq('id', appt.id)
  if (appt.location_id) bookedQ = bookedQ.eq('location_id', appt.location_id)
  const { data: booked, error: bookedErr } = await bookedQ
  if (bookedErr) {
    console.error('[patient/appointments] slot lookup failed', bookedErr.message)
    return NextResponse.json({ error: 'Could not check free times. Please try again.' }, { status: 500 })
  }
  const free = freeSlots(hours, newDate, (booked || []).map((b: any) => b.time_slot))
  if (!free || !free.includes(newSlot)) {
    return NextResponse.json({ error: 'That time is no longer free. Please pick another.' }, { status: 409 })
  }

  const { error } = await db.from('appointments')
    .update({ appt_date: newDate, time_slot: newSlot, status: 'pending' })
    .eq('id', appt.id)
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That time was just taken. Please pick another.' }, { status: 409 })
    }
    console.error('[patient/appointments] reschedule failed', error.message)
    return NextResponse.json({ error: 'Could not move the appointment. Please call the clinic.' }, { status: 500 })
  }
  await notify({ new_date: newDate, new_time: newSlot })
  return NextResponse.json({ success: true, appt_date: newDate, time_slot: newSlot })
}
