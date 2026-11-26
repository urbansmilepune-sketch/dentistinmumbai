// POST /api/network-alerts/seen — the dentist opened their alerts (bell or
// /alerts): clear the red count.
import { NextResponse } from 'next/server'
import { getViewerDentist } from '@/lib/national'
import { markAllSeen } from '@/lib/networkAlerts'

export async function POST() {
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  await markAllSeen(viewer.id)
  return NextResponse.json({ ok: true })
}
