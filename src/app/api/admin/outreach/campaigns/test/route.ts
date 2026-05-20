// Send a single test email for a campaign to an arbitrary address, with
// placeholder values substituted in for {name}/{clinic_name}/{city}. Lets
// the admin eyeball the rendered HTML before triggering a real batch send.
//
//   POST { campaign_id, test_email } → { success: true }
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { sendOutreachEmail } from '@/lib/outreach'
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
  const test_email  = typeof payload.test_email === 'string' ? payload.test_email.trim() : ''
  if (!campaign_id || !test_email) {
    return NextResponse.json({ error: 'Missing campaign_id or test_email' }, { status: 400 })
  }

  const db = admin()
  const { data: campaign, error: cErr } = await db
    .from('outreach_campaigns')
    .select('*')
    .eq('id', campaign_id)
    .maybeSingle()
  if (cErr || !campaign) {
    return NextResponse.json({ error: cErr?.message || 'Campaign not found' }, { status: 404 })
  }

  // Placeholder substitution values for the test. We always render against
  // Mumbai so the from-address and links resolve to a verified domain even
  // when the campaign targets a city whose sender hasn't been DKIM-verified.
  const origin = originFromCity('mumbai')

  try {
    await sendOutreachEmail({
      to_email: test_email,
      to_name: 'Doctor',
      clinic_name: 'Your Clinic',
      contact_id: 'test',
      campaign_id: campaign.id,
      subject: campaign.subject,
      body: campaign.body,
      city: 'mumbai',
      origin,
    })
  } catch (e: any) {
    console.error('[outreach/campaigns/test] send failed', e)
    return NextResponse.json({ error: e?.message || 'Send failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
