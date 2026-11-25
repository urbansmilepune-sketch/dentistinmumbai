// POST /api/admin/events/search — the admin "Search now" button. Runs the
// same auto-search as the monthly cron (about 40 web searches, $2-3) and
// saves what it finds as pending. Refuses if a run started in the last
// 15 minutes, so a double tap doesn't pay twice.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { runEventSearch } from '@/lib/eventSearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const db = await requireAdmin()
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const since = new Date(Date.now() - 15 * 60000).toISOString()
  const { data: recent, error } = await db.from('event_search_runs').select('id').gte('started_at', since).limit(1)
  if (error) return NextResponse.json({ error: 'Run the events v2 SQL first (event_search_runs is missing).' }, { status: 503 })
  if (recent?.length) return NextResponse.json({ error: 'A search started in the last 15 minutes. Please wait for it.' }, { status: 429 })
  const result = await runEventSearch(db, 'manual')
  return NextResponse.json({ success: true, ...result })
}
