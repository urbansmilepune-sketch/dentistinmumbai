// Vercel cron — daily 10 AM IST (4:30 UTC). Sends a post-treatment
// follow-up SMS to every patient whose appointment was completed
// yesterday (IST), asking how they're feeling and giving the clinic
// phone for any concerns.
//
// Dedupe: message_log.appointment_id. A row with message_type='followup'
// and appointment_id=<id> means we already followed up for that visit;
// the cron will skip re-sending even if the appointment row stays in
// 'completed' across runs.
//
// Required env:
//   CRON_SECRET                          — Vercel cron auth (Bearer header)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY            — cron bypasses RLS
//   MSG91_AUTH_KEY, MSG91_SENDER_ID      — see src/lib/sms.ts
//   MSG91_TEMPLATE_ID_FOLLOWUP           — DLT template id
//
// DLT template variables (positional):
//   var1 = patient first name
//   var2 = treatment name (or 'your visit' when no treatment was tagged)
//   var3 = clinic phone

import { NextRequest, NextResponse } from 'next/server'
import { adminClient, appointmentHasMessageOfType, sendSMSAndLog } from '@/lib/messageLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const IST_TZ = 'Asia/Kolkata'

function istYesterdayIso(): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [y, m, d] = ymd.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`
}

interface ApptRow {
  id: string
  patient_id: string | null
  patient_name: string | null
  patient_phone: string | null
  appt_date: string
  status: string
  dentist_id: string
  treatments: { name: string | null } | null
  dentists: { clinic_name: string | null; name: string | null; phone: string | null; whatsapp: string | null } | null
  clinic_locations: { clinic_name: string | null; phone: string | null } | null
  patients: { opt_out_communications: boolean | null } | null
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const templateId = process.env.MSG91_TEMPLATE_ID_FOLLOWUP
  if (!templateId) {
    return NextResponse.json({ ok: true, eligible: 0, sent: 0, skipped: 'MSG91_TEMPLATE_ID_FOLLOWUP env var not set' })
  }

  const yesterday = istYesterdayIso()
  let db
  try { db = adminClient() } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'env not configured' }, { status: 500 })
  }

  const { data, error } = await db
    .from('appointments')
    .select(`
      id, patient_id, patient_name, patient_phone, appt_date, status, dentist_id,
      treatments(name),
      dentists(clinic_name, name, phone, whatsapp),
      clinic_locations(clinic_name, phone),
      patients(opt_out_communications)
    `)
    .eq('appt_date', yesterday)
    .eq('status', 'completed')
    .not('patient_phone', 'is', null)

  if (error) {
    console.error('[cron/post-treatment-followup] query failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as ApptRow[]
  let sent = 0, failed = 0, skipped = 0
  for (const a of rows) {
    if (!a.patient_phone) { skipped++; continue }
    if (a.patients?.opt_out_communications) { skipped++; continue }
    if (await appointmentHasMessageOfType(db, a.id, 'followup')) { skipped++; continue }

    const firstName = (a.patient_name || 'there').split(/\s+/)[0]
    const treatment = a.treatments?.name || 'your visit'
    // clinic_locations overrides dentist defaults for multi-branch
    // dentists so the SMS names the branch the patient actually visited.
    const clinicPhone =
      a.clinic_locations?.phone || a.dentists?.phone || a.dentists?.whatsapp || ''

    const r = await sendSMSAndLog({
      db,
      dentist_id: a.dentist_id,
      patient_id: a.patient_id,
      appointment_id: a.id,
      phone: a.patient_phone,
      templateId,
      variables: [firstName, treatment, clinicPhone],
      message_type: 'followup',
      contentSummary: `Follow-up after ${treatment}`,
    })
    if (r.ok) sent++; else failed++
  }

  return NextResponse.json({ ok: true, yesterday, eligible: rows.length, sent, failed, skipped })
}
