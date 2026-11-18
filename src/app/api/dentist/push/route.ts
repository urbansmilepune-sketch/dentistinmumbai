// Phone alerts: save / read / update / remove this phone's subscription.
//
//   GET    ?endpoint=…  → { configured, publicKey, isOwner, subscribed, prefs }
//   POST   { subscription: { endpoint, keys: { p256dh, auth } }, oldEndpoint? }
//   PATCH  { endpoint, prefs: { booking, change, review } }
//   DELETE { endpoint }
//
// The clinic (dentist_id) comes from the session, never from the client.
// Works for the clinic owner and for active clinic staff. The table has RLS
// on with no policies, so only this service-role code reads or writes it.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { DEFAULT_PREFS, PUSH_KINDS, PUSH_TABLE, pushAdmin, pushConfigured, vapidPublicKey, type PushPrefs } from '@/lib/push'

async function whoAmI(): Promise<{ email: string; dentistId: string; isOwner: boolean } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const dentist = await resolveCurrentDentist(supabase, 'id')
  if (!dentist) return null
  return { email: user.email.toLowerCase(), dentistId: dentist.id, isOwner: dentist.__staffRole === null }
}

function validEndpoint(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 2000 && /^https:\/\/[^\s]+$/.test(v)
}

function cleanPrefs(raw: any): PushPrefs {
  const out = { ...DEFAULT_PREFS }
  for (const k of PUSH_KINDS) if (typeof raw?.[k] === 'boolean') out[k] = raw[k]
  return out
}

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205')
}

export async function GET(request: NextRequest) {
  const me = await whoAmI()
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const base = { configured: pushConfigured(), publicKey: vapidPublicKey(), isOwner: me.isOwner }
  const endpoint = request.nextUrl.searchParams.get('endpoint')
  if (!validEndpoint(endpoint)) return NextResponse.json({ ...base, subscribed: false, prefs: DEFAULT_PREFS })

  const { data, error } = await pushAdmin()
    .from(PUSH_TABLE)
    .select('prefs, dentist_id')
    .eq('endpoint', endpoint)
    .eq('user_email', me.email)
    .maybeSingle()
  if (error) {
    console.error('[push:get]', error.code, error.message)
    return NextResponse.json({ ...base, configured: base.configured && !tableMissing(error), subscribed: false, prefs: DEFAULT_PREFS })
  }
  return NextResponse.json({
    ...base,
    subscribed: !!data && data.dentist_id === me.dentistId,
    prefs: cleanPrefs(data?.prefs),
  })
}

export async function POST(request: NextRequest) {
  const me = await whoAmI()
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const sub = body?.subscription
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!validEndpoint(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const db = pushAdmin()
  // prefs left out on purpose: a new row gets the default (all on) and an
  // existing row keeps the switches the person already set.
  const { error } = await db.from(PUSH_TABLE).upsert({
    endpoint,
    p256dh,
    auth,
    dentist_id: me.dentistId,
    user_email: me.email,
    is_owner: me.isOwner,
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) {
    console.error('[push:post]', error.code, error.message)
    const msg = tableMissing(error) ? 'Alerts are not set up yet on the server.' : 'Could not save. Please try again.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const oldEndpoint = body?.oldEndpoint
  if (validEndpoint(oldEndpoint) && oldEndpoint !== endpoint) {
    await db.from(PUSH_TABLE).delete().eq('endpoint', oldEndpoint).eq('user_email', me.email)
  }
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const me = await whoAmI()
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!validEndpoint(body?.endpoint)) return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })

  const prefs = cleanPrefs(body?.prefs)
  const { data, error } = await pushAdmin()
    .from(PUSH_TABLE)
    .update({ prefs })
    .eq('endpoint', body.endpoint)
    .eq('user_email', me.email)
    .select('id')
  if (error) {
    console.error('[push:patch]', error.code, error.message)
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  }
  if (!data || data.length === 0) return NextResponse.json({ error: 'Alerts are off on this phone.' }, { status: 404 })
  return NextResponse.json({ success: true, prefs })
}

export async function DELETE(request: NextRequest) {
  const me = await whoAmI()
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!validEndpoint(body?.endpoint)) return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })

  const { error } = await pushAdmin()
    .from(PUSH_TABLE)
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('user_email', me.email)
  if (error) {
    console.error('[push:delete]', error.code, error.message)
    return NextResponse.json({ error: 'Could not turn off. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
