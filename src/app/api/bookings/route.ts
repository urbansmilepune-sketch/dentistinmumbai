// Required environment variables:
//   NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY      — service-role key (server-only)
//   MSG91_AUTH_KEY                 — MSG91 auth key (see src/lib/sms.ts)
//   MSG91_SENDER_ID                — DLT-registered 6-char header (e.g. DNTPRM)
//   MSG91_TEMPLATE_ID_BOOKING_PATIENT, MSG91_TEMPLATE_ID_BOOKING_DENTIST
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCityBySlug } from '@/config/cities'
import {
  sendBookingRequestToPatient,
  sendBookingRequestToDentist,
} from '@/lib/email'
import { sendSMS } from '@/lib/sms'

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { dentist_id, patient_name, patient_phone, patient_email, appt_date, time_slot, treatment_id, notes, location_id } = body

    if (!dentist_id || !patient_name || !patient_phone || !appt_date || !time_slot) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // location_id is optional. When present, the clash check below scopes
    // to that single branch so two patients can hold 10 AM at two different
    // branches. When absent (single-branch dentist or legacy caller), the
    // historical dentist-wide clash check still runs.
    const normalizedLocationId: string | null = typeof location_id === 'string' && location_id.trim()
      ? location_id.trim()
      : null

    // Email is optional. We accept null/empty, but if the patient typed
    // something, run a basic shape check so we don't pollute the column with
    // obvious junk (the client already validates this, but the server is the
    // source of truth — direct API callers bypass the form).
    const normalizedEmail: string | null = typeof patient_email === 'string' && patient_email.trim()
      ? patient_email.trim()
      : null
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
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
    let clashQuery = supabase
      .from('appointments')
      .select('id')
      .eq('dentist_id', dentist_id)
      .eq('appt_date', appt_date)
      .eq('time_slot', time_slot)
      .neq('status', 'cancelled')
    if (normalizedLocationId) clashQuery = clashQuery.eq('location_id', normalizedLocationId)
    const { data: clash, error: clashErr } = await clashQuery.maybeSingle()
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
      .from('dentists').select('name, phone, whatsapp, clinic_name, address, city, email').eq('id', dentist_id).single()
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

    // Find-or-create the patient record so the Patients tab in the dashboard
    // includes everyone who books with this dentist. Without this, online
    // bookings live only in appointments and the Patients tab reads empty
    // even when the clinic has dozens of patients on the books. Match by
    // dentist_id + phone-digit tail so "+91 98xxxx" and "98xxxx" resolve
    // to the same row. Service role bypasses RLS, so the insert can't be
    // refused by a missing policy.
    const phoneDigits = String(patient_phone || '').replace(/\D/g, '')
    let resolvedPatientId: string | null = null
    if (phoneDigits.length >= 4) {
      const tail = phoneDigits.slice(-10)
      const { data: existingPatient } = await supabase
        .from('patients')
        .select('id')
        .eq('dentist_id', dentist_id)
        .ilike('phone', `%${tail}`)
        .limit(1)
        .maybeSingle()
      if (existingPatient?.id) {
        resolvedPatientId = existingPatient.id
      } else {
        const { data: createdPatient, error: createPatientErr } = await supabase
          .from('patients')
          .insert({
            dentist_id,
            name: patient_name,
            phone: patient_phone,
            email: normalizedEmail,
          })
          .select('id')
          .maybeSingle()
        if (createPatientErr) {
          // Don't fail the booking on a patient-row hiccup — the appointment
          // is the user-visible side of this request, and the dashboard's
          // phone-based lookup will still resolve buttons that key off
          // patient_phone. Log and continue.
          console.error('[bookings] patient auto-create failed', {
            dentist_id, phone: patient_phone,
            code: createPatientErr.code, message: createPatientErr.message,
          })
        } else if (createdPatient?.id) {
          resolvedPatientId = createdPatient.id
        }
      }
    }

    const insertPayload = {
      dentist_id,
      // Link to the patient row when we have one. The dashboard's Open
      // Patient File button keys off this column; pre-link makes it work
      // immediately without a phone-fallback lookup.
      patient_id: resolvedPatientId,
      patient_name,
      patient_phone,
      patient_email: normalizedEmail,
      appt_date,
      time_slot,
      treatment_id: treatment_id || null,
      notes: notes || null,
      location_id: normalizedLocationId,
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
      const formattedDate = new Date(appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      const cityCfg = getCityBySlug((dentist as any).city)

      // Emails AWAITED (not fire-and-forget). On Vercel serverless the
      // function exits the moment the response is returned, terminating any
      // in-flight Resend fetch and silently dropping the email. The row is
      // already committed, so wrap each send in try/catch — a Resend hiccup
      // must not 500 the response. Adding ~500ms per call is the price of
      // making sure the patient and dentist actually get notified.
      const dentistName = dentist.name || 'the dentist'
      const clinicName = dentist.clinic_name || `${cityCfg.cityName} clinic`
      const clinicPhone = dentist.phone || dentist.whatsapp || null
      const citySlug = (dentist as any).city || undefined
      if (normalizedEmail) {
        try {
          const result = await sendBookingRequestToPatient({
            to_email: normalizedEmail,
            patient_name,
            dentist_name: dentistName,
            clinic_name: clinicName,
            clinic_phone: clinicPhone,
            appt_date,
            time_slot,
            reference_no,
            city: citySlug,
          })
          console.log('[bookings] patient ack email sent', {
            to: normalizedEmail, ref: reference_no,
            id: (result as any)?.data?.id, error: (result as any)?.error,
          })
        } catch (err: any) {
          console.error('[bookings] patient ack email threw', {
            to: normalizedEmail, ref: reference_no, message: err?.message,
          })
        }
      }
      if ((dentist as any).email) {
        try {
          const result = await sendBookingRequestToDentist({
            to_email: (dentist as any).email,
            dentist_name: dentistName,
            patient_name,
            patient_phone,
            appt_date,
            time_slot,
            treatment_name: treatmentName,
            reference_no,
            city: citySlug,
          })
          console.log('[bookings] dentist new-request email sent', {
            to: (dentist as any).email, ref: reference_no,
            id: (result as any)?.data?.id, error: (result as any)?.error,
          })
        } catch (err: any) {
          console.error('[bookings] dentist new-request email threw', {
            to: (dentist as any).email, ref: reference_no, message: err?.message,
          })
        }
      }

      // SMS via MSG91 — AWAITED for the same reason the emails are: on Vercel
      // serverless the function exits the instant the response returns, so a
      // fire-and-forget fetch gets terminated mid-flight and the SMS never
      // leaves. The DLT-approved templates (BOOKING_PATIENT, BOOKING_DENTIST)
      // take two vars: a label (clinic or patient name) and a single
      // "{date time}" string, so the date and slot are concatenated.
      const dateTime = `${formattedDate} ${time_slot}`
      const patientTpl = process.env.MSG91_TEMPLATE_ID_BOOKING_PATIENT
      if (patientTpl && patient_phone) {
        console.log('[bookings] patient SMS attempt', {
          phone: patient_phone,
          templateId: patientTpl,
          patient: patient_name,
        })
        try {
          const r = await sendSMS(patient_phone, patientTpl, [clinicName, dateTime])
          if (!r.success) console.error('[bookings] patient SMS failed', r)
        } catch (err: any) {
          console.error('[bookings] patient SMS threw', { message: err?.message })
        }
      }

      const dentistTpl = process.env.MSG91_TEMPLATE_ID_BOOKING_DENTIST
      const dentistSmsPhone = dentist.phone || dentist.whatsapp
      if (dentistTpl && dentistSmsPhone) {
        console.log('[bookings] dentist SMS attempt', {
          phone: dentistSmsPhone,
          templateId: process.env.MSG91_TEMPLATE_ID_BOOKING_DENTIST,
          patient: patient_name,
        })
        try {
          const r = await sendSMS(dentistSmsPhone, dentistTpl, [patient_name, dateTime])
          if (!r.success) console.error('[bookings] dentist SMS failed', r)
        } catch (err: any) {
          console.error('[bookings] dentist SMS threw', { message: err?.message })
        }
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
