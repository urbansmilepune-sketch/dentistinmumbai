// MSG91 WhatsApp delivery reports (27 Nov 2026).
//
// MSG91 → Webhooks → new webhook, event "On Outbound Report" (WhatsApp),
// URL https://dentistinpune.in/api/webhooks/msg91-whatsapp-status?key=<WHATSAPP_INBOUND_KEY>
//
// When WhatsApp reports that an appointment message failed AFTER MSG91
// accepted it (e.g. Meta 131048 "spam rate limit hit"), this:
//   - marks the whatsapp_send_log row failed, with the reason
//   - sends the SMS saved on that row, only if it did not already go
//     out with the WhatsApp (it normally does)
//   - emails admin
// Delivered / read reports just update the row's status.
// Failures that match no row (invites, digests, ...) are kept in
// whatsapp_inbound_log as "outbound-status-unmatched" so they stay visible.
//
// MSG91's report payload shape is not documented in one place, so field
// names are read loosely (customerNumber / requestId / templateName / status
// / failureReason, nested or as JSON strings).
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SEND_LOG_TABLE, alertAdmin, sendFallbackSms, type SmsFallback } from '@/lib/whatsappSendLog'

export const dynamic = 'force-dynamic'

function adminDb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

function pick(obj: unknown, keys: string[], depth = 0): string | null {
  if (!obj || typeof obj !== 'object' || depth > 6) return null
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const inner = typeof v === 'string' && /^\s*[[{]/.test(v) ? safeJson(v) : v
    if (inner && typeof inner === 'object') {
      const r = pick(inner, keys, depth + 1)
      if (r) return r
    }
  }
  return null
}

/** A report can be one object, an array, or {data: [...]}. */
export function splitEvents(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    for (const k of ['data', 'reports', 'statuses', 'events', 'messages']) {
      let v = (payload as Record<string, unknown>)[k]
      if (typeof v === 'string' && /^\s*\[/.test(v)) v = safeJson(v)
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v
    }
    return [payload]
  }
  return []
}

export interface ParsedReport {
  status: 'failed' | 'delivered' | 'read' | 'other'
  rawStatus: string | null
  phone10: string | null
  template: string | null
  requestId: string | null
  reason: string | null
  businessNumber10: string | null
}

export function parseReport(ev: unknown): ParsedReport {
  const rawStatus = pick(ev, ['status', 'messageStatus', 'message_status', 'deliveryStatus', 'eventName', 'event'])
  const s = (rawStatus || '').toLowerCase()
  const status: ParsedReport['status'] = /fail|undeliver|reject|error/.test(s) ? 'failed'
    : /read/.test(s) ? 'read'
    : /deliver/.test(s) ? 'delivered'
    : 'other'
  const phone = pick(ev, ['customerNumber', 'customer_number', 'recipient_id', 'recipientNumber', 'to', 'mobile', 'number'])
  const phone10 = (phone || '').replace(/\D/g, '').slice(-10) || null
  const biz = pick(ev, ['integratedNumber', 'integrated_number', 'businessNumber', 'display_phone_number'])
  const code = pick(ev, ['errorCode', 'error_code', 'failureCode', 'code'])
  const text = pick(ev, ['failureReason', 'failure_reason', 'reason', 'errorMessage', 'error_message', 'title', 'description'])
  return {
    status,
    rawStatus,
    phone10: phone10 && /^[6-9]\d{9}$/.test(phone10) ? phone10 : null,
    template: pick(ev, ['templateName', 'template_name']),
    requestId: pick(ev, ['requestId', 'request_id']),
    reason: [code, text].filter(Boolean).join(' ') || rawStatus,
    businessNumber10: (biz || '').replace(/\D/g, '').slice(-10) || null,
  }
}

interface LogRow {
  id: number
  template: string
  recipient: string
  to_phone: string
  summary: string | null
  status: string
  sms_fallback: SmsFallback | null
  sms_result: string | null
}

async function findRow(db: SupabaseClient, r: ParsedReport): Promise<LogRow | null> {
  const cols = 'id, template, recipient, to_phone, summary, status, sms_fallback, sms_result'
  if (r.requestId) {
    let q = db.from(SEND_LOG_TABLE).select(cols).eq('request_id', r.requestId)
    if (r.phone10) q = q.eq('to_phone', `91${r.phone10}`)
    const { data } = await q.order('id', { ascending: false }).limit(1)
    if (data?.[0]) return data[0] as LogRow
  }
  // No request id match: same number + same template in the last 6 hours.
  // Without a template name we don't guess (the number may also have had an
  // invite or digest from the same WhatsApp number).
  if (!r.phone10 || !r.template) return null
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  const { data } = await db.from(SEND_LOG_TABLE).select(cols)
    .eq('to_phone', `91${r.phone10}`).eq('template', r.template)
    .in('status', ['accepted', 'delivered']).gte('created_at', since)
    .order('id', { ascending: false }).limit(1)
  return (data?.[0] as LogRow) ?? null
}

async function handle(db: SupabaseClient, payload: unknown): Promise<void> {
  const ourNumber = (process.env.MSG91_WHATSAPP_NUMBER || '917719013232').replace(/\D/g, '').slice(-10)
  for (const ev of splitEvents(payload)) {
    const r = parseReport(ev)
    if (r.status === 'other') continue
    // Account-wide webhook: ignore other projects' numbers.
    if (r.businessNumber10 && r.businessNumber10 !== ourNumber) continue
    const row = await findRow(db, r).catch(() => null)

    if (!row) {
      if (r.status === 'failed') {
        await db.from('whatsapp_inbound_log').insert({
          payload: ev as object, phone: r.phone10, content_type: 'outbound-status-unmatched',
        }).then(() => {}, () => {})
      }
      continue
    }

    if (r.status !== 'failed') {
      // delivered / read: only move forward from accepted/delivered.
      await db.from(SEND_LOG_TABLE).update({ status: r.status, updated_at: new Date().toISOString() })
        .eq('id', row.id).in('status', r.status === 'read' ? ['accepted', 'delivered'] : ['accepted'])
        .then(() => {}, () => {})
      continue
    }

    // Claim the failure once (MSG91 retries, or sends several reports).
    const { data: claimed } = await db.from(SEND_LOG_TABLE)
      .update({ status: 'failed', error: (r.reason || 'failed').slice(0, 1000), admin_alerted: true, updated_at: new Date().toISOString() })
      .eq('id', row.id).in('status', ['accepted', 'delivered'])
      .select('id')
    if (!claimed?.length) continue

    // The SMS normally went out with the WhatsApp: never send it twice.
    let sms = row.sms_result
    if (sms !== 'sent' && row.sms_fallback) {
      sms = await sendFallbackSms(row.sms_fallback)
      await db.from(SEND_LOG_TABLE).update({ sms_result: sms, sms_fallback: null, updated_at: new Date().toISOString() })
        .eq('id', row.id).then(() => {}, () => {})
    }
    await alertAdmin({
      template: row.template, recipient: row.recipient, to_phone: row.to_phone,
      summary: row.summary, error: r.reason, sms_result: sms, late: true,
    })
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || ''
  const expected = process.env.WHATSAPP_INBOUND_KEY || ''
  return NextResponse.json({
    webhook: 'msg91-whatsapp-status',
    key_set_in_vercel: !!expected,
    key_in_url_matches: !!expected && key === expected,
  })
}

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || ''
  if (!process.env.WHATSAPP_INBOUND_KEY || key !== process.env.WHATSAPP_INBOUND_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const raw = await req.text().catch(() => '')
  const payload = safeJson(raw) ?? { raw: raw.slice(0, 20000) }
  const db = adminDb()
  // MSG91 waits ~3 s: answer now, work after the response.
  after(() => handle(db, payload).catch(err => console.error('[wa-status] handler error', err?.message)))
  return NextResponse.json({ ok: true })
}
