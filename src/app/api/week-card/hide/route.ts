// POST /api/week-card/hide — the dentist closed the "Your week" card on
// dentistinindia.in. It stays hidden until next Monday (India time).
import { NextResponse } from 'next/server'
import { adminDb, getViewerDentist } from '@/lib/national'
import { nextMondayIst } from '@/lib/weeklyActivity'

export async function POST() {
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { error } = await adminDb().from('dentists')
    .update({ week_card_hidden_until: nextMondayIst().toISOString() }).eq('id', viewer.id)
  // Column missing (SQL not run): the card just comes back on the next visit.
  if (error) return NextResponse.json({ ok: false }, { status: 200 })
  return NextResponse.json({ ok: true })
}
