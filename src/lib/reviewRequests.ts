// Review requests: the "please rate your visit" link a patient gets after a
// visit. The token in the link is the proof the patient was sent it, so the
// review page (/review/[token]) needs no OTP.
//
// Table: public.review_requests (supabase/migrations/20261104170000_review_requests.sql).
// Every function here expects a service-role client; the table has no RLS
// policies.
//
// Sources: 'auto' (appointment marked Done), 'visit' (dentist saved a visit
// in the clinic software), 'manual' (dentist tapped Ask for review).
//
// Sending: auto and visit requests are picked up by the 5-minute WhatsApp
// cron once send_after has passed. If the patient has not reviewed 24 hours
// later, the same link goes by SMS (right away if the WhatsApp send failed).
// Nothing is sent unless BOTH WHATSAPP_ENABLED=true and
// REVIEW_REQUESTS_ENABLED=true; the SMS also needs
// MSG91_TEMPLATE_ID_REVIEW_REQUEST (DLT template: name, clinic, link).
//
// A patient gets at most one request per clinic every 30 days, so a
// multi-sitting treatment does not send a message after every sitting.

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { sendReviewRequestWhatsApp, toWhatsAppNumber, whatsAppEnabled } from '@/lib/whatsapp'
import { sendSMS } from '@/lib/sms'

/** Tags shown on the review page. 4-5 stars get GOOD_TAGS, 1-3 get BAD_TAGS. */
export const GOOD_TAGS = ['Painless', 'Explained clearly', 'On time', 'Clean clinic', 'Friendly staff', 'Fair price'] as const
export const BAD_TAGS = ['Long wait', 'Painful', 'Cost more than told', 'Not explained', 'Rude staff', 'Clinic not clean'] as const
export const ALL_TAGS: readonly string[] = [...GOOD_TAGS, ...BAD_TAGS]

/** How long after "Done" the WhatsApp goes out. */
const SEND_DELAY_MS = 2 * 60 * 60 * 1000
/** Requests older than this are never sent (a late "how was your visit" is odd). */
const MAX_SEND_AGE_MS = 2 * 24 * 60 * 60 * 1000
/** SMS reminder this long after the WhatsApp, if the patient hasn't reviewed. */
const SMS_AFTER_MS = 24 * 60 * 60 * 1000
/** No SMS reminder for requests older than this. */
const MAX_SMS_AGE_MS = 4 * 24 * 60 * 60 * 1000
/** One automatic request per patient phone per clinic in this window. */
const REPEAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export function reviewRequestsEnabled(): boolean {
  return process.env.REVIEW_REQUESTS_ENABLED === 'true' && whatsAppEnabled()
}

export function newReviewToken(): string {
  return randomBytes(16).toString('base64url')
}

export function reviewLink(citySlug: string | null | undefined, token: string): string {
  const slug = (citySlug && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, citySlug)
    ? citySlug
    : DEFAULT_CITY) as CitySlug
  return `https://${CITY_CONFIGS[slug].domain}/review/${token}`
}

/** "Priya Sharma" → "Priya S."; "priya" → "Priya". Never shows a full surname. */
export function reviewDisplayName(raw: string | null | undefined): string {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Verified patient'
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  const first = cap(parts[0])
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first
}

export function firstName(raw: string | null | undefined): string {
  const f = String(raw || '').trim().split(/\s+/)[0]
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : 'there'
}

/** IST hour (0-23) for a UTC epoch. */
function istHour(ms: number): number {
  return new Date(ms + 5.5 * 60 * 60 * 1000).getUTCHours()
}

/**
 * When to send: 2 hours from now, but only between 9 AM and 8 PM IST.
 * Outside that window it moves to 10 AM IST the next morning.
 */
export function reviewSendAfter(nowMs: number = Date.now()): Date {
  const t = nowMs + SEND_DELAY_MS
  const h = istHour(t)
  if (h >= 9 && h < 20) return new Date(t)
  // 10:00 IST = 04:30 UTC. Pick today's or tomorrow's (IST) 10 AM after t.
  const ist = new Date(t + 5.5 * 60 * 60 * 1000)
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), d = ist.getUTCDate()
  let target = Date.UTC(y, m, d, 4, 30)
  if (target <= t) target = Date.UTC(y, m, d + 1, 4, 30)
  return new Date(target)
}

export interface CreateRequestInput {
  dentist_id: string
  appointment_id?: string | null
  patient_name?: string | null
  patient_phone?: string | null
  treatment?: string | null
  visit_date?: string | null
  visit_id?: string | null
  source: 'auto' | 'visit' | 'manual'
}

/**
 * Create (or reuse) a review request. One per appointment: if the
 * appointment already has one, that row comes back instead. Returns null on
 * a DB error (logged); callers treat that as "no review link this time".
 */
export async function createReviewRequest(
  db: SupabaseClient,
  input: CreateRequestInput,
): Promise<{ id: string; token: string; existed: boolean } | null> {
  if (input.appointment_id) {
    const { data: existing, error } = await db
      .from('review_requests')
      .select('id, token')
      .eq('appointment_id', input.appointment_id)
      .maybeSingle()
    if (error) {
      console.error('[reviewRequests] lookup failed', error.message)
      return null
    }
    if (existing) return { id: existing.id, token: existing.token, existed: true }
  }

  const token = newReviewToken()
  const manual = input.source === 'manual'
  const { data, error } = await db
    .from('review_requests')
    .insert({
      token,
      dentist_id: input.dentist_id,
      appointment_id: input.appointment_id || null,
      patient_name: input.patient_name?.trim() || null,
      patient_phone: input.patient_phone?.replace(/\s/g, '') || null,
      treatment: input.treatment || null,
      visit_date: input.visit_date || null,
      ...(input.visit_id ? { visit_id: input.visit_id } : {}),
      source: input.source,
      send_after: manual ? new Date().toISOString() : reviewSendAfter().toISOString(),
      // A manual request is "sent" by the dentist from their own WhatsApp.
      sent_at: manual ? new Date().toISOString() : null,
      send_channel: manual ? 'manual' : null,
    })
    .select('id, token')
    .single()

  if (error) {
    // 23505 = another call created it a moment ago. Return that one.
    if (error.code === '23505' && input.appointment_id) {
      const { data: again } = await db
        .from('review_requests').select('id, token').eq('appointment_id', input.appointment_id).maybeSingle()
      if (again) return { id: again.id, token: again.token, existed: true }
    }
    console.error('[reviewRequests] insert failed', { code: error.code, message: error.message })
    return null
  }
  return { id: data.id, token: data.token, existed: false }
}

/** Last 10 digits, for matching the same phone typed different ways. */
function phoneTail(phone: string | null | undefined): string {
  return String(phone || '').replace(/\D/g, '').slice(-10)
}

/** True if this clinic already sent this phone a review request in the last 30 days. */
async function askedRecently(db: SupabaseClient, dentistId: string, phone: string | null | undefined): Promise<boolean> {
  const tail = phoneTail(phone)
  if (tail.length !== 10) return false
  const { data, error } = await db
    .from('review_requests')
    .select('id')
    .eq('dentist_id', dentistId)
    .ilike('patient_phone', `%${tail}`)
    .gte('created_at', new Date(Date.now() - REPEAT_WINDOW_MS).toISOString())
    .limit(1)
  if (error) {
    console.error('[reviewRequests] repeat check failed', error.message)
    return true // fail safe: rather skip one request than message twice
  }
  return (data ?? []).length > 0
}

function visitTooOld(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false
  const visitMs = Date.parse(`${isoDate}T23:59:59+05:30`)
  return Number.isFinite(visitMs) && Date.now() - visitMs > MAX_SEND_AGE_MS
}

/**
 * Called after a dentist saves a visit in the clinic software (visit page or
 * patient file). Same rules as a completed appointment.
 */
export async function queueReviewRequestForVisit(db: SupabaseClient, v: {
  visit_id: string
  dentist_id: string
  patient_name: string | null
  patient_phone: string | null
  visit_date: string | null
  treatment?: string | null
}): Promise<'queued' | 'skipped'> {
  if (!toWhatsAppNumber(v.patient_phone)) return 'skipped'
  if (visitTooOld(v.visit_date)) return 'skipped'
  if (await askedRecently(db, v.dentist_id, v.patient_phone)) return 'skipped'
  const r = await createReviewRequest(db, {
    dentist_id: v.dentist_id,
    visit_id: v.visit_id,
    patient_name: v.patient_name,
    patient_phone: v.patient_phone,
    treatment: v.treatment ?? null,
    visit_date: v.visit_date,
    source: 'visit',
  })
  return r ? 'queued' : 'skipped'
}

/**
 * Called when an appointment flips to 'completed'. Queues an auto request
 * for a visit from the last 2 days with a usable mobile number. Old
 * appointments being tidied up never trigger a message.
 */
export async function queueReviewRequestForCompletedVisit(db: SupabaseClient, appt: {
  id: string
  dentist_id: string
  patient_name: string | null
  patient_phone: string | null
  appt_date: string | null
  treatment?: string | null
}): Promise<void> {
  if (!toWhatsAppNumber(appt.patient_phone)) return
  if (visitTooOld(appt.appt_date)) return
  if (await askedRecently(db, appt.dentist_id, appt.patient_phone)) return
  await createReviewRequest(db, {
    dentist_id: appt.dentist_id,
    appointment_id: appt.id,
    patient_name: appt.patient_name,
    patient_phone: appt.patient_phone,
    treatment: appt.treatment ?? null,
    visit_date: appt.appt_date,
    source: 'auto',
  })
}

export interface ReviewRequestRunResult {
  enabled: boolean
  due: number
  sent: number
  failed: number
  skipped: number
  smsSent: number
  smsFailed: number
}

/** Send every due auto request. Each row is claimed before sending so it can never go twice. */
export async function sendDueReviewRequests(db: SupabaseClient): Promise<ReviewRequestRunResult> {
  const result: ReviewRequestRunResult = { enabled: reviewRequestsEnabled(), due: 0, sent: 0, failed: 0, skipped: 0, smsSent: 0, smsFailed: 0 }
  if (!result.enabled) return result

  const nowIso = new Date().toISOString()
  const { data: rows, error } = await db
    .from('review_requests')
    .select('id, token, dentist_id, patient_name, patient_phone, created_at, dentists(clinic_name, name, city)')
    .is('sent_at', null)
    .in('source', ['auto', 'visit'])
    .lte('send_after', nowIso)
    .order('send_after', { ascending: true })
    .limit(50)
  if (error) {
    console.error('[reviewRequests] due query failed', error.message)
    return result
  }

  for (const r of (rows ?? []) as any[]) {
    result.due++
    // Claim: only one cron run can flip sent_at from null.
    const { data: claimed } = await db
      .from('review_requests')
      .update({ sent_at: new Date().toISOString(), send_channel: 'whatsapp' })
      .eq('id', r.id)
      .is('sent_at', null)
      .select('id')
    if (!claimed || claimed.length === 0) { result.skipped++; continue }

    if (Date.now() - Date.parse(r.created_at) > MAX_SEND_AGE_MS) {
      await db.from('review_requests').update({ send_channel: null, send_error: 'too old, not sent' }).eq('id', r.id)
      result.skipped++
      continue
    }

    const d = Array.isArray(r.dentists) ? r.dentists[0] : r.dentists
    const clinicName = d?.clinic_name || d?.name || 'the clinic'
    const link = reviewLink(d?.city, r.token)
    const w = await sendReviewRequestWhatsApp({
      patientPhone: r.patient_phone,
      firstName: firstName(r.patient_name),
      clinicName,
      link,
    })
    if (w.success) {
      result.sent++
    } else {
      result.failed++
      await db.from('review_requests').update({ send_error: String(w.error).slice(0, 500) }).eq('id', r.id)
      // WhatsApp didn't go: send the SMS now instead of waiting a day.
      const sms = await sendReviewSms(db, r.id, r.patient_phone, r.patient_name, clinicName, link)
      if (sms === 'sent') result.smsSent++
      else if (sms === 'failed') result.smsFailed++
    }
  }

  // SMS reminder: WhatsApp went out 24+ hours ago and no review yet.
  if (process.env.MSG91_TEMPLATE_ID_REVIEW_REQUEST) {
    const { data: late, error: lateErr } = await db
      .from('review_requests')
      .select('id, token, patient_name, patient_phone, dentists(clinic_name, name, city)')
      .in('source', ['auto', 'visit'])
      .eq('send_channel', 'whatsapp')
      .is('used_at', null)
      .is('sms_sent_at', null)
      .lte('sent_at', new Date(Date.now() - SMS_AFTER_MS).toISOString())
      .gte('created_at', new Date(Date.now() - MAX_SMS_AGE_MS).toISOString())
      .limit(50)
    if (lateErr) {
      console.error('[reviewRequests] SMS reminder query failed', lateErr.message)
    } else {
      for (const r of (late ?? []) as any[]) {
        // No SMS in the middle of the night: 9 AM to 8 PM IST only.
        const h = istHour(Date.now())
        if (h < 9 || h >= 20) break
        const d = Array.isArray(r.dentists) ? r.dentists[0] : r.dentists
        const sms = await sendReviewSms(db, r.id, r.patient_phone, r.patient_name, d?.clinic_name || d?.name || 'the clinic', reviewLink(d?.city, r.token))
        if (sms === 'sent') result.smsSent++
        else if (sms === 'failed') result.smsFailed++
      }
    }
  }
  return result
}

/** Claim and send the review SMS once. Needs MSG91_TEMPLATE_ID_REVIEW_REQUEST. */
async function sendReviewSms(
  db: SupabaseClient, id: string, phone: string | null, name: string | null, clinicName: string, link: string,
): Promise<'sent' | 'failed' | 'skipped'> {
  const tpl = process.env.MSG91_TEMPLATE_ID_REVIEW_REQUEST
  if (!tpl || !phone) return 'skipped'
  const { data: claimed } = await db
    .from('review_requests')
    .update({ sms_sent_at: new Date().toISOString() })
    .eq('id', id)
    .is('sms_sent_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) return 'skipped'
  const r = await sendSMS(phoneTail(phone), tpl, [firstName(name), clinicName, link])
  if (r.success) return 'sent'
  await db.from('review_requests').update({ send_error: `sms: ${JSON.stringify(r).slice(0, 400)}` }).eq('id', id)
  return 'failed'
}
