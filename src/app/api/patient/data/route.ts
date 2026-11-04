// POST /api/patient/data — the patient portal's single read endpoint. Given a
// valid portal session (httpOnly cookie, or a legacy Bearer token) and a patient_id, it
// returns that clinic's records: patient + clinic profile (with working hours
// for the reschedule screen), upcoming and past appointments, treatment plans,
// prescriptions, invoices and past visits.
//
// Security: the token only proves phone ownership. We independently re-load the
// requested patient row and confirm its phone matches the token's phone, so a
// token can never read a record that isn't the holder's, even if a patient_id
// is guessed. patients.portal_access is no longer checked: the patient owns
// their records and needs no switch from the dentist.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPatientToken, patientTokenFromRequest, setPatientSessionCookie, ownsPatientRow, patientMatch } from '@/lib/patientPortal'
import { nowInIndia } from '@/lib/clinicSlots'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const token = patientTokenFromRequest(request)
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const claims = await verifyPatientToken(token)
  if (!claims) return NextResponse.json({ error: 'Session expired — please log in again.' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { body = {} }
  const patientId = typeof body?.patient_id === 'string' ? body.patient_id : ''
  if (!patientId) return NextResponse.json({ error: 'Missing patient_id' }, { status: 400 })

  const db = admin()

  // Load + authorise the requested patient against the token's phone.
  const { data: patient } = await db
    .from('patients')
    .select('id, name, age, gender, phone, email, dentist_id, portal_access, portal_last_login, dentist:dentists(id, slug, name, clinic_name, phone, whatsapp, address, city, degree, mci_number, working_hours, areas(name))')
    .eq('id', patientId)
    .maybeSingle()

  if (!patient || !ownsPatientRow(patient as any, claims)) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const dentistId = (patient as any).dentist_id
  const today = nowInIndia().iso

  const [{ data: appts }, { data: pastAppts }, plansRes, { data: rx }, { data: inv }, { data: visits }, { data: allMine }, { data: locations }] = await Promise.all([
    db.from('appointments')
      .select('id, appt_date, time_slot, status, notes, reference_no, location_id, treatments(name, icon)')
      .eq('patient_id', patientId)
      .gte('appt_date', today)
      .in('status', ['pending', 'confirmed'])
      .order('appt_date', { ascending: true }),
    db.from('appointments')
      .select('id, appt_date, time_slot, status, reference_no, treatments(name)')
      .eq('patient_id', patientId)
      .or(`appt_date.lt.${today},status.in.(completed,cancelled,no_show)`)
      .order('appt_date', { ascending: false })
      .limit(20),
    // Plans the dentist has shown the patient. Drafts (unfinished) and
    // declined plans stay on the dentist side.
    db.from('treatment_plans')
      .select('id, title, status, total_estimated_cost, total_cost, notes, created_at, accepted_at, treatment_plan_steps(id, step_number, treatment_name, tooth_numbers, tooth_number, estimated_cost, status, completed_at)')
      .eq('patient_id', patientId)
      .eq('dentist_id', dentistId)
      .in('status', ['presented', 'accepted', 'in_progress', 'completed'])
      .order('created_at', { ascending: false }),
    db.from('prescriptions')
      .select('id, medicines, instructions, template_used, created_at')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false }),
    db.from('invoices')
      .select('id, invoice_no, invoice_date, total, payment_status, items, subtotal, discount, gst_amount, payment_method, notes')
      .eq('patient_id', patientId)
      .order('invoice_date', { ascending: false }),
    db.from('visits')
      .select('id, visit_date, chief_complaint, treatment_done, clinical_findings')
      .eq('patient_id', patientId)
      .order('visit_date', { ascending: false }),
    // Every clinic this phone is a patient at — powers the header switcher
    // without trusting anything in the browser.
    db.from('patients')
      .select('id, name, dentist:dentists(id, name, clinic_name, city)')
      .ilike(patientMatch(claims).column, patientMatch(claims).pattern),
    // Branch hours, so a reschedule at branch B uses branch B's timings.
    db.from('clinic_locations')
      .select('id, working_hours')
      .eq('dentist_id', dentistId),
  ])
  if (plansRes.error) console.error('[patient/data] treatment_plans failed', plansRes.error.message)

  const plans = (plansRes.data || []).map((p: any) => ({
    ...p,
    treatment_plan_steps: [...(p.treatment_plan_steps || [])].sort((a: any, b: any) => (a.step_number || 0) - (b.step_number || 0)),
  }))

  const d = (patient as any).dentist || {}
  const clinic = {
    dentist_id: dentistId,
    dentist_name: d.name ?? null,
    clinic_name: d.clinic_name ?? null,
    phone: d.phone ?? null,
    whatsapp: d.whatsapp ?? null,
    address: d.address ?? null,
    city: d.city ?? null,
    degree: d.degree ?? null,
    mci_number: d.mci_number ?? null,
    area: d.areas?.name ?? null,
    slug: d.slug ?? null,
    working_hours: d.working_hours ?? null,
    location_hours: Object.fromEntries((locations || []).map((l: any) => [l.id, l.working_hours ?? null])),
  }

  const clinics = (allMine || []).map((r: any) => ({
    patient_id: r.id,
    patient_name: r.name,
    dentist_id: r.dentist?.id ?? null,
    dentist_name: r.dentist?.name ?? null,
    clinic_name: r.dentist?.clinic_name ?? null,
    city: r.dentist?.city ?? null,
  }))

  const res = NextResponse.json({
    patient: { id: (patient as any).id, name: (patient as any).name, age: (patient as any).age, gender: (patient as any).gender },
    clinic,
    clinics,
    appointments: appts || [],
    past_appointments: pastAppts || [],
    treatment_plans: plans,
    prescriptions: rx || [],
    invoices: inv || [],
    visits: visits || [],
  })
  // Using the app keeps the login alive for another 7 days.
  await setPatientSessionCookie(res, claims)
  return res
}
