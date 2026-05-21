// Vercel cron — daily 8AM IST (= 2:30 UTC, see /vercel.json) morning-of
// SMS reminders to every patient with a confirmed/pending appointment
// scheduled for today. Shared logic in src/lib/appointmentReminders.ts.
//
// Required env (in addition to what /lib/appointmentReminders.ts requires):
//   CRON_SECRET — Vercel cron auth (Bearer header)
import { NextRequest, NextResponse } from 'next/server'
import { runAppointmentReminders } from '@/lib/appointmentReminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runAppointmentReminders('day_of')
  return NextResponse.json({ ok: true, ...result })
}
