// Send one 50-recipient batch for a campaign. The Outreach tab polls this
// route in a loop until the campaign's status flips to 'sent', which gives
// us "50 emails per minute" pacing without needing a background queue.
//
//   POST { campaign_id, batch_size? }  → send the next batch of pending
//                                        contacts (default 50)
//   POST { campaign_id, action: 'pause' | 'resume' }
//                                      → flip the campaign status only
//
// Resend Pro is rated at ~10 req/sec. 50 sends in parallel would burst; we
// throttle inside the route to ≤10/sec by chunking the batch and pausing 1s
// between chunks.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { renderOutreachTemplate, sendOutreachEmail } from '@/lib/outreach'
import { CITY_CONFIGS, type CitySlug } from '@/config/cities'

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

function originFromCity(slug: string | null): string {
  if (slug && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, slug)) {
    return `https://${CITY_CONFIGS[slug as CitySlug].domain}`
  }
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (publicUrl) return publicUrl.replace(/\/$/, '')
  return `https://${CITY_CONFIGS.mumbai.domain}`
}

export async function POST(request: NextRequest) {
  const ok = await adminGate()
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await request.json().catch(() => ({} as Record<string, unknown>))
  const campaign_id = typeof payload.campaign_id === 'string' ? payload.campaign_id : ''
  if (!campaign_id) return NextResponse.json({ error: 'Missing campaign_id' }, { status: 400 })

  const action = typeof payload.action === 'string' ? payload.action : null
  const batchSize = Math.min(Math.max(parseInt(String(payload.batch_size ?? 50), 10) || 50, 1), 200)

  const db = admin()

  if (action === 'pause' || action === 'resume') {
    const nextStatus = action === 'pause' ? 'paused' : 'sending'
    const { error } = await db
      .from('outreach_campaigns')
      .update({ status: nextStatus })
      .eq('id', campaign_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: nextStatus })
  }

  const { data: campaign, error: cErr } = await db
    .from('outreach_campaigns')
    .select('*')
    .eq('id', campaign_id)
    .maybeSingle()
  if (cErr || !campaign) {
    return NextResponse.json({ error: cErr?.message || 'Campaign not found' }, { status: 404 })
  }
  if (campaign.status === 'paused') {
    return NextResponse.json({ paused: true, status: 'paused', sent_in_batch: 0 })
  }
  if (campaign.status === 'sent') {
    return NextResponse.json({ done: true, status: 'sent', sent_in_batch: 0 })
  }

  if (campaign.status === 'draft') {
    await db.from('outreach_campaigns').update({ status: 'sending' }).eq('id', campaign_id)
  }

  // Pick the next batch of pending contacts. campaign.city = null means
  // "all cities" — no .eq filter applied.
  let q = db
    .from('outreach_contacts')
    .select('id, name, clinic_name, email, city')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize)
  if (campaign.city) q = q.eq('city', campaign.city)
  const { data: batch, error: bErr } = await q
  if (bErr) {
    console.error('[outreach/campaigns/send] batch fetch failed', bErr)
    return NextResponse.json({ error: bErr.message }, { status: 500 })
  }

  if (!batch || batch.length === 0) {
    await db
      .from('outreach_campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaign_id)
    return NextResponse.json({ done: true, status: 'sent', sent_in_batch: 0 })
  }

  const origin = originFromCity(campaign.city)
  const RESEND_CHUNK = 10
  const RESEND_DELAY_MS = 1000

  let sentNow = 0
  let failedNow = 0

  for (let i = 0; i < batch.length; i += RESEND_CHUNK) {
    const chunk = batch.slice(i, i + RESEND_CHUNK)
    const results = await Promise.allSettled(
      chunk.map(async (c) => {
        const ctx = { name: c.name, clinic_name: c.clinic_name, city: c.city || campaign.city, email: c.email }
        const subject = renderOutreachTemplate(campaign.subject, ctx)
        const body    = renderOutreachTemplate(campaign.body, ctx)
        await sendOutreachEmail({
          to_email: c.email,
          contact_id: c.id,
          campaign_id: campaign.id,
          subject,
          body,
          city: c.city || campaign.city,
          origin,
        })
        await db
          .from('outreach_contacts')
          .update({ status: 'sent', sent_at: new Date().toISOString(), campaign_id: campaign.id })
          .eq('id', c.id)
        return c.id
      }),
    )
    sentNow   += results.filter(r => r.status === 'fulfilled').length
    failedNow += results.filter(r => r.status === 'rejected').length

    const firstReject = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
    if (firstReject) {
      console.error('[outreach/campaigns/send] resend chunk had failures', { campaign_id, count: failedNow, reason: firstReject.reason })
    }

    if (i + RESEND_CHUNK < batch.length) {
      await new Promise(resolve => setTimeout(resolve, RESEND_DELAY_MS))
    }
  }

  if (sentNow > 0) {
    await db
      .from('outreach_campaigns')
      .update({ sent_count: (campaign.sent_count || 0) + sentNow })
      .eq('id', campaign_id)
  }

  let finalStatus = 'sending'
  if (batch.length < batchSize) {
    await db
      .from('outreach_campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaign_id)
    finalStatus = 'sent'
  }

  return NextResponse.json({
    sent_in_batch: sentNow,
    failed_in_batch: failedNow,
    status: finalStatus,
  })
}
