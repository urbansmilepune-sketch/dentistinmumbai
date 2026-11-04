// Vercel cron — every 5 minutes. Sends WhatsApp appointment_reminder
// 3 hours and 30 minutes before each appointment. Logic lives in
// src/lib/whatsappReminders.ts. Does nothing unless WHATSAPP_ENABLED=true.
import { NextRequest, NextResponse } from 'next/server'
import { runWhatsAppReminders } from '@/lib/whatsappReminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runWhatsAppReminders()
  return NextResponse.json({ ok: true, ...result })
}
