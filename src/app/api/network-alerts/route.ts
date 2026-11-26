// GET /api/network-alerts — the signed-in dentist's DentistIn India alerts
// (src/lib/networkAlerts.ts). Used by the bell on dentistinindia.in and by
// the "My India profile" card and button in the city-site dashboard (auth
// is per domain, and both domains know the same dentist row).
//
// ?limit=n   how many grouped lines to return (default 6, max 40)
// Returns { unseen, line, items }. line is the short "2 new followers and
// 3 likes" summary of what is unseen. Signed-out visitors get 401.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist } from '@/lib/national'
import { loadAlerts, summaryLine, type AlertKind } from '@/lib/networkAlerts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  const limit = Math.min(40, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 6))
  const db = adminDb()

  const { data: unseenRows, error } = await db.from('network_alerts').select('kind, case_id')
    .eq('recipient_id', viewer.id).is('seen_at', null).limit(500)
  if (error) return NextResponse.json({ unseen: 0, line: '', items: [] }, { headers: { 'Cache-Control': 'no-store' } })
  const rows = (unseenRows || []) as Array<{ kind: AlertKind; case_id: string | null }>
  const caseIds = Array.from(new Set(rows.map(r => r.case_id).filter(Boolean))) as string[]
  const titles = new Map<string, string>()
  if (caseIds.length === 1) {
    const { data: c } = await db.from('cases').select('id, title').eq('id', caseIds[0]).maybeSingle()
    if (c) titles.set(c.id as string, String((c as any).title || ''))
  }
  const items = await loadAlerts(viewer.id, Math.max(limit * 4, 20), db)
  return NextResponse.json(
    { unseen: rows.length, line: summaryLine(rows, titles), items: items.slice(0, limit) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
