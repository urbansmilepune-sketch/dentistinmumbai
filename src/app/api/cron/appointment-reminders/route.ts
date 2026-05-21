// Vercel cron — daily 6PM IST (= 12:30 UTC, see /vercel.json) day-before
// SMS reminders to every patient with an appointment tomorrow at any
// clinic on the platform. All scheduling, eligibility, and MSG91 wiring
// live in src/lib/appointmentReminders.ts; this handler is just the
// Bearer-gated entry point.
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
  const result = await runAppointmentReminders('day_before')
  return NextResponse.json({ ok: true, ...result })
}
