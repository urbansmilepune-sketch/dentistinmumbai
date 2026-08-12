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
// State Dental Council / qualification fields are NOT collected here — the dentist fills
// them in on the profile editor later, and an admin grants the verified
// badge after credential review.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { seedUniversalTreatments } from '@/lib/seedTreatments'
import { sendAdminNewRegistrationAlert } from '@/lib/email'
import {
  honeypotTripped,
  validateHumanName,
  validateClinicName,
  normalizeIndianMobile,
  withinRateLimit,
  clientIp,
} from '@/lib/registrationGuards'

const ADMIN_WHATSAPP = '917719013232'

function normalizeCity(v: unknown): CitySlug {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? (v as CitySlug) : DEFAULT_CITY
}

// Detects a PostgREST "unknown column" error (PGRST204) so the insert can
// be retried without the referral column on databases where the migration
// (supabase/migrations/..._referral_ref_code.sql) hasn't been applied yet.
// Schema is managed out-of-band here, so the code must degrade gracefully
// rather than 500 the whole signup.
function isMissingColumn(err: { code?: string; message?: string } | null, column: string): boolean {
  if (!err) return false
  if (err.code === 'PGRST204') return true
  const msg = (err.message || '').toLowerCase()
  return msg.includes(column.toLowerCase()) && msg.includes('column')
}

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM-DR-'
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

// Looks up a single auth.users row by email. supabase-js `listUsers()` only
// pages — it has no email filter — so scanning would be O(all users) on every
// signup. GoTrue's admin endpoint does accept ?filter=, which substring-matches
// on email; we exact-match the result ourselves. Returns null on any failure so
// a GoTrue hiccup degrades to the old create-and-catch path rather than
// blocking the signup.
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=50&filter=${encodeURIComponent(email)}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { users?: { id: string; email?: string }[] }
    const hit = (body.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase())
    return hit ? { id: hit.id } : null
  } catch (err) {
    console.error('[registrations] auth.users lookup failed', err)
    return null
  }
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

    // ── Anti-spam gate ───────────────────────────────────────────────────
    // Honeypot: reject silently (success-shaped 200 with no redirect / no
    // rows created) so a form-filling bot believes it succeeded.
    if (honeypotTripped(body)) {
      return NextResponse.json({ success: true })
    }
    // Rate limit: max 3 registration attempts per IP per hour.
    if (!withinRateLimit(`registrations:${clientIp(request)}`)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 },
      )
    }

    const { name, clinic_name, area, selected_plan, city } = body
    const phone = normalizeIndianMobile(body.phone)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    emailForAlert = email || undefined
    const rawAreaName = typeof body.area_name_raw === 'string' ? body.area_name_raw.trim() : null
    const area_name_raw = rawAreaName && rawAreaName.length > 0 ? rawAreaName : null
    // Referral code from the ?ref=<code> link on the registration page.
    // Normalised to uppercase (codes are case-insensitive) and length-capped.
    const rawRef = typeof body.ref === 'string' ? body.ref.trim().toUpperCase().slice(0, 64) : ''
    const refCode: string | null = rawRef.length > 0 ? rawRef : null
    const founding_number = Math.min(1000, Math.max(1, Math.floor(Number(body.founding_number)) || 1))
    const chosenPassword = typeof body.password === 'string' ? body.password : ''
    if (chosenPassword.length < 8) {
      return NextResponse.json({ error: 'Password is required (min 8 characters).' }, { status: 400 })
    }

    if (!name || !email || !clinic_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 })
    }
    if (typeof name !== 'string' || typeof clinic_name !== 'string') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const nameErr = validateHumanName(name)
    if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 })
    const clinicErr = validateClinicName(clinic_name)
    if (clinicErr) return NextResponse.json({ error: clinicErr }, { status: 400 })
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

    // The three checks above never looked at auth.users, so a signup whose
    // auth row was created and whose dentists insert then failed left an
    // orphan that passed dedupe and died on createUser — 15 dentists were
    // locked out this way, unable to register AND unable to use the product.
    //
    // Resolve it here instead. An auth row with no dentists / staff / patient /
    // admin record attached is a dead artifact of a failed signup: adopt it
    // (reset the password to the one just submitted, skip createUser) and let
    // the flow continue into the dentists insert. If the email owns ANY other
    // record, adopting would hand over a live account, so refuse and send them
    // to sign-in instead.
    const existingAuthUser = await findAuthUserByEmail(email)
    let adoptedExistingAuthUser = false
    let authUserId: string | null = null

    if (existingAuthUser) {
      const [staffRow, patientRow, adminRow] = await Promise.all([
        admin.from('clinic_staff').select('id').ilike('email', email).maybeSingle(),
        admin.from('patients').select('id').ilike('email', email).maybeSingle(),
        admin.from('admin_users').select('id').ilike('email', email).maybeSingle(),
      ])
      if (staffRow.data || patientRow.data || adminRow.data) {
        return NextResponse.json(
          { error: 'This email is already registered. Please sign in instead — or use "Forgot password" to reset it.', code: 'email_exists' },
          { status: 409 },
        )
      }
      const { error: adoptErr } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
        password: chosenPassword,
        email_confirm: true,
        user_metadata: { full_name: name },
      })
      if (adoptErr) {
        console.error('[registrations] failed to adopt orphaned auth user', existingAuthUser.id, adoptErr)
        Sentry.captureException(adoptErr, {
          tags: { area: 'registration-auth-adopt' },
          extra: { email, city: cityValue },
        })
        return NextResponse.json(
          { error: 'This email is already registered. Please sign in instead — or use "Forgot password" to reset it.', code: 'email_exists' },
          { status: 409 },
        )
      }
      adoptedExistingAuthUser = true
      authUserId = existingAuthUser.id
      console.warn('[registrations] adopted orphaned auth user', existingAuthUser.id, email)
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
      // Scope to this city and take the first match rather than .maybeSingle()
      // — some names are duplicated within a city (e.g. two "Pimple Saudagar"
      // rows in Pune), and maybeSingle() ERRORS on >1 row, which used to drop
      // area_id to null. limit(1) picks a valid area instead of failing.
      const { data: areaExactRows } = await admin
        .from('areas').select('id').eq('name', wantedAreaName).eq('city', cityValue).limit(1)
      const areaExact = areaExactRows?.[0]
      if (areaExact) {
        area_id = areaExact.id
      } else {
        const { data: areaCiRows } = await admin
          .from('areas').select('id').ilike('name', wantedAreaName).eq('city', cityValue).limit(1)
        const areaCi = areaCiRows?.[0]
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
    // Skipped when we adopted an orphaned auth row above — that row already
    // carries this password, so the signInWithPassword below works either way.
    const password = chosenPassword
    const { data: created, error: signupErr } = adoptedExistingAuthUser
      ? { data: null, error: null }
      : await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: name },
        })
    if (!adoptedExistingAuthUser && (signupErr || !created?.user)) {
      console.error('[registrations] auth user create failed', signupErr)
      Sentry.captureException(signupErr || new Error('createUser returned no user'), {
        tags: { area: 'registration-auth-create' },
        extra: { email, city: cityValue },
      })
      const authMsg = signupErr?.message || ''
      // Email already in auth.users. The dedupe above already proved there's
      // no dentists / dentist_registrations row for this email, so this is
      // either an orphaned auth row from a prior half-finished signup or an
      // account registered elsewhere — in both cases signing in is the path
      // forward (a support ping if the profile is missing).
      const alreadyExists =
        (signupErr as { code?: string })?.code === 'email_exists' ||
        signupErr?.status === 422 ||
        /already.*(registered|exists)/i.test(authMsg)
      if (alreadyExists) {
        return NextResponse.json(
          { error: 'This email is already registered. Please sign in instead — or use "Forgot password" to reset it.', code: 'email_exists' },
          { status: 409 },
        )
      }
      // Weak password, auth rate limit, etc. — surface the real reason so the
      // dentist (and our logs) see something better than a generic failure.
      return NextResponse.json(
        { error: authMsg ? `Could not create account: ${authMsg}` : 'Could not create account. Please try again in a moment.', detail: authMsg },
        { status: 500 },
      )
    }
    if (created?.user) authUserId = created.user.id

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
    // (State Dental Council) is still gated by the admin. Qualifications and State Dental Council
    // number stay empty — the dentist fills them in on the profile editor.
    const dentistRow = {
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
    }
    // Attach the referrer when present. If the `ref` column hasn't been added
    // to this database yet, retry without it so signups never break.
    // Cast past the generated types: `ref` lives in the live DB once the
    // referral migration is applied, but the out-of-band type definitions
    // don't know about it yet.
    let { data: dentRow, error: dentErr } = await admin
      .from('dentists')
      .insert((refCode ? { ...dentistRow, ref: refCode } : dentistRow) as typeof dentistRow)
      .select('id')
      .single()
    if (dentErr && refCode && isMissingColumn(dentErr, 'ref')) {
      console.warn('[registrations] dentists.ref column missing — run the referral migration; inserting without it')
      ;({ data: dentRow, error: dentErr } = await admin
        .from('dentists')
        .insert(dentistRow)
        .select('id')
        .single())
    }
    if (dentErr || !dentRow) {
      console.error('[registrations] dentist insert failed', dentErr)
      Sentry.captureException(dentErr || new Error('dentist insert returned no row'), {
        tags: { area: 'registration-dentist-insert' },
        extra: { email, city: cityValue, slug },
      })
      // Roll back the auth user so a retry can succeed. Must be AWAITED: on
      // serverless the response is sent and the function frozen the instant we
      // return, so a fire-and-forget delete never runs — that's exactly what
      // orphaned z.sheth.zs@gmail.com and blocked her re-registration with a
      // misleading "Could not create account". Awaiting keeps auth.users clean.
      // Only roll back an auth row WE created. An adopted row predates this
      // request, so deleting it would destroy an account we merely borrowed —
      // leave it and let the dentist retry.
      if (!adoptedExistingAuthUser && authUserId) {
        await admin.auth.admin.deleteUser(authUserId).catch(err =>
          console.error('[registrations] auth rollback failed — orphaned auth user', authUserId, err),
        )
      }
      return NextResponse.json({ error: 'Could not create profile', detail: dentErr?.message }, { status: 500 })
    }

    // Auto-seed the universal treatments so the profile and city treatment
    // pages aren't empty on day one. Instant-on signup skips the admin
    // approval path, so we seed here. Best-effort + idempotent; never throws.
    await seedUniversalTreatments(admin, dentRow.id, '[registrations]')

    // dentist_registrations row — audit trail only. We pre-stamp it
    // approved + auto_approved so the admin panel surfaces every signup
    // without prompting for review.
    const registrationRow = {
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
    }
    // ref_code = who referred this dentist (distinct from ref_no, the
    // dentist's own generated code). Retry without it if the column is
    // missing so the audit row is still written.
    let { error: regErr } = await admin
      .from('dentist_registrations')
      .insert((refCode ? { ...registrationRow, ref_code: refCode } : registrationRow) as typeof registrationRow)
    if (regErr && refCode && isMissingColumn(regErr, 'ref_code')) {
      console.warn('[registrations] dentist_registrations.ref_code column missing — run the referral migration; inserting without it')
      ;({ error: regErr } = await admin
        .from('dentist_registrations')
        .insert(registrationRow))
    }
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
    const { data: signInData, error: signInErr } = await cookieSupabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      console.error('[registrations] signInWithPassword failed', signInErr)
      Sentry.captureException(signInErr, {
        tags: { area: 'registration-signin' },
        extra: { email, city: cityValue },
      })
    }

    // Admin ping — same wa.me click-to-chat pattern the old flow used.
    const areaForDisplay = (area && area.trim()) || (area_name_raw || '')
    notifyAdmin(`✅ New Registration: ${name} (${clinic_name}, ${areaForDisplay}) from ${cityValue} — ${ref_no}`)

    // Admin email alert — best-effort; the function swallows its own errors
    // and .catch() is a second layer so a Resend hiccup never breaks signup.
    await sendAdminNewRegistrationAlert({
      dentistName: name,
      clinicName: clinic_name,
      city: CITY_CONFIGS[cityValue].cityName,
      area: areaForDisplay,
      phone,
      email,
      refNo: ref_no,
    }).catch(console.error)

    return NextResponse.json({
      success: true,
      redirect: '/for-dentists/dashboard',
      ref_no,
      slug,
      // Return access/refresh tokens so the client can call setSession()
      // which triggers the browser's built-in "save password" prompt.
      session: signInData?.session
        ? { access_token: signInData.session.access_token, refresh_token: signInData.session.refresh_token }
        : null,
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    Sentry.captureException(error)
    notifyAdmin(`🚨 Registration FAILED for ${emailForAlert ?? 'unknown email'} — Error: ${error?.message ?? 'unknown'}`)
    return NextResponse.json({ error: 'Failed to submit registration' }, { status: 500 })
  }
}
