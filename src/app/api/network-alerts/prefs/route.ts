// POST /api/network-alerts/prefs { key, on } — one switch on Alert settings.
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist } from '@/lib/national'
import { PREF_KEYS, readPrefs, type AlertPrefs } from '@/lib/networkAlerts'

export async function POST(request: NextRequest) {
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const json = await request.json().catch(() => null) as { key?: string; on?: boolean } | null
  const key = json?.key as keyof AlertPrefs
  if (!key || !PREF_KEYS.includes(key) || typeof json?.on !== 'boolean') {
    return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 })
  }
  const db = adminDb()
  const { data, error } = await db.from('dentists').select('network_alert_prefs').eq('id', viewer.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Alert settings open soon.' }, { status: 503 })
  const prefs = { ...readPrefs((data as any)?.network_alert_prefs), [key]: json.on }
  const { error: upErr } = await db.from('dentists').update({ network_alert_prefs: prefs }).eq('id', viewer.id)
  if (upErr) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, prefs })
}
