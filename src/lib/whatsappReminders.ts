// WhatsApp appointment reminders: 3 hours before and 30 minutes before.
//
// Sent to both the patient and the dentist.
// Runs every 5 minutes from /api/cron/whatsapp-reminders. Each run looks at
// today's and tomorrow's (IST) pending/confirmed appointments and sends:
//   • the 3-hour reminder when the appointment is 30 min – 3 h away
//   • the 30-minute reminder when it is 0 – 30 min away
// An appointment booked less than 3 h ahead gets the 3-hour reminder on the
// next run (unless it's already inside 30 min, then only the 30-min one).
//
// Double-send protection: before sending, a message_log row is inserted for
// (appointment_id, message_type). If that row already exists, or the insert
// fails for any reason, nothing is sent. So a missing table or a DB hiccup
// means "no reminder", never "a reminder every 5 minutes".

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendReminderWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'

const IST_OFFSET_MIN = 330

type Kind = { type: 'wa_reminder_3h' | 'wa_reminder_30m'; label: string; minExclusive: number; maxInclusive: number }
const KINDS: Kind[] = [
  { type: 'wa_reminder_3h', label: 'WhatsApp reminder (3 hours before)', minExclusive: 30, maxInclusive: 180 },
  { type: 'wa_reminder_30m', label: 'WhatsApp reminder (30 minutes before)', minExclusive: 0, maxInclusive: 30 },
]

function istDate(offsetDays: number): string {
  const now = new Date(Date.now() + IST_OFFSET_MIN * 60000)
  now.setUTCDate(now.getUTCDate() + offsetDays)
  return now.toISOString().slice(0, 10)
}

/** appt_date "2026-11-05" + time_slot "14:30" (or "2:30 PM") in IST → epoch ms. */
export function apptEpochMs(apptDate: string, slot: string | null): number | null {
  if (!slot) return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(slot.trim())
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ap = m[3]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  const [y, mo, d] = apptDate.split('-').map(Number)
  if (!y || !mo || !d) return null
  return Date.UTC(y, mo - 1, d, h, min) - IST_OFFSET_MIN * 60000
}

interface Row {
  id: string
  dentist_id: string
  patient_id: string | null
  patient_name: string | null
  patient_phone: string | null
  appt_date: string
  time_slot: string | null
  dentists: { clinic_name: string | null; phone: string | null; whatsapp: string | null; name: string | null } | null
  clinic_locations: { clinic_name: string | null; phone: string | null } | null
}

export interface WhatsAppReminderResult {
  enabled: boolean
  checked: number
  sent: number
  failed: number
  skipped: number
  errors: string[]
}

export async function runWhatsAppReminders(): Promise<WhatsAppReminderResult> {
  const result: WhatsAppReminderResult = { enabled: whatsAppEnabled(), checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] }
  if (!result.enabled) return result
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    result.errors.push('supabase env vars missing')
    return result
  }
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data, error } = await db
    .from('appointments')
    .select(`
      id, dentist_id, patient_id, patient_name, patient_phone, appt_date, time_slot,
      dentists(clinic_name, phone, whatsapp, name),
      clinic_locations(clinic_name, phone)
    `)
    .in('appt_date', [istDate(0), istDate(1)])
    .in('status', ['confirmed', 'pending'])
    .not('patient_phone', 'is', null)
  if (error) {
    result.errors.push(`query failed: ${error.message}`)
    return result
  }

  const now = Date.now()
  for (const a of (data ?? []) as unknown as Row[]) {
    const at = apptEpochMs(a.appt_date, a.time_slot)
    if (at === null || !a.patient_phone) continue
    const minsAway = (at - now) / 60000
    const kind = KINDS.find(k => minsAway > k.minExclusive && minsAway <= k.maxInclusive)
    if (!kind) continue
    result.checked++

    const clinicName = a.clinic_locations?.clinic_name || a.dentists?.clinic_name || a.dentists?.name || 'our clinic'
    const clinicPhone = a.clinic_locations?.phone || a.dentists?.phone || a.dentists?.whatsapp || ''
    const dentistPhone = a.dentists?.whatsapp || a.dentists?.phone || null
    // Same template, same values, to the patient and to the dentist.
    const recipients: { who: 'patient' | 'dentist'; phone: string | null }[] = [
      { who: 'patient', phone: a.patient_phone },
      { who: 'dentist', phone: dentistPhone },
    ]

    for (const rcpt of recipients) {
      if (!rcpt.phone) continue
      const messageType = rcpt.who === 'patient' ? kind.type : `${kind.type}_dentist`

      // Claim the send. Skip if already sent or the log is unavailable.
      const { data: existing, error: existErr } = await db
        .from('message_log').select('id').eq('appointment_id', a.id).eq('message_type', messageType).limit(1)
      if (existErr) { result.skipped++; result.errors.push(`log read failed: ${existErr.message}`); continue }
      if (existing && existing.length > 0) { result.skipped++; continue }

      const { data: claim, error: claimErr } = await db.from('message_log').insert({
        dentist_id: a.dentist_id,
        patient_id: a.patient_id,
        appointment_id: a.id,
        message_type: messageType,
        channel: 'whatsapp',
        message_content: `${kind.label} to ${rcpt.who}`,
        status: 'sending',
      }).select('id').single()
      if (claimErr || !claim) {
        result.skipped++
        result.errors.push(`log insert failed: ${claimErr?.message ?? 'no row'}`)
        continue
      }

      const r = await sendReminderWhatsApp({
        patientPhone: rcpt.phone,
        patientName: (a.patient_name || 'there').split(/\s+/)[0],
        clinicName,
        apptDate: a.appt_date,
        timeSlot: a.time_slot || '',
        clinicPhone,
      })
      if (r.success) result.sent++
      else { result.failed++; console.error('[wa-reminders] send failed', { appt_id: a.id, to: rcpt.who, kind: kind.type, error: r.error }) }
      // A failed send is not retried (row stays, marked failed) so a bad number can't loop.
      await db.from('message_log').update({ status: r.success ? 'sent' : 'failed' }).eq('id', claim.id)
    }
  }
  return result
}
