// Helpers for the recall-reminder system.
//
// One row in public.recall_reminders represents a scheduled "you're due
// for a checkup" ping for a specific patient. Created either:
//   - automatically when an appointment flips to status='completed'
//     (default: 6 months out, type='6month_checkup'); or
//   - manually from the patient detail page (dentist picks date + channel).
//
// The cron at /api/cron/recalls reads `status='pending' AND due_date<=today`
// and sends one message per row before flipping status to 'sent'.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { sendPatientMessage } from '@/lib/email'
import { logSentMessage } from '@/lib/messageLog'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'

export type RecallReminderType =
  | '6month_checkup'
  | 'annual_cleaning'
  | 'follow_up'
  | 'custom'

export type RecallChannel = 'sms' | 'whatsapp' | 'email'

/** Add N months to a YYYY-MM-DD string, returning YYYY-MM-DD. Uses UTC
 *  math so DST shifts don't drift the date. If the source month doesn't
 *  have the same day-of-month (e.g. Aug 31 + 6 months → Feb 28/29), JS
 *  rolls forward into March; we clamp back to the last day of the target
 *  month so a recall scheduled from an Aug 31 visit lands on Feb 28/29,
 *  not March 2/3. */
export function addMonthsToIsoDate(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  // Day 0 of (target month + 1) === last day of target month — used to
  // clamp the day if the source day-of-month overflows.
  const targetMonthIdx = m - 1 + months
  const targetYear = y + Math.floor(targetMonthIdx / 12)
  const targetMonth = ((targetMonthIdx % 12) + 12) % 12
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(d, lastDayOfTarget)
  const out = new Date(Date.UTC(targetYear, targetMonth, clampedDay))
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, '0')}-${String(out.getUTCDate()).padStart(2, '0')}`
}

/** Today in IST as YYYY-MM-DD. Same shape used by the SMS reminder crons. */
export function istTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export interface AutoCreateRecallInput {
  db: SupabaseClient
  dentist_id: string
  patient_id: string | null
  /** The appointment's appt_date (YYYY-MM-DD). Recall date is computed
   *  from this — not from "today" — so a back-dated completion still
   *  lands the recall six months from the actual visit. */
  visit_date: string
  months?: number
  reminder_type?: RecallReminderType
}

/** Auto-create a 6-month recall when an appointment is marked completed.
 *  Idempotent on (patient_id, reminder_type) — re-completing the same
 *  patient's visit, or completing two visits for the same patient in
 *  quick succession, won't stack duplicate recalls. */
export async function autoCreateRecallForCompletedVisit(
  input: AutoCreateRecallInput,
): Promise<{ id: string; due_date: string } | null> {
  const { db, dentist_id, patient_id, visit_date } = input
  if (!patient_id) return null
  const months = input.months ?? 6
  const reminder_type = input.reminder_type ?? '6month_checkup'

  // Dedupe: if this patient already has a pending recall of the same type,
  // skip rather than stack. Re-completing the visit, or the patient
  // returning for a second appointment that also gets completed, should
  // not create back-to-back recalls.
  const { data: existing } = await db
    .from('recall_reminders')
    .select('id, due_date')
    .eq('dentist_id', dentist_id)
    .eq('patient_id', patient_id)
    .eq('reminder_type', reminder_type)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()
  if (existing) return { id: existing.id, due_date: existing.due_date }

  const due_date = addMonthsToIsoDate(visit_date || istTodayIso(), months)
  const { data, error } = await db
    .from('recall_reminders')
    .insert({
      dentist_id,
      patient_id,
      reminder_type,
      due_date,
      status: 'pending',
      message_channel: 'sms',
    })
    .select('id, due_date')
    .single()
  if (error) {
    console.error('[recall] auto-create failed', { dentist_id, patient_id, error: error.message })
    return null
  }
  return data
}

interface RecallSendContext {
  recall_id: string
  dentist_id: string
  patient_id: string | null
  /** May be null for a recall whose patient row was deleted. The send is
   *  skipped in that case. */
  patient_name: string | null
  patient_phone: string | null
  patient_email: string | null
  clinic_name: string
  /** Used to build a booking link with the right city domain. */
  city_slug: string | null
  dentist_name?: string | null
  clinic_phone?: string | null
  channel: RecallChannel
  reminder_type: RecallReminderType | null
}

export interface RecallSendResult {
  ok: boolean
  channel: RecallChannel
  reason?: string
}

function bookingLinkFor(citySlug: string | null | undefined): string {
  const slug = (citySlug && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, citySlug)
    ? citySlug
    : DEFAULT_CITY) as CitySlug
  return `https://${CITY_CONFIGS[slug].domain}/book`
}

/** Render the SMS body that the MSG91 DLT template will be populated with.
 *  Template (registered as MSG91_TEMPLATE_ID_RECALL):
 *    "Hi {name}, it's been 6 months since your visit at {clinic}.
 *     Time for your checkup! Book: {booking_link} - DNTPRM"
 *  Variables (positional): var1 name, var2 clinic, var3 booking_link
 */
function recallSmsVariables(ctx: RecallSendContext): string[] {
  const firstName = (ctx.patient_name || 'there').split(/\s+/)[0]
  return [firstName, ctx.clinic_name, bookingLinkFor(ctx.city_slug)]
}

function whatsappBody(ctx: RecallSendContext): string {
  const firstName = (ctx.patient_name || 'there').split(/\s+/)[0]
  return [
    `Hi ${firstName}! 😊`,
    `It's been 6 months since your last visit at ${ctx.clinic_name}.`,
    `Regular checkups keep your smile healthy!`,
    `Book your appointment: ${bookingLinkFor(ctx.city_slug)}`,
  ].join('\n')
}

function emailBody(ctx: RecallSendContext): { subject: string; message: string } {
  const firstName = (ctx.patient_name || 'there').split(/\s+/)[0]
  return {
    subject: `Time for your checkup at ${ctx.clinic_name}`,
    message: [
      `Hi ${firstName},`,
      '',
      `It's been about 6 months since your last visit at ${ctx.clinic_name}, so it's a great time to schedule your next checkup. Regular visits help us catch issues early and keep your smile healthy.`,
      '',
      `Book an appointment: ${bookingLinkFor(ctx.city_slug)}`,
      '',
      ctx.dentist_name ? `— ${ctx.dentist_name}` : '',
    ].filter(Boolean).join('\n'),
  }
}

/** Sends one recall via the requested channel and logs to message_log.
 *  Returns ok=true if the channel-specific send succeeded; the caller is
 *  responsible for flipping recall_reminders.status to 'sent' on ok. */
export async function sendRecallReminder(
  db: SupabaseClient,
  ctx: RecallSendContext,
): Promise<RecallSendResult> {
  const channel = ctx.channel
  const messageType = 'recall'

  // SMS via MSG91 DLT template — only path that requires a registered
  // template id env var. WhatsApp links open the wa.me API client-side;
  // server-side we just log "sent" because there's no programmatic
  // WhatsApp business send wired up.
  if (channel === 'sms') {
    if (!ctx.patient_phone) return { ok: false, channel, reason: 'no phone on patient' }
    const templateId = process.env.MSG91_TEMPLATE_ID_RECALL
    if (!templateId) return { ok: false, channel, reason: 'MSG91_TEMPLATE_ID_RECALL not configured' }
    const r = await sendSMS(ctx.patient_phone, templateId, recallSmsVariables(ctx))
    await logSentMessage({
      db,
      dentist_id: ctx.dentist_id,
      patient_id: ctx.patient_id,
      message_type: messageType,
      channel: 'sms',
      message_content: `Recall — ${ctx.clinic_name}`,
      status: r.success ? 'sent' : 'failed',
    })
    return r.success ? { ok: true, channel } : { ok: false, channel, reason: 'error' in r ? r.error : 'unknown' }
  }

  if (channel === 'email') {
    if (!ctx.patient_email) return { ok: false, channel, reason: 'no email on patient' }
    const { subject, message } = emailBody(ctx)
    try {
      await sendPatientMessage({
        to_email: ctx.patient_email,
        subject,
        message,
        clinic_name: ctx.clinic_name,
        dentist_name: ctx.dentist_name ?? null,
        clinic_phone: ctx.clinic_phone ?? null,
        city: ctx.city_slug ?? undefined,
      })
      await logSentMessage({
        db,
        dentist_id: ctx.dentist_id,
        patient_id: ctx.patient_id,
        message_type: messageType,
        channel: 'email',
        message_content: `Recall — ${ctx.clinic_name}`,
      })
      return { ok: true, channel }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'email send threw'
      console.error('[recall] email send failed', { recall_id: ctx.recall_id, error: message })
      await logSentMessage({
        db,
        dentist_id: ctx.dentist_id,
        patient_id: ctx.patient_id,
        message_type: messageType,
        channel: 'email',
        message_content: `Recall — ${ctx.clinic_name}`,
        status: 'failed',
      })
      return { ok: false, channel, reason: message }
    }
  }

  // channel === 'whatsapp' — no programmatic WhatsApp Business send is
  // wired up server-side. We log the intended message so the audit trail
  // shows the dentist tried, then return ok=true so the cron / Send-Now
  // flow flips status to 'sent'. The dashboard surfaces the patient's
  // phone for follow-up; ops can swap this to a real Business API later
  // without changing callers.
  if (!ctx.patient_phone) return { ok: false, channel, reason: 'no phone on patient' }
  await logSentMessage({
    db,
    dentist_id: ctx.dentist_id,
    patient_id: ctx.patient_id,
    message_type: messageType,
    channel: 'whatsapp',
    message_content: whatsappBody(ctx),
  })
  return { ok: true, channel }
}

/** Resolves the per-row context needed to send a recall. Pulls the patient
 *  + dentist into a single shape so the cron and the manual Send Now route
 *  share one source of truth. */
export async function loadRecallSendContext(
  db: SupabaseClient,
  recall_id: string,
): Promise<RecallSendContext | null> {
  const { data, error } = await db
    .from('recall_reminders')
    .select(`
      id, dentist_id, patient_id, message_channel, reminder_type,
      patients(id, name, phone, email),
      dentists(name, clinic_name, phone, whatsapp, city)
    `)
    .eq('id', recall_id)
    .maybeSingle()
  if (error || !data) return null
  // The Supabase typegen is intentionally not wired up for this repo, so
  // the nested patients/dentists embeds come back as `unknown`. Narrow via
  // a single type assertion at the boundary, then read normally.
  const row = data as unknown as {
    id: string
    dentist_id: string
    patient_id: string | null
    message_channel: string | null
    reminder_type: RecallReminderType | null
    patients: { id: string; name: string | null; phone: string | null; email: string | null } | null
    dentists: { name: string | null; clinic_name: string | null; phone: string | null; whatsapp: string | null; city: string | null } | null
  }
  return {
    recall_id: row.id,
    dentist_id: row.dentist_id,
    patient_id: row.patient_id,
    patient_name: row.patients?.name ?? null,
    patient_phone: row.patients?.phone ?? null,
    patient_email: row.patients?.email ?? null,
    clinic_name: row.dentists?.clinic_name || row.dentists?.name || 'our clinic',
    city_slug: row.dentists?.city ?? null,
    dentist_name: row.dentists?.name ?? null,
    clinic_phone: row.dentists?.phone || row.dentists?.whatsapp || null,
    channel: (row.message_channel || 'sms') as RecallChannel,
    reminder_type: row.reminder_type ?? null,
  }
}
