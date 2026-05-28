// POST /api/onboard — claim-your-listing flow for Google sign-ins that
// don't yet have a dentists row.
//
// The auth callback at src/app/auth/callback/route.ts redirects unrecognised
// city-host logins here. Name + email come from the Google profile; this
// endpoint just collects the three fields we can't infer (clinic_name,
// phone, area) and writes the dentist + audit rows. No auth.users
// creation, no password — the dentist is already signed in.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'

const ADMIN_WHATSAPP = '917719903232'

function normalizeCity(v: unknown): CitySlug {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? (v as CitySlug) : DEFAULT_CITY
}

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM-DR-'
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin
  function notifyAdmin(msg: string) {
    fetch(`${origin}/api/notifications/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    }).catch(err => console.error('[onboard] admin whatsapp failed', err))
  }

  try {
    // Authn — the user must already have a Supabase session from the
    // Google OAuth round-trip. We trust the email from the session, NOT
    // from the request body, so a stale tab can't claim someone else's
    // listing.
    const cookieSupabase = await createCookieClient()
    const { data: { user } } = await cookieSupabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    const email = user.email.toLowerCase()
    const name =
      (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
      (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
      email.split('@')[0]

    const body = await request.json()
    const clinic_name = typeof body.clinic_name === 'string' ? body.clinic_name.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const area = typeof body.area === 'string' ? body.area.trim() : ''
    const rawAreaName = typeof body.area_name_raw === 'string' ? body.area_name_raw.trim() : ''
    const area_name_raw = rawAreaName.length > 0 ? rawAreaName : null
    const cityValue: CitySlug = normalizeCity(body.city)

    if (!clinic_name || !phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!area && !area_name_raw) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit phone number.' }, { status: 400 })
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Race guard. The user might have opened /onboard in two tabs and
    // double-submitted, or arrived after a previous successful onboard
    // session. Either way, an existing dentists row means we're done —
    // redirect them to the dashboard instead of double-inserting.
    const { data: existing } = await admin
      .from('dentists')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ success: true, redirect: '/for-dentists/dashboard' })
    }

    // Resolve area_id: exact → case-insensitive → auto-create. Same
    // pattern as /api/registrations so a freshly-typed "Other" area
    // becomes curated for the next dentist in this city.
    const wantedAreaName = area || area_name_raw || ''
    let area_id: string | null = null
    if (wantedAreaName) {
      const { data: areaExact } = await admin.from('areas').select('id').eq('name', wantedAreaName).maybeSingle()
      if (areaExact) {
        area_id = areaExact.id
      } else {
        const { data: areaCi } = await admin.from('areas').select('id').ilike('name', wantedAreaName).maybeSingle()
        if (areaCi) {
          area_id = areaCi.id
        } else {
          const { data: newArea, error: areaErr } = await admin
            .from('areas')
            .insert({ name: wantedAreaName, slug: slugify(wantedAreaName), zone: 'Other', city: cityValue })
            .select('id')
            .single()
          if (areaErr) {
            console.error('[onboard] area auto-create failed — proceeding with area_id=null', areaErr)
          } else if (newArea) {
            area_id = newArea.id
          }
        }
      }
    }

    // Unique slug for the public profile URL.
    const baseSlug = slugify(clinic_name || name) || 'dentist'
    let slug = baseSlug
    for (let i = 2; i <= 20; i++) {
      const { data: clash } = await admin.from('dentists').select('id').eq('slug', slug).maybeSingle()
      if (!clash) break
      slug = `${baseSlug}-${i}`
    }

    const { error: dentErr } = await admin
      .from('dentists')
      .insert({
        email,
        name,
        clinic_name,
        phone,
        qualifications: '',
        mci_number: '',
        area_id,
        slug,
        address: '',
        sub_area: '',
        bio: '',
        website: '',
        is_active: true,
        is_verified: false,
        tier: 'free',
        trial_started_at: new Date().toISOString(),
        city: cityValue,
      })
    if (dentErr) {
      console.error('[onboard] dentist insert failed', dentErr)
      Sentry.captureException(dentErr, {
        tags: { area: 'onboard-dentist-insert' },
        extra: { email, city: cityValue, slug },
      })
      return NextResponse.json({ error: 'Could not create profile', detail: dentErr.message }, { status: 500 })
    }

    // Audit row in dentist_registrations so the admin panel surfaces
    // every onboarded dentist. Pre-stamped approved + auto_approved
    // because there's no human review step.
    let ref_no = generateRef()
    for (let i = 0; i < 5; i++) {
      const { data: refCheck } = await admin.from('dentist_registrations').select('id').eq('ref_no', ref_no).maybeSingle()
      if (!refCheck) break
      ref_no = generateRef()
    }
    const { error: regErr } = await admin
      .from('dentist_registrations')
      .insert({
        ref_no,
        name,
        phone,
        email,
        clinic_name,
        area,
        area_name_raw,
        qualification: '',
        mci_registration: '',
        city: cityValue,
        status: 'approved',
        auto_approved: true,
      })
    if (regErr) {
      console.error('[onboard] registration audit insert failed', regErr)
      Sentry.captureException(regErr, {
        tags: { area: 'onboard-audit-insert' },
        extra: { email, city: cityValue, ref_no },
      })
    }

    // Outreach attribution — same best-effort attribution as /api/registrations.
    try {
      const { data: contact } = await admin
        .from('outreach_contacts')
        .select('id, campaign_id, registered_at')
        .eq('email', email)
        .maybeSingle()
      if (contact && !contact.registered_at) {
        await admin
          .from('outreach_contacts')
          .update({ status: 'registered', registered_at: new Date().toISOString() })
          .eq('id', contact.id)
        if (contact.campaign_id) {
          const { data: campaign } = await admin
            .from('outreach_campaigns')
            .select('id, registration_count')
            .eq('id', contact.campaign_id)
            .maybeSingle()
          if (campaign) {
            await admin
              .from('outreach_campaigns')
              .update({ registration_count: (campaign.registration_count || 0) + 1 })
              .eq('id', campaign.id)
          }
        }
      }
    } catch (err) {
      console.error('[onboard] outreach attribution skipped:', err)
    }

    const areaForDisplay = area || area_name_raw || ''
    notifyAdmin(`✅ New Onboard (Google): ${name} (${clinic_name}, ${areaForDisplay}) from ${cityValue} — ${ref_no}`)

    return NextResponse.json({
      success: true,
      redirect: '/for-dentists/dashboard',
      slug,
    })
  } catch (error: any) {
    console.error('Onboard error:', error)
    Sentry.captureException(error)
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
  }
}
