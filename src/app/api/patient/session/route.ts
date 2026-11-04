// /api/patient/session — the patient app's login session.
//   POST   → still logged in? Re-mints the 7-day cookie (sliding expiry) and
//            moves an old Bearer-token session onto the cookie. 401 if expired.
//   GET    → the clinic list for this login (used right after Google login,
//            where the server set the cookie and the page needs the clinics).
//   DELETE → log out: clears the httpOnly cookie (JS can't clear it itself).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadClinicsFor } from '@/lib/patientClinics'
import {
  verifyPatientToken,
  patientTokenFromRequest,
  setPatientSessionCookie,
  clearPatientSessionCookie,
} from '@/lib/patientPortal'

export async function POST(request: NextRequest) {
  const token = patientTokenFromRequest(request)
  const claims = token ? await verifyPatientToken(token) : null
  if (!claims) {
    const res = NextResponse.json({ error: 'Session expired — please log in again.' }, { status: 401 })
    clearPatientSessionCookie(res)
    return res
  }
  const res = NextResponse.json({ success: true })
  await setPatientSessionCookie(res, claims)
  return res
}

export async function GET(request: NextRequest) {
  const token = patientTokenFromRequest(request)
  const claims = token ? await verifyPatientToken(token) : null
  if (!claims) return NextResponse.json({ error: 'Session expired — please log in again.' }, { status: 401 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { clinics, error } = await loadClinicsFor(db, claims)
  if (error) {
    console.error('[patient/session] clinics lookup failed', error)
    return NextResponse.json({ error: 'Could not load your records' }, { status: 500 })
  }
  const res = NextResponse.json({ success: true, clinics, phone: claims.phone, email: claims.email })
  await setPatientSessionCookie(res, claims)
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ success: true })
  clearPatientSessionCookie(res)
  return res
}
