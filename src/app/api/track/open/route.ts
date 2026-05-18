// 1x1 transparent GIF that records an email open against a contact + campaign.
// Cache headers are set to disable every layer of caching we can name so a
// reopen counts.
//
//   GET /api/track/open?id=<contact_id>&campaign=<campaign_id>
//
// Status walks pending → sent → opened → clicked → registered. A contact in
// 'clicked' or 'registered' state shouldn't downgrade — only fresh "sent"
// rows flip to "opened".
import { NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const campaign = url.searchParams.get('campaign')

  if (id && campaign) {
    // Fire-and-forget — we still want to return the pixel even if the DB
    // write fails (e.g. the row was deleted by a bulk delete). The admin
    // sees no degraded UX from a hiccup here.
    void recordOpen(id, campaign).catch(err => {
      console.error('[track/open] update failed', err)
    })
  }

  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}

async function recordOpen(contactId: string, campaignId: string) {
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: contact } = await db
    .from('outreach_contacts')
    .select('id, status, opened_at')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return

  const updates: Record<string, unknown> = {}
  // Only stamp opened_at the first time. Re-opens don't bump the campaign
  // counter; they just refresh the contact-level timestamp for the dashboard.
  if (!contact.opened_at) {
    updates.opened_at = new Date().toISOString()
  }
  if (contact.status === 'sent') {
    updates.status = 'opened'
  }
  if (Object.keys(updates).length > 0) {
    await db.from('outreach_contacts').update(updates).eq('id', contactId)
  }

  // Bump the campaign counter only on the first open per contact, regardless
  // of whether the contact had already advanced to clicked/registered (in
  // which case opened_at can be backfilled).
  if (!contact.opened_at) {
    const { data: campaign } = await db
      .from('outreach_campaigns')
      .select('id, open_count')
      .eq('id', campaignId)
      .maybeSingle()
    if (campaign) {
      await db
        .from('outreach_campaigns')
        .update({ open_count: (campaign.open_count || 0) + 1 })
        .eq('id', campaignId)
    }
  }
}
