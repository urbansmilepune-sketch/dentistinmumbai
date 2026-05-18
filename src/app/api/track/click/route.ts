// Tracks a click against a contact + campaign and 302s to the original URL.
//
//   GET /api/track/click?contact_id=<uuid>&campaign_id=<uuid>&url=<dest>
//
// We allow ANY redirect target — the body builder controls the URL pool, the
// admin is the only one writing it, and the link is opaque to the recipient.
// If we ever expose this surface to user-provided URLs we'd need an
// origin allowlist to avoid open-redirect liability.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const u = new URL(request.url)
  const contactId = u.searchParams.get('contact_id')
  const campaignId = u.searchParams.get('campaign_id')
  const target = u.searchParams.get('url') || '/'

  if (contactId && campaignId) {
    try {
      await recordClick(contactId, campaignId)
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
    .select('id, clicked_at, opened_at')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return

  const firstClick = !contact.clicked_at
  if (firstClick) {
    const patch: Record<string, unknown> = { clicked_at: new Date().toISOString() }
    // A click without a recorded open is fine (some clients pre-fetch images
    // and the pixel may not have fired). Backfill opened_at so the funnel
    // stays consistent.
    if (!contact.opened_at) patch.opened_at = new Date().toISOString()
    await db.from('outreach_contacts').update(patch).eq('id', contactId)

    const { data: campaign } = await db
      .from('outreach_campaigns')
      .select('id, click_count, open_count')
      .eq('id', campaignId)
      .maybeSingle()
    if (campaign) {
      const cPatch: Record<string, unknown> = { click_count: (campaign.click_count || 0) + 1 }
      if (!contact.opened_at) cPatch.open_count = (campaign.open_count || 0) + 1
      await db.from('outreach_campaigns').update(cPatch).eq('id', campaignId)
    }
  }
}
