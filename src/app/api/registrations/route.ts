// POST /api/registrations — the city-domain dentist registration flow.
//
// Reshaped 2026-05: the legacy "pending → admin approves → magic link"
// pipeline was retired in favour of an instant-on signup. A fresh POST
// here now:
//   1. Creates the dentists row immediately (is_active=true,
//      is_verified=false, tier='free') so the clinic appears on the
//      public city directory the moment the form is submitted.
//   2. Creates an auth.users row with an auto-generated password (email
//      auto-confirmed) so the dentist can sign in with email+password
//      later without going through the magic-link flow.
//   3. Signs the dentist in via the cookie-aware server client so the
//      Set-Cookie header on the response puts them straight into the
//      authenticated dashboard.
//   4. Writes a dentist_registrations row (status='approved',
//      auto_approved=true) purely for the admin audit trail.
//
// MCI / qualification fields are NOT collected here — the dentist fills
// them in on the profile editor later, and an admin grants the verified
// badge after credential review.

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

// 24-char URL-safe password. We never surface this to the dentist — they
// reach the dashboard via the cookie set by signInWithPassword, and reset
// via the standard forgot-password flow if they ever sign out.
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin
  function notifyAdmin(msg: string) {
    fetch(`${origin}/api/notifications/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    }).catch(err => console.error('[registrations] admin whatsapp failed', err))
  }

  let emailForAlert: string | undefined

  try {
    const body = await request.json()
    const { name, phone, clinic_name, area, selected_plan, city } = body
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    emailForAlert = email || undefined
    const rawAreaName = typeof body.area_name_raw === 'string' ? body.area_name_raw.trim() : null
    const area_name_raw = rawAreaName && rawAreaName.length > 0 ? rawAreaName : null
    // founding_number is client-supplied — it only drives a cosmetic
    // "Founding Member #N" badge, so never trust the raw value. Coerce to an
    // integer and clamp to 1–1000 so a tampered request can't store junk.
    const founding_number = Math.min(1000, Math.max(1, Math.floor(Number(body.founding_number)) || 1))

    if (!name || !phone || !email || !clinic_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!area && !area_name_raw) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const planValue: 'monthly' | 'annual' | null =
      selected_plan === 'monthly' || selected_plan === 'annual' ? selected_plan : null
    const cityValue: CitySlug = normalizeCity(city)

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Dedupe against both tables. .or() would embed user input into a
    // PostgREST filter string; two scoped eq() calls keep each value
    // strictly as a value. Also check `dentists` because instant-on
    // signups land there directly — a re-submit must not stomp the live
    // row.
    const [phoneCheck, emailCheck, dentistEmailCheck] = await Promise.all([
      admin.from('dentist_registrations').select('id').eq('phone', phone).maybeSingle(),
      admin.from('dentist_registrations').select('id').eq('email', email).maybeSingle(),
      admin.from('dentists').select('id').eq('email', email).maybeSingle(),
    ])
    if (phoneCheck.data || emailCheck.data || dentistEmailCheck.data) {
      return NextResponse.json({ error: 'An account with this phone or email already exists. Try signing in instead.' }, { status: 409 })
    }

    // ref_no collision check — generateRef() is 36^5 so collisions are
    // rare but possible at scale. Retry up to 5 times.
    let ref_no = generateRef()
    for (let i = 0; i < 5; i++) {
      const { data: refCheck } = await admin.from('dentist_registrations').select('id').eq('ref_no', ref_no).maybeSingle()
      if (!refCheck) break
      ref_no = generateRef()
    }

    // Resolve area_id. The dentist may have typed a free-text "Other"
    // value (area is empty, area_name_raw is the typed string) or picked
    // a curated area from the dropdown. We try exact match, then
    // case-insensitive, then auto-create under zone='Other'.
    const wantedAreaName = (area && area.trim()) || (area_name_raw && area_name_raw.trim()) || ''
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
            console.error('[registrations] area auto-create failed — proceeding with area_id=null', areaErr)
          } else if (newArea) {
            area_id = newArea.id
          }
        }
      }
    }

    // Create the auth.users row first so we can roll back the dentist
    // insert if auth fails (the inverse rollback is harder — deleting a
    // newly-created dentists row would also need to undo any FK cascade).
    const password = generatePassword()
    const { data: created, error: signupErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    })
    if (signupErr || !created?.user) {
      console.error('[registrations] auth user create failed', signupErr)
      Sentry.captureException(signupErr || new Error('createUser returned no user'), {
        tags: { area: 'registration-auth-create' },
        extra: { email, city: cityValue },
      })
      return NextResponse.json({ error: 'Could not create account', detail: signupErr?.message }, { status: 500 })
    }

    // Unique slug for the public profile URL.
    const baseSlug = slugify(clinic_name || name) || 'dentist'
    let slug = baseSlug
    for (let i = 2; i <= 20; i++) {
      const { data: clash } = await admin.from('dentists').select('id').eq('slug', slug).maybeSingle()
      if (!clash) break
      slug = `${baseSlug}-${i}`
    }

    // Insert the dentists row. is_active=true so they appear on the city
    // directory immediately; is_verified=false because credential review
    // (MCI / DCI) is still gated by the admin. Qualifications and MCI
    // number stay empty — the dentist fills them in on the profile editor.
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
        selected_plan: planValue,
        city: cityValue,
      })
    if (dentErr) {
      console.error('[registrations] dentist insert failed', dentErr)
      Sentry.captureException(dentErr, {
        tags: { area: 'registration-dentist-insert' },
        extra: { email, city: cityValue, slug },
      })
      // Roll back the auth user so a retry can succeed.
      admin.auth.admin.deleteUser(created.user.id).catch(() => {})
      return NextResponse.json({ error: 'Could not create profile', detail: dentErr.message }, { status: 500 })
    }

    // dentist_registrations row — audit trail only. We pre-stamp it
    // approved + auto_approved so the admin panel surfaces every signup
    // without prompting for review.
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
        founding_number,
        selected_plan: planValue,
        city: cityValue,
        status: 'approved',
        auto_approved: true,
      })
    if (regErr) {
      // Audit row failed but the dentist + auth user are live — don't
      // 500 the signup. Surface to Sentry so we can backfill the row.
      console.error('[registrations] registration audit insert failed', regErr)
      Sentry.captureException(regErr, {
        tags: { area: 'registration-audit-insert' },
        extra: { email, city: cityValue, ref_no },
      })
    }

    // Outreach attribution — if we cold-emailed this dentist previously,
    // bump the campaign's registration_count. Best-effort; never fails
    // the signup.
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
      console.error('[registrations] outreach attribution skipped:', err)
    }

    // Sign the dentist in. The cookie-aware server client writes the
    // Supabase auth cookie onto this response, so the dashboard's server
    // component will resolve a signed-in user on the very next request.
    const cookieSupabase = await createCookieClient()
    const { error: signInErr } = await cookieSupabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      // We created the auth user with this exact password a moment ago,
      // so a failure here is unusual — capture it but still return
      // success: the dentist row + auth user exist and they can sign in
      // manually via the login page. Better than a 500 wiping their
      // progress.
      console.error('[registrations] signInWithPassword failed', signInErr)
      Sentry.captureException(signInErr, {
        tags: { area: 'registration-signin' },
        extra: { email, city: cityValue },
      })
    }

    // Admin ping — same wa.me click-to-chat pattern the old flow used.
    const areaForDisplay = (area && area.trim()) || (area_name_raw || '')
    notifyAdmin(`✅ New Registration: ${name} (${clinic_name}, ${areaForDisplay}) from ${cityValue} — ${ref_no}`)

    return NextResponse.json({
      success: true,
      redirect: '/for-dentists/dashboard',
      ref_no,
      slug,
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    Sentry.captureException(error)
    notifyAdmin(`🚨 Registration FAILED for ${emailForAlert ?? 'unknown email'} — Error: ${error?.message ?? 'unknown'}`)
    return NextResponse.json({ error: 'Failed to submit registration' }, { status: 500 })
  }
}
