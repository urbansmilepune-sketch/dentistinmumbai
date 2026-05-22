// Manual "Send Now" trigger for a single recall reminder. Same send path
// the daily cron uses (see /api/cron/recalls) — this endpoint just bypasses
// the date check so the dentist can fire one immediately from the dashboard.
//
// On success: flips recall_reminders.status to 'sent' and stamps sent_at.
// On failure: returns the per-channel reason (e.g. "no phone on patient",
// "MSG91_TEMPLATE_ID_RECALL not configured") so the dashboard can surface
// it instead of silently swallowing the click.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'
import { loadRecallSendContext, sendRecallReminder } from '@/lib/recall'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing recall id' }, { status: 400 })

  const db = admin()

  // Ownership check — service role bypasses RLS so we verify in code that
  // the recall belongs to the dentist behind the session before sending.
  const { data: recall } = await db
    .from('recall_reminders')
    .select('id, dentist_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!recall || recall.dentist_id !== owner.id) {
    return NextResponse.json({ error: 'Recall not found' }, { status: 404 })
  }
  if (recall.status === 'completed' || recall.status === 'cancelled') {
    return NextResponse.json({ error: 'Recall is already closed' }, { status: 400 })
  }

  const sendCtx = await loadRecallSendContext(db, id)
  if (!sendCtx) return NextResponse.json({ error: 'Failed to load recall context' }, { status: 500 })

  const result = await sendRecallReminder(db, sendCtx)
  if (!result.ok) {
    return NextResponse.json({
      error: 'Send failed',
      message: result.reason,
      channel: result.channel,
    }, { status: 500 })
  }

  // Stamp sent only after the per-channel send succeeded. We allow a manual
  // re-send (status='sent' → 'sent' again) so the dentist can re-trigger a
  // bounced number after the first attempt — sent_at just refreshes.
  const { error: updateErr } = await db
    .from('recall_reminders')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
  if (updateErr) {
    console.error('[recalls/send] flip-to-sent failed after successful send', { id, error: updateErr.message })
  }

  return NextResponse.json({ ok: true, channel: result.channel })
}
