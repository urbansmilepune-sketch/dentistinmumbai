// Appointment WhatsApps with a paper trail (27 Nov 2026).
//
// Why: on 27 Nov a booking_received WhatsApp failed with Meta error 131048
// ("spam rate limit hit"). MSG91 had already said "accepted", so the old code
// thought it was sent and never sent the SMS backup, and nobody was told.
//
// sendAppointmentWhatsApp():
//   1. sends the WhatsApp
//   2. saves a row in whatsapp_send_log (accepted or failed)
//   3. if it failed right away: sends the SMS backup and emails admin
//   4. stores the SMS backup on the row, so a LATE failure reported by
//      MSG91 (/api/webhooks/msg91-whatsapp-status) can send it then.
//
// Best-effort: never throws. If the SQL (20261127220000_whatsapp_send_log.sql)
// has not been run, it still sends WhatsApp + SMS exactly as before.
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { toWhatsAppNumber, whatsAppEnabled, type WhatsAppResult } from '@/lib/whatsapp'
import { sendAdminWhatsAppFailedAlert } from '@/lib/email'

export const SEND_LOG_TABLE = 'whatsapp_send_log'

/** Which SMS goes out if the WhatsApp fails. templateEnv is the Vercel env
 *  var that holds the DLT template id (resolved at send time). */
export interface SmsFallback {
  templateEnv: string
  phone: string
  vars: string[]
}

export interface AppointmentWhatsAppInput {
  template: string
  recipient: 'patient' | 'dentist'
  toPhone: string
  appointmentId?: string | null
  dentistId?: string | null
  /** One line for the admin email, e.g. "Yogesh T → Dr Manpreet, 27 Nov 6:00 PM". */
  summary: string
  smsFallback?: SmsFallback | null
  send: () => Promise<WhatsAppResult>
}

export interface AppointmentWhatsAppResult {
  whatsapp: boolean
  sms: 'sent' | 'failed' | 'not_needed' | 'no_template'
}

function db(): SupabaseClient | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/** MSG91 answers {"request_id": "..."} (or requestId / data.request_id). */
export function requestIdFrom(response: string): string | null {
  try {
    const j = JSON.parse(response)
    const v = j?.request_id ?? j?.requestId ?? j?.data?.request_id ?? j?.data?.requestId
    return v ? String(v) : null
  } catch {
    return null
  }
}

export async function sendFallbackSms(f: SmsFallback | null | undefined): Promise<'sent' | 'failed' | 'no_template'> {
  if (!f || !f.phone) return 'no_template'
  const templateId = process.env[f.templateEnv]
  if (!templateId) return 'no_template'
  try {
    const r = await sendSMS(f.phone, templateId, f.vars)
    if (!r.success) console.error('[wa-log] SMS backup failed', { env: f.templateEnv, error: r.error })
    return r.success ? 'sent' : 'failed'
  } catch (err) {
    console.error('[wa-log] SMS backup threw', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

function smsLabel(s: string | null | undefined): string {
  if (s === 'sent') return 'SMS backup sent'
  if (s === 'failed') return 'SMS backup FAILED'
  if (s === 'no_template') return 'no SMS backup (template id not set in Vercel)'
  return 'no SMS backup'
}

export async function alertAdmin(row: {
  template: string; recipient: string; to_phone: string; summary: string | null
  error: string | null; sms_result: string | null; late: boolean
}): Promise<void> {
  try {
    await sendAdminWhatsAppFailedAlert({
      template: row.template,
      recipient: row.recipient,
      phone: row.to_phone,
      summary: row.summary || '',
      reason: (row.error || 'unknown').slice(0, 300),
      backup: smsLabel(row.sms_result),
      when: row.late ? 'MSG91 accepted it, then WhatsApp reported a failure' : 'MSG91 refused it straight away',
    })
  } catch (err) {
    console.error('[wa-log] admin alert failed', err instanceof Error ? err.message : err)
  }
}

export async function sendAppointmentWhatsApp(input: AppointmentWhatsAppInput): Promise<AppointmentWhatsAppResult> {
  let w: WhatsAppResult
  try {
    w = await input.send()
  } catch (err) {
    w = { success: false, error: err instanceof Error ? err.message : 'send threw' }
  }

  let sms: AppointmentWhatsAppResult['sms'] = 'not_needed'
  if (!w.success) sms = await sendFallbackSms(input.smsFallback)

  // With WhatsApp switched off, a "failure" is expected: SMS only, no log, no alert.
  if (!whatsAppEnabled()) return { whatsapp: w.success, sms }

  const error = w.success ? null : String(w.error || 'unknown').slice(0, 1000)
  const client = db()
  if (client) {
    const { error: insErr } = await client.from(SEND_LOG_TABLE).insert({
      template: input.template,
      recipient: input.recipient,
      to_phone: toWhatsAppNumber(input.toPhone) || String(input.toPhone || ''),
      request_id: w.success ? requestIdFrom(w.response) : null,
      status: w.success ? 'accepted' : 'failed',
      error,
      appointment_id: input.appointmentId || null,
      dentist_id: input.dentistId || null,
      summary: input.summary.slice(0, 300),
      // Kept only while a late failure could still need it.
      sms_fallback: w.success ? (input.smsFallback ?? null) : null,
      sms_result: w.success ? null : sms,
      admin_alerted: !w.success,
    })
    if (insErr) console.error('[wa-log] insert failed (run whatsapp_send_log SQL?)', insErr.message)
  }
  if (!w.success) {
    await alertAdmin({
      template: input.template, recipient: input.recipient, to_phone: input.toPhone,
      summary: input.summary, error, sms_result: sms, late: false,
    })
  }
  return { whatsapp: w.success, sms }
}
