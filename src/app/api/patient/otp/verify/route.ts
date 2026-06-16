// POST /api/patient/otp/verify — checks the 6-digit code, and on success
// returns a 24h portal token plus the list of clinics (one per dentist) that
// have enabled portal access for this phone. The patient picks a clinic and
// the dashboard fetches that clinic's records with the token.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mintPatientToken, phoneTail10 } from '@/lib/patientPortal'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const phone = phoneTail10(body?.phone)
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''
  if (!/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your SMS.' }, { status: 400 })
  }

  const db = admin()

  const { data: row } = await db
    .from('patient_portal_otps')
    .select('id, otp, expires_at, used')
    .eq('phone', phone)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'No active code — request a new one.' }, { status: 400 })
  if (row.used) return NextResponse.json({ error: 'That code was already used — request a new one.' }, { status: 400 })
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired — request a new one.' }, { status: 400 })
  }
  if (row.otp !== otp) {
    return NextResponse.json({ error: 'Incorrect code. Check the SMS and try again.' }, { status: 400 })
  }

  // Burn the OTP before issuing the token so a replayed request can't re-verify.
  await db.from('patient_portal_otps').update({ used: true }).eq('id', row.id)

  // Every portal-enabled clinic this number belongs to.
  const { data: patientRows, error: pErr } = await db
    .from('patients')
    .select('id, name, dentist:dentists(id, name, clinic_name, city)')
    .ilike('phone', `%${phone}`)
    .eq('portal_access', true)
  if (pErr) {
    console.error('[patient/otp/verify] patients lookup failed', pErr)
    return NextResponse.json({ error: 'Could not load your records' }, { status: 500 })
  }
  if (!patientRows || patientRows.length === 0) {
    return NextResponse.json({ error: 'No clinic has enabled portal access for this number yet.' }, { status: 404 })
  }

  // Stamp last-login on all matched rows (best-effort; non-blocking semantics).
  const ids = patientRows.map((r: any) => r.id)
  await db.from('patients').update({ portal_last_login: new Date().toISOString() }).in('id', ids)

  const clinics = patientRows.map((r: any) => ({
    patient_id: r.id,
    patient_name: r.name,
    dentist_id: r.dentist?.id ?? null,
    dentist_name: r.dentist?.name ?? null,
    clinic_name: r.dentist?.clinic_name ?? null,
    city: r.dentist?.city ?? null,
  }))

  const token = await mintPatientToken(phone)
  return NextResponse.json({ success: true, token, clinics })
}
