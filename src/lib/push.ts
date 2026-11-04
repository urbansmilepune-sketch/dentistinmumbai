// Phone alerts (web push) for the dentist app.
//
// Each phone or browser that turned alerts on has one row in
// dentist_push_subscriptions (SQL: supabase/migrations/20261103120000_dentist_push_subscriptions.sql).
// Keys come from Vercel env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and
// optional VAPID_SUBJECT). Without them every send is a quiet no-op, so the
// app keeps working before the keys are added.
//
// Sends never throw. Call them inside next/server `after()` so the patient's
// or dentist's request isn't slowed down.
//
// Lock-screen text is shown to anyone near the phone, so alerts carry first
// name + initial and the time only. Never put treatment, phone or medical
// details in a payload.
import webpush from 'web-push'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { slotLabel } from '@/lib/clinicSlots'

export type PushKind = 'booking' | 'change' | 'review'
export const PUSH_KINDS: PushKind[] = ['booking', 'change', 'review']
export type PushPrefs = Record<PushKind, boolean>
export const DEFAULT_PREFS: PushPrefs = { booking: true, change: true, review: true }

export type PushMessage = { title: string; body: string; url: string; tag?: string }

export const PUSH_TABLE = 'dentist_push_subscriptions'

export type SubRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  prefs: Partial<PushPrefs> | null
  user_email: string
  is_owner: boolean
}

let configured: boolean | null = null

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

function configure(): boolean {
  if (configured !== null) return configured
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) {
    configured = false
    return false
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://dentistinindia.in', pub, priv)
    configured = true
  } catch (err: any) {
    console.error('[push] bad VAPID keys', err?.message)
    configured = false
  }
  return configured
}

export function pushConfigured(): boolean {
  return configure()
}

export function pushAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// "Priya Sharma" → "Priya S."
export function shortName(full: string | null | undefined): string {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A patient'
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first
}

// "2026-11-06" + "11:00" → "Thu 6 Nov, 11:00 AM"
export function whenLabel(date: string | null | undefined, slot?: string | null): string {
  let day = ''
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
      .replace(',', '')
  }
  const time = slot ? slotLabel(slot) : ''
  return [day, time].filter(Boolean).join(', ')
}

function wantsKind(row: SubRow, kind: PushKind): boolean {
  return (row.prefs ?? {})[kind] !== false
}

// Sends to one row. Returns 'gone' when the phone no longer accepts alerts
// (app uninstalled or alerts blocked), and removes the row.
async function sendToRow(db: SupabaseClient, row: SubRow, msg: PushMessage): Promise<'sent' | 'gone' | 'failed'> {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(msg),
      { TTL: 24 * 60 * 60, urgency: 'high', timeout: 8000 },
    )
    return 'sent'
  } catch (err: any) {
    const code = err?.statusCode
    if (code === 404 || code === 410) {
      await db.from(PUSH_TABLE).delete().eq('id', row.id)
      return 'gone'
    }
    console.error('[push] send failed', { code, message: err?.message, body: String(err?.body || '').slice(0, 200) })
    return 'failed'
  }
}

/**
 * Alert every phone of a clinic that has this kind switched on.
 * staffToo: also alert active clinic staff (reception) who turned alerts on.
 */
export async function notifyClinic(
  dentistId: string | null | undefined,
  kind: PushKind,
  msg: PushMessage,
  { staffToo = true }: { staffToo?: boolean } = {},
): Promise<void> {
  try {
    if (!dentistId || !configure()) return
    const db = pushAdmin()
    const { data, error } = await db
      .from(PUSH_TABLE)
      .select('id, endpoint, p256dh, auth, prefs, user_email, is_owner')
      .eq('dentist_id', dentistId)
    if (error) {
      console.error('[push] subscription lookup failed', { code: error.code, message: error.message })
      return
    }
    let rows = ((data || []) as SubRow[]).filter(r => wantsKind(r, kind))
    if (!staffToo) rows = rows.filter(r => r.is_owner)

    // Staff rows only count while that person is still active staff here.
    if (rows.some(r => !r.is_owner)) {
      const { data: staff, error: staffErr } = await db
        .from('clinic_staff')
        .select('email')
        .eq('dentist_id', dentistId)
        .eq('status', 'active')
      if (staffErr) {
        console.error('[push] staff lookup failed', staffErr.message)
        rows = rows.filter(r => r.is_owner)
      } else {
        const active = new Set((staff || []).map((s: any) => String(s.email || '').toLowerCase()))
        rows = rows.filter(r => r.is_owner || active.has(r.user_email.toLowerCase()))
      }
    }
    if (rows.length === 0) return
    await Promise.allSettled(rows.map(r => sendToRow(db, r, msg)))
  } catch (err: any) {
    console.error('[push] notifyClinic threw', err?.message)
  }
}

/** Test alert to a single phone (Settings → Send a test alert). */
export async function sendTestAlert(row: SubRow): Promise<'sent' | 'gone' | 'failed' | 'not_configured'> {
  if (!configure()) return 'not_configured'
  return sendToRow(pushAdmin(), row, {
    title: 'Alerts are working',
    body: 'You will get a ping like this for new bookings.',
    url: '/for-dentists/dashboard/notifications',
    tag: 'din-test',
  })
}
