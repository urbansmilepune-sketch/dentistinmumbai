// Vercel cron — 1st of every month, 9:00 AM IST (03:30 UTC). Searches the
// web for upcoming dental events and courses in India (next ~4 months) and
// saves new ones as pending for the admin Events tab. Nothing is published.
// See src/lib/eventSearch.ts. Required env: CRON_SECRET, ANTHROPIC_API_KEY.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/national'
import { runEventSearch } from '@/lib/eventSearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runEventSearch(adminDb(), 'cron')
  return NextResponse.json({ success: true, ...result })
}
