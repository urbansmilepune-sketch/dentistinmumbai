// Vercel cron — daily 9:30 AM IST (4:00 UTC). For every dentist that has at
// least one inventory item expiring within 30 days OR sitting at/below its
// minimum stock level, sends ONE consolidated SMS digest pointing them at the
// inventory dashboard. One message per dentist per day; dentists with no alert
// items are skipped entirely.
//
// Reads the live inventory schema (inventory_items: current_stock,
// min_stock_level, expiry_date) — no dedicated alert table.
//
// Required env:
//   CRON_SECRET                          — Vercel cron auth (Bearer header)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY            — cron bypasses RLS
//   MSG91_AUTH_KEY, MSG91_SENDER_ID      — see src/lib/sms.ts
//   MSG91_TEMPLATE_ID_INVENTORY_ALERT    — DLT template id
//
// DLT template variables (positional):
//   var1 = number of items expiring soon
//   var2 = number of items low on stock
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EXPIRING_SOON_DAYS = 30

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoPlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const templateId = process.env.MSG91_TEMPLATE_ID_INVENTORY_ALERT
  if (!templateId) {
    return NextResponse.json({ ok: true, dentists_alerted: 0, sent: 0, skipped: 'MSG91_TEMPLATE_ID_INVENTORY_ALERT env var not set' })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: items, error } = await db
    .from('inventory_items')
    .select('dentist_id, current_stock, min_stock_level, expiry_date')
  if (error) {
    console.error('[cron/inventory-alerts] query failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const today = isoToday()
  const horizon = isoPlusDays(EXPIRING_SOON_DAYS)

  // dentist_id → { expiring, low }
  const tally = new Map<string, { expiring: number; low: number }>()
  for (const it of items ?? []) {
    const dId = (it as any).dentist_id
    if (!dId) continue
    const t = tally.get(dId) || { expiring: 0, low: 0 }
    const stock = Number((it as any).current_stock || 0)
    const min = Number((it as any).min_stock_level || 0)
    if (stock <= min) t.low++
    const exp = (it as any).expiry_date as string | null
    if (exp && exp >= today && exp <= horizon) t.expiring++
    tally.set(dId, t)
  }

  const alerting = [...tally.entries()].filter(([, t]) => t.expiring > 0 || t.low > 0)
  if (alerting.length === 0) {
    return NextResponse.json({ ok: true, dentists_alerted: 0, sent: 0 })
  }

  const ids = alerting.map(([id]) => id)
  const { data: dentists, error: dErr } = await db
    .from('dentists')
    .select('id, name, phone')
    .in('id', ids)
  if (dErr) {
    console.error('[cron/inventory-alerts] dentists query failed', dErr)
    return NextResponse.json({ error: dErr.message }, { status: 500 })
  }
  const phoneById = new Map<string, string>()
  for (const d of dentists ?? []) {
    const digits = String((d as any).phone || '').replace(/\D/g, '').slice(-10)
    if (/^\d{10}$/.test(digits)) phoneById.set((d as any).id, digits)
  }

  let sent = 0, failed = 0, skippedNoPhone = 0
  for (const [dentistId, t] of alerting) {
    const phone = phoneById.get(dentistId)
    if (!phone) { skippedNoPhone++; continue }
    const r = await sendSMS(phone, templateId, [String(t.expiring), String(t.low)])
    if (r.success) sent++; else { failed++; console.error('[cron/inventory-alerts] send failed', { dentistId, error: r }) }
  }

  return NextResponse.json({ ok: true, dentists_alerted: alerting.length, sent, failed, skipped_no_phone: skippedNoPhone })
}
