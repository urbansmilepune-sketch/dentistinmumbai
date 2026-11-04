// Shared SMS-reminder logic used by both cron endpoints.
//
// /api/cron/appointment-reminders         → kind: 'day_before' (runs 6PM IST)
// /api/cron/appointment-reminders-morning → kind: 'day_of'     (runs 8AM IST)
//
// The cron handlers themselves only deal with Bearer auth and shaping the
// JSON response. All MSG91 wiring, date math, and per-appointment loop
// lives here so the two endpoints stay byte-for-byte identical in
// behaviour and a fix to one helps both.
//
// Required env:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY                    — cron bypasses RLS
//   MSG91_AUTH_KEY, MSG91_SENDER_ID              — see src/lib/sms.ts
//   MSG91_TEMPLATE_ID_REMINDER_DAY_BEFORE        — DLT template for the
//                                                  day-before reminder
//   MSG91_TEMPLATE_ID_REMINDER_DAY_OF            — DLT template for the
//                                                  morning-of reminder
//
// If a template id env var is missing the helper logs and skips that kind
// of reminder — same no-op behaviour as the rest of the MSG91 layer when
// the account isn't configured.

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'

const IST_TZ = 'Asia/Kolkata'

/** Today (or tomorrow) in IST as YYYY-MM-DD — matches the `date` shape on
 *  appointments.appt_date so a direct .eq() filter lines up without any
 *  timezone gymnastics in the query. */
function istDateOffset(daysFromToday: number): string {
  const now = new Date()
  // Render in IST first, then shift the resulting calendar date. en-CA gives
  // YYYY-MM-DD which is what Postgres `date` columns expect.
  const istToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  if (daysFromToday === 0) return istToday
  const [y, m, d] = istToday.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + daysFromToday))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function formatTimeLabel(slot: string | null | undefined): string {
  if (!slot) return ''
  const [hStr, mStr] = slot.split(':')
  const h = Number(hStr); const m = Number(mStr)
  if (!Number.isFinite(h)) return slot
  const hour12 = ((h + 11) % 12) + 1
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

export type ReminderKind = 'day_before' | 'day_of'

export interface ReminderRunResult {
  kind: ReminderKind
  targetDate: string
  eligible: number
  sent: number
  failures: number
  skipped: { reason: string; count: number }[]
}

interface ApptRow {
  id: string
  patient_name: string | null
  patient_phone: string | null
  reference_no: string | null
  appt_date: string
  time_slot: string | null
  status: string
  location_id: string | null
  dentists: { clinic_name: string | null; phone: string | null; whatsapp: string | null; name: string | null } | null
  clinic_locations: { clinic_name: string | null; phone: string | null } | null
}

export async function runAppointmentReminders(kind: ReminderKind): Promise<ReminderRunResult> {
  const templateId = kind === 'day_before'
    ? process.env.MSG91_TEMPLATE_ID_REMINDER_DAY_BEFORE
    : process.env.MSG91_TEMPLATE_ID_REMINDER_DAY_OF

  // day_before runs 6PM IST and targets tomorrow's roster; day_of runs 8AM
  // IST and targets today's. Same query shape for both, only the date
  // anchor differs.
  const targetDate = istDateOffset(kind === 'day_before' ? 1 : 0)

  const result: ReminderRunResult = {
    kind, targetDate, eligible: 0, sent: 0, failures: 0, skipped: [],
  }
  function addSkip(reason: string) {
    const existing = result.skipped.find(s => s.reason === reason)
    if (existing) existing.count++
    else result.skipped.push({ reason, count: 1 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    addSkip('supabase env vars missing')
    return result
  }
  if (!templateId) {
    addSkip(`MSG91_TEMPLATE_ID_REMINDER_${kind.toUpperCase()} env var not set`)
    return result
  }

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const { data, error } = await db
    .from('appointments')
    .select(`
      id, patient_name, patient_phone, reference_no, appt_date, time_slot, status, location_id,
      dentists(clinic_name, phone, whatsapp, name),
      clinic_locations(clinic_name, phone)
    `)
    .eq('appt_date', targetDate)
    .in('status', ['confirmed', 'pending'])
    .not('patient_phone', 'is', null)

  if (error) {
    console.error('[reminders] appointments query failed', { kind, targetDate, error: error.message })
    addSkip(`query failed: ${error.message}`)
    return result
  }

  const rows = (data ?? []) as unknown as ApptRow[]
  result.eligible = rows.length
  if (rows.length === 0) return result

  for (const a of rows) {
    if (!a.patient_phone) { addSkip('no patient_phone'); continue }
    // Branch overrides the dentist defaults when the appointment was booked
    // for a specific clinic_location — important for multi-branch dentists
    // so the SMS names the right clinic and the right reschedule line.
    const clinicName = a.clinic_locations?.clinic_name || a.dentists?.clinic_name || a.dentists?.name || 'our clinic'
    const clinicPhone = a.clinic_locations?.phone || a.dentists?.phone || a.dentists?.whatsapp || ''
    const patientFirstName = (a.patient_name || 'there').split(/\s+/)[0]
    const timeLabel = formatTimeLabel(a.time_slot)

    // Variables map onto the DLT templates positionally. Both templates
    // share the first three vars (name, clinic, time); day_before adds
    // ref + phone so the patient can reschedule.
    //   day_before: var1 name, var2 clinic, var3 time, var4 ref, var5 phone
    //   day_of:     var1 name, var2 clinic, var3 time
    const variables: string[] = kind === 'day_before'
      ? [patientFirstName, clinicName, timeLabel, a.reference_no || '', clinicPhone]
      : [patientFirstName, clinicName, timeLabel]

    try {
      const r = await sendSMS(a.patient_phone, templateId, variables)
      if (r.success) {
        result.sent++
      } else {
        result.failures++
        console.error('[reminders] send failed', { kind, appt_id: a.id, error: r.error })
      }
    } catch (err: any) {
      result.failures++
      console.error('[reminders] send threw', { kind, appt_id: a.id, message: err?.message })
    }
  }

  return result
}
