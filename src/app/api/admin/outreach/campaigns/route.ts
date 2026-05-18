// Campaign CRUD for the Outreach tab.
//
//   GET    → list campaigns (newest first)
//   POST   → create a draft campaign with subject/body/city
//   DELETE → ?id=<uuid> removes a campaign and clears its campaign_id from
//            contacts. Counts on the contact rows are preserved.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function adminGate() {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return null
  const db = admin()
  const { data: row } = await db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  return row ? user.email : null
}

export async function GET() {
  const ok = await adminGate()
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data, error } = await db
    .from('outreach_campaigns')
    .select('id, name, city, subject, body, total_contacts, sent_count, open_count, click_count, registration_count, status, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    console.error('[outreach/campaigns GET] failed', error)
    return NextResponse.json({ error: error.message, campaigns: [] }, { status: 500 })
  }
  return NextResponse.json({ campaigns: data ?? [] })
}

export async function POST(request: NextRequest) {
  const ok = await adminGate()
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const messageBody = typeof body.body === 'string' ? body.body.trim() : ''
  const city = typeof body.city === 'string' && body.city ? body.city : null

  if (!name)       return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!subject)    return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (!messageBody) return NextResponse.json({ error: 'Body is required' }, { status: 400 })

  const db = admin()

  // total_contacts is the pending audience at draft time. We refresh it on
  // send because admins commonly upload more rows between drafting and
  // sending — the number shown in the campaign list shouldn't go stale.
  let total = 0
  if (city) {
    const { count } = await db
      .from('outreach_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('city', city)
      .eq('status', 'pending')
    total = count || 0
  } else {
    const { count } = await db
      .from('outreach_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    total = count || 0
  }

  const { data, error } = await db
    .from('outreach_campaigns')
    .insert({ name, city, subject, body: messageBody, total_contacts: total, status: 'draft' })
    .select('*')
    .single()
  if (error) {
    console.error('[outreach/campaigns POST] failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ campaign: data })
}

export async function DELETE(request: NextRequest) {
  const ok = await adminGate()
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = admin()
  await db.from('outreach_contacts').update({ campaign_id: null }).eq('campaign_id', id)
  const { error } = await db.from('outreach_campaigns').delete().eq('id', id)
  if (error) {
    console.error('[outreach/campaigns DELETE] failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
