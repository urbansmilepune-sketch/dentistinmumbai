// /api/patient/session — the patient app's login session.
//   POST   → still logged in? Re-mints the 7-day cookie (sliding expiry) and
//            moves an old Bearer-token session onto the cookie. 401 if expired.
//   DELETE → log out: clears the httpOnly cookie (JS can't clear it itself).
import { NextRequest, NextResponse } from 'next/server'
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
  await setPatientSessionCookie(res, claims.phone)
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ success: true })
  clearPatientSessionCookie(res)
  return res
}
