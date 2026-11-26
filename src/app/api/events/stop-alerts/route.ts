// POST /api/events/stop-alerts { t } — turns event alerts off for the
// dentist named in the signed token from an alert email.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/national'
import { dentistFromStopToken } from '@/lib/eventAlerts'

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null)
  const id = dentistFromStopToken(String(b?.t || ''))
  if (!id) return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  const { error } = await adminDb().from('dentists').update({ event_alerts_off: true }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  return NextResponse.json({ success: true })
}
