// WhatsApp template messages via MSG91 (account dentaura2, number 917719013232).
//
// Five Meta-approved UTILITY templates. Each takes positional values that
// MSG91 maps onto body_1..body_N:
//
//   booking_received          → patient, after an online booking
//                               {{1}} clinic, {{2}} date + time
//   new_appointment           → dentist, after an online booking
//                               {{1}} patient name, {{2}} date + time
//   appointment_confirmation  → patient, when the dentist confirms
//                               {{1}} clinic, {{2}} date, {{3}} time
//   appointment_cancellation  → patient, when the dentist cancels
//                               {{1}} clinic, {{2}} date
//   appointment_reminder      → patient + dentist, 3 h and 30 min before
//                               {{1}}..{{5}}, see sendReminderWhatsApp
//
// Env:
//   WHATSAPP_ENABLED        — must be "true" or nothing is sent (master switch)
//   MSG91_WHATSAPP_AUTH_KEY — optional; falls back to MSG91_AUTH_KEY
//   MSG91_WHATSAPP_NUMBER   — optional; defaults to 917719013232
//   MSG91_WHATSAPP_NAMESPACE— optional; defaults to the dentaura2 namespace
//
// Callers treat a failed send as "fall back to SMS". The helper never throws.

const ENDPOINT = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/'
const DEFAULT_NUMBER = '917719013232'
const DEFAULT_NAMESPACE = 'a850f4ce_542d_40b1_b34d_e08383aa117f'

export type WhatsAppTemplate =
  | 'booking_received'
  | 'new_appointment'
  | 'appointment_confirmation'
  | 'appointment_cancellation'
  | 'appointment_reminder'

/** Number of {{n}} values each template expects. */
export const TEMPLATE_VALUE_COUNT: Record<WhatsAppTemplate, number> = {
  booking_received: 2,
  new_appointment: 2,
  appointment_confirmation: 3,
  appointment_cancellation: 2,
  appointment_reminder: 5,
}

export type WhatsAppResult =
  | { success: true; response: string }
  | { success: false; error: string; status?: number }

export function whatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === 'true'
}

/** 10-digit Indian mobile → "91XXXXXXXXXX". Returns null if it can't be. */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let d = String(phone).replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10) d = `91${d}`
  if (d.length !== 12 || !d.startsWith('91') || !/^[6-9]/.test(d.slice(2))) return null
  return d
}

/** "2026-11-05" → "5 Nov 2026" */
export function formatApptDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

/** "14:30" → "2:30 PM". Leaves anything else (e.g. "2:30 PM") unchanged. */
export function formatApptTime(slot: string | null | undefined): string {
  if (!slot) return ''
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(slot.trim())
  if (!m) return slot
  const h = Number(m[1])
  const hour12 = ((h + 11) % 12) + 1
  return `${hour12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** WhatsApp rejects empty / newline-containing template values. */
function cleanValue(v: string): string {
  const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim()
  return s || '-'
}

/**
 * Send one approved template to one phone number. Does nothing (returns a
 * failure) when WHATSAPP_ENABLED isn't "true", so callers fall back to SMS.
 * Pass { force: true } only from the admin test page.
 */
export async function sendWhatsAppTemplate(
  phone: string | null | undefined,
  template: WhatsAppTemplate,
  values: string[],
  opts: { force?: boolean } = {},
): Promise<WhatsAppResult> {
  if (!opts.force && !whatsAppEnabled()) {
    return { success: false, error: 'WHATSAPP_ENABLED is not "true"' }
  }
  const authKey = process.env.MSG91_WHATSAPP_AUTH_KEY || process.env.MSG91_AUTH_KEY
  if (!authKey) {
    console.log('[WhatsApp] auth key not set; skipping', template)
    return { success: false, error: 'MSG91 auth key not configured' }
  }
  const to = toWhatsAppNumber(phone)
  if (!to) return { success: false, error: `invalid phone: ${phone ?? '(empty)'}` }

  const expected = TEMPLATE_VALUE_COUNT[template]
  const components: Record<string, { type: 'text'; value: string }> = {}
  for (let i = 0; i < expected; i++) {
    components[`body_${i + 1}`] = { type: 'text', value: cleanValue(values[i] ?? '') }
  }

  const body = {
    integrated_number: process.env.MSG91_WHATSAPP_NUMBER || DEFAULT_NUMBER,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: template,
        language: { code: 'en', policy: 'deterministic' },
        namespace: process.env.MSG91_WHATSAPP_NAMESPACE || DEFAULT_NAMESPACE,
        to_and_components: [{ to: [to], components }],
      },
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const text = await res.text().catch(() => '')
    // MSG91 can answer 200 with {"status":"fail"} — treat that as a failure.
    let apiFailed = false
    try {
      const j = JSON.parse(text)
      apiFailed = j?.status === 'fail' || j?.hasError === true
    } catch { /* non-JSON body */ }
    if (!res.ok || apiFailed) {
      console.error('[WhatsApp] send failed', { template, to, status: res.status, body: text })
      return { success: false, error: text || `HTTP ${res.status}`, status: res.status }
    }
    console.log('[WhatsApp] sent', { template, to, body: text })
    return { success: true, response: text }
  } catch (err: any) {
    clearTimeout(timeout)
    console.error('[WhatsApp] request error', { template, to, message: err?.message })
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

// ── One helper per app event, so the value order lives in one place ──

export function sendBookingReceivedWhatsApp(p: { patientPhone: string; clinicName: string; apptDate: string; timeSlot: string }) {
  return sendWhatsAppTemplate(p.patientPhone, 'booking_received', [
    p.clinicName, `${formatApptDate(p.apptDate)}, ${formatApptTime(p.timeSlot)}`,
  ])
}

export function sendNewAppointmentWhatsApp(p: { dentistPhone: string; patientName: string; apptDate: string; timeSlot: string }) {
  return sendWhatsAppTemplate(p.dentistPhone, 'new_appointment', [
    p.patientName, `${formatApptDate(p.apptDate)}, ${formatApptTime(p.timeSlot)}`,
  ])
}

export function sendConfirmationWhatsApp(p: { patientPhone: string; clinicName: string; apptDate: string; timeSlot: string }) {
  return sendWhatsAppTemplate(p.patientPhone, 'appointment_confirmation', [
    p.clinicName, formatApptDate(p.apptDate), formatApptTime(p.timeSlot),
  ])
}

export function sendCancellationWhatsApp(p: { patientPhone: string; clinicName: string; apptDate: string }) {
  return sendWhatsAppTemplate(p.patientPhone, 'appointment_cancellation', [
    p.clinicName, formatApptDate(p.apptDate),
  ])
}

/**
 * appointment_reminder has 5 values. ASSUMED order (matches the existing
 * day-before SMS): {{1}} patient first name, {{2}} clinic, {{3}} date,
 * {{4}} time, {{5}} clinic phone. Change here if the template text differs.
 */
export function sendReminderWhatsApp(p: { patientPhone: string; patientName: string; clinicName: string; apptDate: string; timeSlot: string; clinicPhone: string }) {
  return sendWhatsAppTemplate(p.patientPhone, 'appointment_reminder', [
    p.patientName, p.clinicName, formatApptDate(p.apptDate), formatApptTime(p.timeSlot), p.clinicPhone,
  ])
}
