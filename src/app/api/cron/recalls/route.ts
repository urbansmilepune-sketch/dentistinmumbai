// Vercel cron — daily 9 AM IST (3:30 UTC, see /vercel.json). Sends every
// recall_reminders row with status='pending' AND due_date <= today (IST).
// Per-row channel is read from recall_reminders.message_channel; defaults
// to SMS when null. The actual send + audit-log work lives in
// /src/lib/recall.ts so this cron endpoint and the manual Send-Now button
// share one source of truth.
//
// On success: status → 'sent', sent_at → now().
// On failure: row stays 'pending' so the next day's run retries it. (A
// future iteration could add an attempt counter; for now repeat-failure
// shows up as a stuck row on the dashboard.)
//
// Required env:
//   CRON_SECRET                          — Vercel cron auth (Bearer header)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY            — cron bypasses RLS
//   MSG91_AUTH_KEY, MSG91_SENDER_ID      — see src/lib/sms.ts
//   MSG91_TEMPLATE_ID_RECALL             — DLT template id for the recall SMS
//   RESEND_API_KEY                       — only required when a recall row's
//                                          message_channel='email'

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { loadRecallSendContext, sendRecallReminder } from '@/lib/recall'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const IST_TZ = 'Asia/Kolkata'

function istTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }

  const today = istTodayIso()
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // Includes overdue rows (due_date < today) so a previously-failed send
  // or a row that was paused has a chance to catch up the next morning.
  const { data, error } = await db
    .from('recall_reminders')
    .select('id')
    .eq('status', 'pending')
    .lte('due_date', today)

  if (error) {
    console.error('[cron/recalls] query failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const dueIds = (data ?? []).map((r: { id: string }) => r.id)
  let sent = 0, failed = 0, skipped = 0
  const failures: { id: string; reason: string }[] = []

  for (const id of dueIds) {
    const ctx = await loadRecallSendContext(db, id)
    if (!ctx) { skipped++; continue }
    if (!ctx.patient_id) { skipped++; continue }

    const result = await sendRecallReminder(db, ctx)
    if (!result.ok) {
      failed++
      failures.push({ id, reason: result.reason || 'unknown' })
      continue
    }
    const { error: updateErr } = await db
      .from('recall_reminders')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
    if (updateErr) {
      // Send already fired — log loudly, don't roll back. Better to risk
      // a duplicate next run than to silently lose that this recall went
      // out (the message_log row remains in either case).
      console.error('[cron/recalls] flip-to-sent failed after send', { id, error: updateErr.message })
    }
    sent++
  }

  return NextResponse.json({
    ok: true, today, eligible: dueIds.length, sent, failed, skipped, failures,
  })
}
