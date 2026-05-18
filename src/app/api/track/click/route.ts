// Tracks a click against a contact + campaign and 302s to the original URL.
//
//   GET /api/track/click?id=<contact_id>&campaign=<campaign_id>&redirect=<url>
//
// We allow ANY redirect target — the body builder controls the URL pool, the
// admin is the only one writing it, and the link is opaque to the recipient.
// If we ever expose this surface to user-provided URLs we'd need an
// origin allowlist to avoid open-redirect liability.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const campaign = url.searchParams.get('campaign')
  const target = url.searchParams.get('redirect') || '/'

  // Fire the update before redirecting — the DB hop is fast, and waiting
  // here protects us from edge runtime "background" promises being killed
  // when the response stream closes.
  if (id && campaign) {
    try {
      await recordClick(id, campaign)
    } catch (err) {
      console.error('[track/click] update failed', err)
    }
  }

  return NextResponse.redirect(target, 302)
}

async function recordClick(contactId: string, campaignId: string) {
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: contact } = await db
    .from('outreach_contacts')
    .select('id, status, clicked_at, opened_at')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return

  const updates: Record<string, unknown> = {}
  const firstClick = !contact.clicked_at
  if (firstClick) {
    updates.clicked_at = new Date().toISOString()
    // A click without a recorded open is fine (some clients pre-fetch images
    // and the pixel may not have fired). Backfill opened_at so the funnel
    // stays consistent.
    if (!contact.opened_at) updates.opened_at = new Date().toISOString()
  }
  // Don't downgrade — registered stays registered.
  if (contact.status === 'sent' || contact.status === 'opened' || contact.status === 'pending') {
    updates.status = 'clicked'
  }
  if (Object.keys(updates).length > 0) {
    await db.from('outreach_contacts').update(updates).eq('id', contactId)
  }

  if (firstClick) {
    const { data: campaign } = await db
      .from('outreach_campaigns')
      .select('id, click_count, open_count')
      .eq('id', campaignId)
      .maybeSingle()
    if (campaign) {
      const patch: Record<string, unknown> = { click_count: (campaign.click_count || 0) + 1 }
      // If the contact never had a recorded open, count this as an open too.
      if (!contact.opened_at) patch.open_count = (campaign.open_count || 0) + 1
      await db.from('outreach_campaigns').update(patch).eq('id', campaignId)
    }
  }
}
