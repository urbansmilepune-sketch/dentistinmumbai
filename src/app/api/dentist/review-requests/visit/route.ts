// POST /api/dentist/review-requests/visit — called after the dentist saves a
// visit in the clinic software. Queues the "rate your visit" WhatsApp (SMS
// a day later if not reviewed). Body: { visit_id }. Best-effort: the visit
// is already saved, so every failure returns 200 with queued: false.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { queueReviewRequestForVisit } from '@/lib/reviewRequests'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const dentist = await resolveCurrentDentist(supabase, 'id')
  if (!dentist) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as any
  const visitId = typeof body.visit_id === 'string' ? body.visit_id : ''
  if (!visitId) return NextResponse.json({ error: 'Missing visit_id' }, { status: 400 })

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  try {
    const { data: visit } = await db
      .from('visits')
      .select('id, dentist_id, patient_id, visit_date, treatment_done')
      .eq('id', visitId)
      .maybeSingle()
    if (!visit || visit.dentist_id !== dentist.id || !visit.patient_id) {
      return NextResponse.json({ queued: false })
    }
    const { data: patient } = await db
      .from('patients')
      .select('name, phone, opt_out_communications')
      .eq('id', visit.patient_id)
      .eq('dentist_id', dentist.id)
      .maybeSingle()
    if (!patient || patient.opt_out_communications) return NextResponse.json({ queued: false })

    const treatment = typeof visit.treatment_done === 'string'
      ? visit.treatment_done.split(';')[0].trim().slice(0, 60) || null
      : null
    const r = await queueReviewRequestForVisit(db, {
      visit_id: visit.id,
      dentist_id: dentist.id,
      patient_name: patient.name ?? null,
      patient_phone: patient.phone ?? null,
      visit_date: visit.visit_date ?? null,
      treatment,
    })
    return NextResponse.json({ queued: r === 'queued' })
  } catch (err: any) {
    console.error('[review-requests/visit] failed', err?.message)
    return NextResponse.json({ queued: false })
  }
}
