// Called by the dashboard right after a dentist (or their staff) adds an
// appointment themselves. Sends the patient the WhatsApp
// appointment_confirmation ("Your Appointment confirmed at {clinic} on
// {date}, {time}"). The dentist gets nothing, since they made the booking.
//
// Sent at most once per appointment: a message_log row is claimed before
// sending, and if that claim fails nothing is sent. 3-hour / 30-minute
// reminders for these appointments come from /api/cron/whatsapp-reminders.
import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { sendConfirmationWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'

const MESSAGE_TYPE = 'wa_added_by_dentist'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userClient = await createUserClient()
  const current = await resolveCurrentDentist<{ id: string; clinic_name: string | null; name: string | null }>(
    userClient, 'id, clinic_name, name',
  )
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!whatsAppEnabled()) return NextResponse.json({ sent: false, reason: 'whatsapp disabled' })

  const { id } = await ctx.params
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: appt, error } = await db
    .from('appointments')
    .select('id, dentist_id, patient_id, patient_phone, appt_date, time_slot, status, clinic_locations(clinic_name)')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!appt || appt.dentist_id !== current.id) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  if (!appt.patient_phone || !['pending', 'confirmed'].includes(appt.status)) {
    return NextResponse.json({ sent: false, reason: 'no phone or not an upcoming appointment' })
  }

  const { data: existing, error: exErr } = await db
    .from('message_log').select('id').eq('appointment_id', id).eq('message_type', MESSAGE_TYPE).limit(1)
  if (exErr) return NextResponse.json({ sent: false, reason: `log read failed: ${exErr.message}` })
  if (existing && existing.length > 0) return NextResponse.json({ sent: false, reason: 'already sent' })

  const { data: claim, error: claimErr } = await db.from('message_log').insert({
    dentist_id: appt.dentist_id,
    patient_id: appt.patient_id,
    appointment_id: id,
    message_type: MESSAGE_TYPE,
    channel: 'whatsapp',
    message_content: 'WhatsApp appointment confirmation (added by dentist)',
    status: 'sending',
  }).select('id').single()
  if (claimErr || !claim) return NextResponse.json({ sent: false, reason: `log insert failed: ${claimErr?.message}` })

  const loc = appt.clinic_locations as unknown as { clinic_name: string | null } | null
  const clinicName = loc?.clinic_name || current.clinic_name || current.name || 'the clinic'
  const r = await sendConfirmationWhatsApp({
    patientPhone: appt.patient_phone, clinicName, apptDate: appt.appt_date, timeSlot: appt.time_slot || '',
  })
  await db.from('message_log').update({ status: r.success ? 'sent' : 'failed' }).eq('id', claim.id)
  return NextResponse.json({ sent: r.success, ...(r.success ? {} : { reason: r.error }) })
}
