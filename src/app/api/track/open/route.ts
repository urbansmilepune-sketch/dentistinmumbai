// 1x1 transparent GIF that records an email open against a contact +
// campaign. Cache headers are set to disable every layer of caching we can
// name so a re-open counts.
//
//   GET /api/track/open?contact_id=<uuid>&campaign_id=<uuid>
//
// The contact's status enum doesn't include "opened" — engagement state is
// captured by opened_at / clicked_at / registered_at timestamps. Only "sent"
// rows have their opened_at stamped (re-opens just refresh the field; the
// campaign open_count only bumps on the first open).
import { NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const contactId = url.searchParams.get('contact_id')
  const campaignId = url.searchParams.get('campaign_id')

  if (contactId && campaignId) {
    void recordOpen(contactId, campaignId).catch(err => {
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
    .select('id, opened_at')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return

  if (!contact.opened_at) {
    await db
      .from('outreach_contacts')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', contactId)

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
