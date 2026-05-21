// MSG91 Flow SMS integration. The Flow API renders DLT-registered template
// text on the server using positional variables (var1..varN) passed per
// recipient — the template body lives in the MSG91 console, the variables
// are the only thing the app supplies.
//
// Required env:
//   MSG91_AUTH_KEY                 — authkey for the MSG91 account
//   MSG91_SENDER_ID                — DLT-registered 6-char header (default 'DNTPRM')
//
// Optional, per-callsite (template ids):
//   MSG91_TEMPLATE_ID_BOOKING_PATIENT
//   MSG91_TEMPLATE_ID_BOOKING_DENTIST
//   MSG91_TEMPLATE_ID_APPOINTMENT_CONFIRMED
//
// When MSG91_AUTH_KEY is missing the helper logs and no-ops so dev/staging
// without credentials doesn't blow up.

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'DNTPRM'

export type SmsResult =
  | { success: true }
  | { success: false; error: string; status?: number }

/**
 * Send an SMS via MSG91 Flow. The phone must be the 10-digit subscriber
 * number — the country code "91" is prepended here. Variables are mapped
 * positionally onto var1..var4 as the template expects; pass an empty
 * string for any slot the template doesn't use.
 */
export async function sendSMS(
  phone: string,
  templateId: string,
  variables: string[],
): Promise<SmsResult> {
  if (!MSG91_AUTH_KEY) {
    console.log('[MSG91] auth key not set; skipping send to', phone)
    return { success: false, error: 'MSG91_AUTH_KEY not configured' }
  }
  if (!templateId) {
    console.log('[MSG91] no template id provided; skipping send to', phone)
    return { success: false, error: 'template id missing' }
  }

  const digits = phone.replace(/\D/g, '')
  const mobiles = digits.startsWith('91') ? digits : `91${digits}`

  // var1..var10 — the reminder templates use five variables (name, clinic,
  // time, ref, phone), so the original var1..var4 cap had to grow. Slots
  // beyond what the caller passed default to '' which MSG91 renders as
  // empty in the template; unused slots are harmless.
  const recipient: Record<string, string> = { mobiles }
  for (let i = 0; i < 10; i++) recipient[`var${i + 1}`] = variables[i] ?? ''

  const body = {
    template_id: templateId,
    sender: MSG91_SENDER_ID,
    short_url: 0,
    recipients: [recipient],
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: MSG91_AUTH_KEY,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    })
    clearTimeout(timeout)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[MSG91] send failed', { status: res.status, mobiles, templateId, body: text })
      return { success: false, error: text || `HTTP ${res.status}`, status: res.status }
    }
    console.log('[MSG91] sent', { mobiles, templateId })
    return { success: true }
  } catch (err: any) {
    clearTimeout(timeout)
    console.error('[MSG91] request error', { mobiles, templateId, message: err?.message, err })
    return { success: false, error: err?.message || 'Unknown error' }
  }
}
