// Server-side appointment update for the dentist dashboard.
//
// Accepts two shapes of PATCH body:
//   { status: 'confirmed' | 'cancelled' }
//       — keeps the original side-effect-attached transition path,
//         firing the patient confirmation/cancellation email + SMS.
//   { patient_phone?, appt_date?, time_slot?, treatment_id?, notes?, status? }
//       — full edit from the dashboard's Edit Appointment modal. Any subset
//         of fields is honoured; unspecified fields are left alone. The
//         confirmation/cancellation side effects still fire if status flips
//         to one of those values as part of the edit.
//
// DB constraint allows status in pending/confirmed/completed/cancelled/no_show;
// the route validates against that full set rather than the narrow
// 'confirmed'/'cancelled' pair the route originally accepted.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'
import { sendAppointmentConfirmedToPatient, sendAppointmentCancelledToPatient } from '@/lib/email'
import { sendSMS } from '@/lib/sms'
import { autoCreateRecallForCompletedVisit } from '@/lib/recall'

const VALID_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const
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
  console.log('[appointments PATCH] called with status:', body?.status, 'id:', id)

  // Build the partial update payload from whichever fields the client sent.
  // Only fields explicitly present in the body are propagated; this lets the
  // same endpoint serve the narrow "flip status" use case and the full Edit
  // modal without one stomping on the other.
  const patch: Record<string, unknown> = {}
  let status: Status | null = null

  if (typeof body.status === 'string') {
    if (!(VALID_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({
        error: `Invalid status. Expected one of: ${VALID_STATUSES.join(', ')}`,
      }, { status: 400 })
    }
    status = body.status as Status
    patch.status = status
  }
  if (typeof body.patient_phone === 'string') patch.patient_phone = body.patient_phone.trim() || null
  if (typeof body.appt_date === 'string'    ) patch.appt_date     = body.appt_date
  if (typeof body.time_slot === 'string'    ) patch.time_slot     = body.time_slot
  if ('treatment_id' in body) {
    const t = body.treatment_id
    patch.treatment_id = typeof t === 'string' && t ? t : null
  }
  if ('notes' in body) {
    const n = body.notes
    patch.notes = typeof n === 'string' && n.trim() ? n.trim() : null
  }
  if ('location_id' in body) {
    // location_id can be deliberately cleared (== null) to reassign the
    // row back to "no specific branch", so we accept any string-or-null
    // shape here.
    const l = body.location_id
    patch.location_id = typeof l === 'string' && l ? l : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const db = admin()

  // Ownership re-check — service role bypasses RLS, so we verify in code that
  // the appointment belongs to the dentist behind the session before mutating
  // it. Without this check a dentist could PATCH /api/dentist/appointments/<id>
  // for any appointment in the DB just by knowing the id.
  const { data: appt, error: lookupErr } = await db
    .from('appointments')
    .select('id, dentist_id, patient_id, patient_name, patient_email, patient_phone, appt_date, time_slot, reference_no, status')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) {
    console.error('[dentist appointments PATCH] lookup failed', { id, error: lookupErr.message })
    return NextResponse.json({ error: 'Lookup failed', message: lookupErr.message }, { status: 500 })
  }
  if (!appt || appt.dentist_id !== owner.id) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }
  console.log('[appointments PATCH] patient_email:', appt?.patient_email, 'ref:', appt?.reference_no)

  const { data: updated, error: updateErr } = await db
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .select('*, treatments(name, icon)')
    .single()
  if (updateErr) {
    console.error('[dentist appointments PATCH] update failed', { id, patch, error: updateErr.message })
    return NextResponse.json({ error: 'Update failed', message: updateErr.message, code: updateErr.code }, { status: 500 })
  }

  // Side effects: confirmation OR cancellation email + SMS to the patient.
  // Fire-and-forget on both sides so a Resend/MSG91 hiccup can't 500 a
  // status change that already committed. Each notifier is gated on the
  // data it needs (email address / phone number) and its respective
  // template-id env var, so unconfigured environments stay silent. Only
  // fires when status transitions into confirmed/cancelled — pure date /
  // notes edits skip this block entirely.
  if (status === 'confirmed' || status === 'cancelled') {
    // Pull a wider dentist profile for the message body. We do this here
    // rather than in getDentistOwner so its return shape stays minimal for
    // callers that don't need every column.
    const { data: dentistFull } = await db
      .from('dentists')
      .select('name, clinic_name, address, phone, whatsapp, city')
      .eq('id', owner.id)
      .maybeSingle()

    const clinicName = dentistFull?.clinic_name || owner.clinic_name || 'the clinic'
    const clinicPhone = dentistFull?.phone || dentistFull?.whatsapp || null
    const citySlug = dentistFull?.city || owner.city || undefined
    // Use the post-update row so a rescheduling edit (e.g. change date +
    // flip to confirmed in one PATCH) emails the patient the NEW date/time,
    // not the stale pre-edit values.
    const formattedDate = new Date(updated.appt_date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
    const patientEmail = updated.patient_email
    const patientPhone = updated.patient_phone

    // IMPORTANT: each notification is AWAITED, not fire-and-forget. On Vercel
    // serverless the function exits the moment we return the response, killing
    // any in-flight Resend / MSG91 fetch. The PATCH route was previously
    // .catch()-ing without awaiting, which worked locally (Node process kept
    // running) but silently dropped every email in production. Awaiting adds
    // ~500ms to the response — acceptable for a button click, and the only
    // way to guarantee the send actually happens.
    if (status === 'confirmed') {
      if (patientEmail) {
        try {
          const result = await sendAppointmentConfirmedToPatient({
            to_email: patientEmail,
            patient_name: updated.patient_name || 'there',
            dentist_name: dentistFull?.name || owner.name || 'your dentist',
            clinic_name: clinicName,
            clinic_address: dentistFull?.address || null,
            clinic_phone: clinicPhone,
            appt_date: updated.appt_date,
            time_slot: updated.time_slot,
            reference_no: updated.reference_no,
            city: citySlug,
          })
          console.log('[appointments PATCH] confirmation email sent', {
            to: patientEmail, ref: updated.reference_no,
            id: (result as any)?.data?.id, error: (result as any)?.error,
          })
        } catch (err: any) {
          console.error('[appointments PATCH] confirmation email threw', {
            to: patientEmail, ref: updated.reference_no, message: err?.message,
          })
        }
      } else {
        console.log('[appointments PATCH] no patient_email on appointment — skipping confirmation email', { ref: updated.reference_no })
      }

      const confirmTpl = process.env.MSG91_TEMPLATE_ID_APPOINTMENT_CONFIRMED
      if (confirmTpl && patientPhone) {
        try {
          // DLT template: "Your Appointment confirmed at {clinic} on {date time} ..."
          const r = await sendSMS(patientPhone, confirmTpl, [
            clinicName, `${formattedDate} ${updated.time_slot}`,
          ])
          if (!r.success) console.error('[appointments PATCH] confirmation SMS failed', r)
        } catch (err) {
          console.error('[appointments PATCH] confirmation SMS threw', err)
        }
      }
    } else {
      if (patientEmail) {
        try {
          const result = await sendAppointmentCancelledToPatient({
            to_email: patientEmail,
            patient_name: updated.patient_name || 'there',
            clinic_name: clinicName,
            clinic_phone: clinicPhone,
            appt_date: updated.appt_date,
            time_slot: updated.time_slot,
            reference_no: updated.reference_no,
            city: citySlug,
          })
          console.log('[appointments PATCH] cancellation email sent', {
            to: patientEmail, ref: updated.reference_no,
            id: (result as any)?.data?.id, error: (result as any)?.error,
          })
        } catch (err: any) {
          console.error('[appointments PATCH] cancellation email threw', {
            to: patientEmail, ref: updated.reference_no, message: err?.message,
          })
        }
      }

      const cancelTpl = process.env.MSG91_TEMPLATE_ID_APPOINTMENT_CANCELLED
      if (cancelTpl && patientPhone) {
        try {
          // DLT template body has a typo ("on cancelled") and only renders the
          // clinic name — there is no {date time} placeholder, so we send a
          // single variable. Re-registering a fixed template body would unblock
          // a second var; until then, only clinicName is passed.
          const r = await sendSMS(patientPhone, cancelTpl, [clinicName])
          if (!r.success) console.error('[appointments PATCH] cancellation SMS failed', r)
        } catch (err) {
          console.error('[appointments PATCH] cancellation SMS threw', err)
        }
      }
    }
  }

  // Side effect: when the visit is closed out as 'completed', schedule a
  // 6-month recall for the patient. We try to resolve a patient_id from
  // the appointment row directly; manual walk-ins without one fall back to
  // a phone-number match against the dentist's patient list. If neither
  // yields a patient we silently skip — the dashboard's "Schedule Recall"
  // button on the patient profile is still available as a manual escape
  // hatch. The recall helper itself dedupes on (patient_id, type) so a
  // re-completion or back-to-back visits don't stack duplicate recalls.
  let recall: { id: string; due_date: string } | null = null
  if (status === 'completed') {
    // appt is the pre-update row from the ownership lookup; patient_id is
    // selected explicitly above. Narrow off the inferred type instead of
    // reaching for `any`.
    let pid: string | null = (appt as { patient_id: string | null }).patient_id ?? null
    if (!pid && updated.patient_phone) {
      const phoneDigits = String(updated.patient_phone).replace(/\D/g, '')
      if (phoneDigits.length >= 4) {
        const tail = phoneDigits.slice(-10)
        const { data: matchedPatient } = await db
          .from('patients')
          .select('id, phone')
          .eq('dentist_id', owner.id)
          .ilike('phone', `%${tail}`)
          .limit(1)
          .maybeSingle()
        if (matchedPatient?.id) pid = matchedPatient.id
      }
    }
    if (pid) {
      recall = await autoCreateRecallForCompletedVisit({
        db,
        dentist_id: owner.id,
        patient_id: pid,
        visit_date: updated.appt_date,
      })
    }
  }

  return NextResponse.json({ success: true, status: updated.status, appointment: updated, recall })
}
