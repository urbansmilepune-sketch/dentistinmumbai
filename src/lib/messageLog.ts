// Helper for the birthday + post-treatment crons.
//
// Both crons follow the same shape: query candidate rows, decide whether
// to send (dedupe), send via MSG91, record the result in message_log.
// The send-and-log step is pulled out here so the two cron handlers stay
// thin.
//
// message_log is a per-RECIPIENT audit trail (one row per patient
// message). communications_log — the older table — is per-BLAST: one row
// for an entire bulk send, with recipients_count + failed_count. Both
// coexist; this helper writes only to message_log.

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'

export function adminClient(): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase env vars not configured')
  }
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export interface LogMessageInput {
  db: SupabaseClient
  dentist_id: string
  patient_id: string | null
  appointment_id?: string | null
  message_type: string
  channel: 'sms' | 'whatsapp' | 'email'
  message_content: string
  status?: string
}

export async function logSentMessage(input: LogMessageInput): Promise<void> {
  const { db, dentist_id, patient_id, appointment_id, message_type, channel, message_content, status } = input
  const { error } = await db.from('message_log').insert({
    dentist_id,
    patient_id,
    appointment_id: appointment_id ?? null,
    message_type,
    channel,
    message_content,
    status: status ?? 'sent',
  })
  if (error) {
    // Logging the audit trail failed but the SMS already went out. Surface
    // the failure to Vercel logs instead of bubbling so the cron summary
    // still reports the send as successful — re-sending because the log
    // INSERT lost would be worse than missing a row in message_log.
    console.error('[message_log] insert failed', { dentist_id, message_type, error: error.message })
  }
}

/** Has this dentist already sent a message of `message_type` for this
 *  specific appointment? Used by the follow-up cron to avoid double-
 *  sending if the appointment row stays in 'completed' across runs. */
export async function appointmentHasMessageOfType(
  db: SupabaseClient,
  appointment_id: string,
  message_type: string,
): Promise<boolean> {
  const { count } = await db
    .from('message_log')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', appointment_id)
    .eq('message_type', message_type)
  return (count ?? 0) > 0
}

/** Has this patient already received a message of `message_type` in the
 *  given window? Used by the birthday cron to avoid greeting twice in
 *  the same year if the cron is retried. Window is a JS Date — we
 *  compare against message_log.sent_at >= window. */
export async function patientHasMessageSince(
  db: SupabaseClient,
  patient_id: string,
  message_type: string,
  since: Date,
): Promise<boolean> {
  const { count } = await db
    .from('message_log')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient_id)
    .eq('message_type', message_type)
    .gte('sent_at', since.toISOString())
  return (count ?? 0) > 0
}

/** Wrapper that sends via MSG91 and writes the audit row only on
 *  success. Failures still get a message_log row but with status='failed'
 *  so an ops query can spot dead numbers / bad templates. */
export async function sendSMSAndLog(args: {
  db: SupabaseClient
  dentist_id: string
  patient_id: string | null
  appointment_id?: string | null
  phone: string
  templateId: string
  variables: string[]
  message_type: string
  // Human-readable summary stored on the audit row. We don't have the
  // rendered SMS text on hand (MSG91 renders from the DLT template), so
  // the caller passes a sketch — "Birthday wish", "Follow-up after RCT",
  // etc.
  contentSummary: string
}): Promise<{ ok: boolean; reason?: string }> {
  const r = await sendSMS(args.phone, args.templateId, args.variables)
  await logSentMessage({
    db: args.db,
    dentist_id: args.dentist_id,
    patient_id: args.patient_id,
    appointment_id: args.appointment_id,
    message_type: args.message_type,
    channel: 'sms',
    message_content: args.contentSummary,
    status: r.success ? 'sent' : 'failed',
  })
  return r.success ? { ok: true } : { ok: false, reason: 'error' in r ? r.error : 'unknown' }
}
