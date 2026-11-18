// POST { endpoint } → sends a test alert to this one phone.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { guardRequest } from '@/lib/apiGuards'
import { PUSH_TABLE, pushAdmin, sendTestAlert, type SubRow } from '@/lib/push'

export async function POST(request: NextRequest) {
  const limited = guardRequest(request, 'push-test', { max: 10, windowMs: 10 * 60 * 1000 })
  if (limited) return limited

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
  }

  const { data: row, error } = await pushAdmin()
    .from(PUSH_TABLE)
    .select('id, endpoint, p256dh, auth, prefs, user_email, is_owner')
    .eq('endpoint', endpoint)
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle()
  if (error) {
    console.error('[push:test]', error.code, error.message)
    return NextResponse.json({ error: 'Could not send. Please try again.' }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'Alerts are off on this phone. Turn them on first.' }, { status: 404 })

  const result = await sendTestAlert(row as SubRow)
  if (result === 'sent') return NextResponse.json({ success: true })
  if (result === 'gone') return NextResponse.json({ error: 'This phone stopped accepting alerts. Turn them on again.' }, { status: 410 })
  if (result === 'not_configured') return NextResponse.json({ error: 'Alerts are not set up yet on the server.' }, { status: 503 })
  return NextResponse.json({ error: 'Could not send. Please try again.' }, { status: 502 })
}
