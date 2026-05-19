// Server-side appointment status update for the dentist dashboard.
//
// Previously the dashboard appointments page wrote the new status directly via
// the user's RLS-aware supabase client. That works for the UI but leaves no
// place to attach side effects — e.g. firing a confirmation email to the
// patient when the dentist flips a row from `pending` to `confirmed`. Routing
// confirm/decline through this endpoint gives us that hook.
//
// Scope is intentionally narrow: accepts only 'confirmed' or 'cancelled'.
// Other transitions (mark-completed, no-show, back-to-pending) still go
// through the direct supabase update on the page; if those grow side effects
// later, expand this route accordingly.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'
import { sendAppointmentConfirmedToPatient } from '@/lib/email'

const VALID_STATUSES = ['confirmed', 'cancelled'] as const
type Status = typeof VALID_STATUSES[number]

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing appointment id' }, { status: 400 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const status = body?.status as unknown
  if (typeof status !== 'string' || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({
      error: `Invalid status. Expected one of: ${VALID_STATUSES.join(', ')}`,
    }, { status: 400 })
  }

  const db = admin()

  // Ownership re-check — service role bypasses RLS, so we verify in code that
  // the appointment belongs to the dentist behind the session before mutating
  // it. Without this check a dentist could PATCH /api/dentist/appointments/<id>
  // for any appointment in the DB just by knowing the id.
  const { data: appt, error: lookupErr } = await db
    .from('appointments')
    .select('id, dentist_id, patient_name, patient_email, appt_date, time_slot, reference_no, status')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) {
    console.error('[dentist appointments PATCH] lookup failed', { id, error: lookupErr.message })
    return NextResponse.json({ error: 'Lookup failed', message: lookupErr.message }, { status: 500 })
  }
  if (!appt || appt.dentist_id !== owner.id) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  const { error: updateErr } = await db
    .from('appointments')
    .update({ status })
    .eq('id', id)
  if (updateErr) {
    console.error('[dentist appointments PATCH] update failed', { id, status, error: updateErr.message })
    return NextResponse.json({ error: 'Update failed', message: updateErr.message, code: updateErr.code }, { status: 500 })
  }

  // Side effect: confirmation email to the patient. Only when the new state
  // is `confirmed`, only when the patient actually gave us an email at
  // booking time, and only fire-and-forget so a Resend hiccup can't 500
  // a status change that already committed.
  if ((status as Status) === 'confirmed' && appt.patient_email) {
    // Pull a wider dentist profile for the email body. We do this here rather
    // than in getDentistOwner so its return shape stays minimal for callers
    // that don't need every column.
    const { data: dentistFull } = await db
      .from('dentists')
      .select('name, clinic_name, address, phone, whatsapp, city')
      .eq('id', owner.id)
      .maybeSingle()

    sendAppointmentConfirmedToPatient({
      to_email: appt.patient_email,
      patient_name: appt.patient_name || 'there',
      dentist_name: dentistFull?.name || owner.name || 'your dentist',
      clinic_name: dentistFull?.clinic_name || owner.clinic_name || 'the clinic',
      clinic_address: dentistFull?.address || null,
      clinic_phone: dentistFull?.phone || dentistFull?.whatsapp || null,
      appt_date: appt.appt_date,
      time_slot: appt.time_slot,
      reference_no: appt.reference_no,
      city: dentistFull?.city || owner.city || undefined,
    }).catch(err => console.error('[dentist appointments PATCH] patient confirmation email failed', err))
  }

  return NextResponse.json({ success: true, status })
}
