// POST /api/patient/data — the patient portal's single read endpoint. Given a
// valid 24h portal token (Authorization: Bearer …) and a patient_id, it
// returns that clinic's records: patient + clinic profile, upcoming
// appointments, prescriptions, invoices and past visits.
//
// Security: the token only proves phone ownership. We independently re-load the
// requested patient row and confirm (a) its phone matches the token's phone and
// (b) portal_access is still enabled — so a token can never read a record that
// isn't the holder's, even if a patient_id is guessed or a dentist later
// revokes access.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPatientToken, phoneTail10, bearerFromRequest } from '@/lib/patientPortal'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function todayIsoLocal(): string {
  // Server runs UTC; clinics are IST. Comparing date strings (YYYY-MM-DD) is
  // good enough for "upcoming" and avoids dropping today's later slots.
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const token = bearerFromRequest(request)
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
    .select('id, name, age, gender, phone, dentist_id, portal_access, portal_last_login, dentist:dentists(id, name, clinic_name, phone, whatsapp, address, city, degree, mci_number, areas(name))')
    .eq('id', patientId)
    .maybeSingle()

  if (!patient || phoneTail10((patient as any).phone) !== claims.phone) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }
  if (!(patient as any).portal_access) {
    return NextResponse.json({ error: 'Portal access for this record has been turned off by your clinic.' }, { status: 403 })
  }

  const dentistId = (patient as any).dentist_id
  const today = todayIsoLocal()

  const [{ data: appts }, { data: rx }, { data: inv }, { data: visits }, { data: allMine }] = await Promise.all([
    db.from('appointments')
      .select('id, appt_date, time_slot, status, notes, reference_no, treatments(name, icon)')
      .eq('patient_id', patientId)
      .gte('appt_date', today)
      .in('status', ['pending', 'confirmed'])
      .order('appt_date', { ascending: true }),
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
    // All portal-enabled clinics for this phone — powers the header switcher
    // without trusting anything in the browser.
    db.from('patients')
      .select('id, name, dentist:dentists(id, name, clinic_name)')
      .ilike('phone', `%${claims.phone}`)
      .eq('portal_access', true),
  ])

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
  }

  const clinics = (allMine || []).map((r: any) => ({
    patient_id: r.id,
    patient_name: r.name,
    dentist_id: r.dentist?.id ?? null,
    dentist_name: r.dentist?.name ?? null,
    clinic_name: r.dentist?.clinic_name ?? null,
  }))

  return NextResponse.json({
    patient: { id: (patient as any).id, name: (patient as any).name, age: (patient as any).age, gender: (patient as any).gender },
    clinic,
    clinics,
    appointments: appts || [],
    prescriptions: rx || [],
    invoices: inv || [],
    visits: visits || [],
  })
}
