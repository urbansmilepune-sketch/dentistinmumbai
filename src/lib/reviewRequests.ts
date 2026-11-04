// Review requests: the "please rate your visit" link a patient gets after a
// visit. The token in the link is the proof the patient was sent it, so the
// review page (/review/[token]) needs no OTP.
//
// Table: public.review_requests (supabase/migrations/20261104170000_review_requests.sql).
// Every function here expects a service-role client; the table has no RLS
// policies.
//
// Sending: auto requests are picked up by the 5-minute WhatsApp cron once
// send_after has passed. Nothing is sent unless BOTH WHATSAPP_ENABLED=true
// and REVIEW_REQUESTS_ENABLED=true, so the code can ship before Meta approves
// the review_request template.

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { sendReviewRequestWhatsApp, toWhatsAppNumber, whatsAppEnabled } from '@/lib/whatsapp'

/** Tags shown on the review page. 4-5 stars get GOOD_TAGS, 1-3 get BAD_TAGS. */
export const GOOD_TAGS = ['Painless', 'Explained clearly', 'On time', 'Clean clinic', 'Friendly staff', 'Fair price'] as const
export const BAD_TAGS = ['Long wait', 'Painful', 'Cost more than told', 'Not explained', 'Rude staff', 'Clinic not clean'] as const
export const ALL_TAGS: readonly string[] = [...GOOD_TAGS, ...BAD_TAGS]

/** How long after "Done" the WhatsApp goes out. */
const SEND_DELAY_MS = 2 * 60 * 60 * 1000
/** Requests older than this are never sent (a late "how was your visit" is odd). */
const MAX_SEND_AGE_MS = 2 * 24 * 60 * 60 * 1000

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
  source: 'auto' | 'manual'
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
  if (appt.appt_date) {
    const visitMs = Date.parse(`${appt.appt_date}T23:59:59+05:30`)
    if (Number.isFinite(visitMs) && Date.now() - visitMs > MAX_SEND_AGE_MS) return
  }
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
}

/** Send every due auto request. Each row is claimed before sending so it can never go twice. */
export async function sendDueReviewRequests(db: SupabaseClient): Promise<ReviewRequestRunResult> {
  const result: ReviewRequestRunResult = { enabled: reviewRequestsEnabled(), due: 0, sent: 0, failed: 0, skipped: 0 }
  if (!result.enabled) return result

  const nowIso = new Date().toISOString()
  const { data: rows, error } = await db
    .from('review_requests')
    .select('id, token, dentist_id, patient_name, patient_phone, created_at, dentists(clinic_name, name, city)')
    .is('sent_at', null)
    .eq('source', 'auto')
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
    const w = await sendReviewRequestWhatsApp({
      patientPhone: r.patient_phone,
      firstName: firstName(r.patient_name),
      clinicName,
      link: reviewLink(d?.city, r.token),
    })
    if (w.success) {
      result.sent++
    } else {
      result.failed++
      await db.from('review_requests').update({ send_error: String(w.error).slice(0, 500) }).eq('id', r.id)
    }
  }
  return result
}
