// Vercel cron — daily 9 AM IST (3:30 UTC). Wishes happy birthday to every
// patient whose date_of_birth's month + day match today (IST). Dedupe via
// message_log: a row with message_type='birthday' for this patient since
// Jan 1 of the current year means they've already been greeted.
//
// Required env:
//   CRON_SECRET                          — Vercel cron auth (Bearer header)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY            — cron bypasses RLS
//   MSG91_AUTH_KEY, MSG91_SENDER_ID      — see src/lib/sms.ts
//   MSG91_TEMPLATE_ID_BIRTHDAY           — DLT template id for the wish
//
// DLT template variables (positional):
//   var1 = patient first name
//   var2 = clinic name

import { NextRequest, NextResponse } from 'next/server'
import { adminClient, patientHasMessageSince, sendSMSAndLog } from '@/lib/messageLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const IST_TZ = 'Asia/Kolkata'

function istTodayMD(): string {
  // en-CA → YYYY-MM-DD; we want MM-DD to match Postgres to_char(...,'MM-DD').
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return ymd.slice(5)
}

function startOfThisYearIST(): Date {
  // Birthday should fire once per calendar year. The dedupe window is
  // Jan 1 IST onward — convert IST-Jan-1 to UTC for the message_log query.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const yearStr = ymd.slice(0, 4)
  // IST is UTC+5:30, so IST midnight 1 Jan is UTC 18:30 Dec 31. Going
  // through Date.UTC keeps the comparison correct without pulling in a tz
  // library.
  return new Date(Date.UTC(Number(yearStr), 0, 1, -5, -30))
}

interface PatientRow {
  id: string
  name: string | null
  phone: string | null
  date_of_birth: string | null
  opt_out_communications: boolean | null
  dentist_id: string
  dentists: { clinic_name: string | null; name: string | null } | null
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const templateId = process.env.MSG91_TEMPLATE_ID_BIRTHDAY
  if (!templateId) {
    return NextResponse.json({ ok: true, eligible: 0, sent: 0, skipped: 'MSG91_TEMPLATE_ID_BIRTHDAY env var not set' })
  }

  const todayMD = istTodayMD()
  const yearStart = startOfThisYearIST()
  let db
  try { db = adminClient() } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'env not configured' }, { status: 500 })
  }

  // Filter via the partial index created by 20260521180000. to_char on a
  // date column is immutable so Postgres can use the expression index for
  // the equality match.
  const { data, error } = await db
    .from('patients')
    .select(`
      id, name, phone, date_of_birth, opt_out_communications, dentist_id,
      dentists(clinic_name, name)
    `)
    .not('date_of_birth', 'is', null)
    .filter('date_of_birth', 'gte', '1900-01-01') // sanity floor
    // Postgres-side MM-DD match on the index — passed via .filter so the
    // Supabase client doesn't try to wrap to_char() with quotes.
    .filter('date_of_birth::text', 'like', `____-${todayMD}`)

  if (error) {
    console.error('[cron/birthday-wishes] query failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as PatientRow[]
  let sent = 0, failed = 0, skipped = 0
  for (const p of rows) {
    if (!p.phone || p.opt_out_communications) { skipped++; continue }
    // Year-scoped dedupe — a cron retry inside the same year won't
    // re-greet, but next year's run starts fresh.
    const already = await patientHasMessageSince(db, p.id, 'birthday', yearStart)
    if (already) { skipped++; continue }

    const firstName = (p.name || 'there').split(/\s+/)[0]
    const clinic = p.dentists?.clinic_name || p.dentists?.name || 'our clinic'

    const r = await sendSMSAndLog({
      db,
      dentist_id: p.dentist_id,
      patient_id: p.id,
      phone: p.phone,
      templateId,
      variables: [firstName, clinic],
      message_type: 'birthday',
      contentSummary: `Happy birthday — ${clinic}`,
    })
    if (r.ok) sent++; else failed++
  }

  return NextResponse.json({ ok: true, todayMD, eligible: rows.length, sent, failed, skipped })
}
