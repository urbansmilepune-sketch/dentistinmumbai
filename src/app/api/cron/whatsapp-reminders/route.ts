// Vercel cron — every 5 minutes. Sends WhatsApp appointment_reminder
// 3 hours and 30 minutes before each appointment. Logic lives in
// src/lib/whatsappReminders.ts. Does nothing unless WHATSAPP_ENABLED=true.
// Also sends due "rate your visit" review requests (src/lib/reviewRequests.ts,
// needs REVIEW_REQUESTS_ENABLED=true as well).
import { NextRequest, NextResponse } from 'next/server'
import { runWhatsAppReminders } from '@/lib/whatsappReminders'
import { sendDueReviewRequests } from '@/lib/reviewRequests'
import { adminClient } from '@/lib/messageLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runWhatsAppReminders()
  let reviewRequests: unknown = null
  try {
    reviewRequests = await sendDueReviewRequests(adminClient())
  } catch (err: any) {
    console.error('[cron/whatsapp-reminders] review requests failed', err?.message)
    reviewRequests = { error: err?.message || 'failed' }
  }
  return NextResponse.json({ ok: true, ...result, reviewRequests })
}
