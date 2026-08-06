// POST /api/india/register — unified registration for the
// dentistinindia.in/join LinkedIn-style flow.
//
// Differs from the city /api/registrations flow on three key points:
//   1. Creates the auth.users row immediately (admin.createUser with
//      email_confirm = true), so the dentist can sign in with their
//      password right away — no magic-link round-trip.
//   2. Creates the dentists row at the same time (is_active = true,
//      is_verified = false) so the dentist is LIVE on both the
//      national directory AND their city site instantly. The
//      "verified" badge gets granted later by an admin.
//   3. Still writes a dentist_registrations row (status = approved,
//      auto_approved = true) so the existing admin Registrations tab
//      surfaces every join — both for tracking and for the verified
//      flag flip.
//
// The pivot from "moderate-then-publish" to "publish-then-verify"
// is intentional: the product positioning is a professional network,
// not a directory. Quality control on user-generated content is
// handled separately by the case-moderation flow (Phase 1a).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, type CitySlug, NATIONAL_HOST } from '@/config/cities'
import { NATIONAL_FROM_EMAIL } from '@/lib/email'
import {
  honeypotTripped,
  validateHumanName,
  validateClinicName,
  normalizeIndianMobile,
  linkedinLooksFake,
  withinRateLimit,
  clientIp,
} from '@/lib/registrationGuards'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ADMIN_WHATSAPP = '917719013232'

const SPECIALIZATIONS = new Set([
  'General Dentist',
  'Orthodontist',
  'Implantologist',
  'Endodontist',
  'Periodontist',
  'Oral Surgeon',
  'Pedodontist',
  'Prosthodontist',
  'Cosmetic Dentist',
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cap(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
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

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || 'dentist'
  for (let i = 2; i <= 20; i++) {
    const { data: clash } = await admin.from('dentists').select('id').eq('slug', slug).maybeSingle()
    if (!clash) return slug
    slug = `${base || 'dentist'}-${i}`
  }
  return `${base || 'dentist'}-${Date.now()}`
}

export async function POST(request: NextRequest) {
  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // ── Anti-spam gate ─────────────────────────────────────────────────────
  // Honeypot: a bot that filled the CSS-hidden "website" field. Reject
  // SILENTLY — return a success-shaped 200 so the bot believes it worked and
  // moves on instead of adapting. Nothing is created.
  if (honeypotTripped(payload)) {
    return NextResponse.json({ success: true, message: 'Profile created.' })
  }
  // Rate limit: max 3 registration attempts per IP per hour.
  if (!withinRateLimit(`india-register:${clientIp(request)}`)) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please try again later.' },
      { status: 429 },
    )
  }

  // ── Validation ────────────────────────────────────────────────────────
  const name        = cap(payload.name, 120)
  const email       = cap(payload.email, 200)?.toLowerCase()
  const phone       = normalizeIndianMobile(payload.phone)
  const password    = typeof payload.password === 'string' ? payload.password : ''
  const specialization = cap(payload.specialization, 60)
  const citySlug    = typeof payload.city === 'string' ? payload.city.trim() : ''
  const clinicName  = cap(payload.clinic_name, 200)
  const experience  = intInRange(payload.experience_years, 0, 80)
  const mci         = cap(payload.mci_registration, 60)
  const linkedinUrl = cap(payload.linkedin_url, 300)

  if (!name)                                            return NextResponse.json({ error: 'Full name required' }, { status: 400 })
  const nameErr = validateHumanName(name)
  if (nameErr)                                          return NextResponse.json({ error: nameErr }, { status: 400 })
  if (!email || !EMAIL_RE.test(email))                  return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  if (!phone)                                           return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 })
  if (linkedinLooksFake(linkedinUrl))                   return NextResponse.json({ error: 'Enter a valid LinkedIn URL, or leave it blank.' }, { status: 400 })
  if (password.length < 8)                              return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  if (!specialization || !SPECIALIZATIONS.has(specialization)) return NextResponse.json({ error: 'Pick a specialization' }, { status: 400 })
  if (!clinicName)                                      return NextResponse.json({ error: 'Clinic name required' }, { status: 400 })
  const clinicErr = validateClinicName(clinicName)
  if (clinicErr)                                        return NextResponse.json({ error: clinicErr }, { status: 400 })
  if (experience === null)                              return NextResponse.json({ error: 'Years of experience required' }, { status: 400 })
  if (!mci)                                             return NextResponse.json({ error: 'State Dental Council registration number required' }, { status: 400 })

  // City: must be one of the 13 live slugs, or the sentinel "other".
  // "other" routes to dentist_registrations with city=null and the
  // dentists row is not created (no city site to host them) — but
  // they still get a national professional profile under city='other'.
  const isKnownCity = Object.prototype.hasOwnProperty.call(CITY_CONFIGS, citySlug)
  const isOtherCity = citySlug === 'other'
  if (!isKnownCity && !isOtherCity) return NextResponse.json({ error: 'Select a valid city' }, { status: 400 })
  const cityForRow: CitySlug | null = isKnownCity ? (citySlug as CitySlug) : null

  // ── Uniqueness ───────────────────────────────────────────────────────
  // Reject if a dentist with this email already exists. We check both
  // tables: an existing dentists row means they're already in the
  // network; an existing pending dentist_registrations row means
  // someone hit /join twice.
  const [{ data: dupDentist }, { data: dupReg }] = await Promise.all([
    admin.from('dentists').select('id').eq('email', email).maybeSingle(),
    admin.from('dentist_registrations').select('id').eq('email', email).maybeSingle(),
  ])
  if (dupDentist || dupReg) {
    return NextResponse.json({ error: 'An account with this email already exists. Try signing in instead.' }, { status: 409 })
  }

  // ── Create auth.users (password set, email auto-confirmed) ───────────
  const { data: created, error: signupErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })
  if (signupErr || !created?.user) {
    const authMsg = signupErr?.message || ''
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
    return NextResponse.json(
      { error: authMsg ? `Could not create account: ${authMsg}` : 'Could not create account. Please try again in a moment.', detail: authMsg },
      { status: 500 },
    )
  }

  // ── Insert dentist_registrations row (status approved + auto_approved
  //     so admins know this came via the LinkedIn-style flow) ───────────
  const refNo = `IN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
  const foundingNumber = Math.floor(Math.random() * 1000) + 1
  const { error: regErr } = await admin
    .from('dentist_registrations')
    .insert({
      ref_no: refNo,
      name,
      phone,
      email,
      clinic_name: clinicName,
      area: '',
      qualification: specialization, // city register stuffs degree here; we
                                     // store the specialty + a separate
                                     // specialization column below
      mci_registration: mci,
      city: cityForRow,
      status: 'approved',
      auto_approved: true,
      founding_number: foundingNumber,
      specialization,
      linkedin_url: linkedinUrl,
      experience_years: experience,
    })
  if (regErr) {
    // Roll back the auth user so /join is retry-able. Must be AWAITED —
    // fire-and-forget doesn't run on serverless (function frozen at return),
    // which leaves an orphaned auth.users row that blocks re-registration.
    await admin.auth.admin.deleteUser(created.user.id).catch(err =>
      console.error('[india/register] auth rollback failed — orphaned auth user', created.user.id, err),
    )
    return NextResponse.json({ error: 'Could not save registration', detail: regErr.message }, { status: 500 })
  }

  // ── Insert dentists row (live immediately) ───────────────────────────
  // Skip the dentists row when the dentist picked "Other" city — there's
  // no city homepage to surface them on, and the city column is NOT NULL.
  // They still get a dentist_registrations row, which the admin can move
  // to a real city once we launch one matching theirs.
  let slug: string | null = null
  if (cityForRow) {
    const baseSlug = slugify(clinicName || name) || 'dentist'
    slug = await uniqueSlug(baseSlug)
    const { error: dentErr } = await admin
      .from('dentists')
      .insert({
        email,
        name,
        clinic_name: clinicName,
        phone,
        qualifications: specialization,
        mci_number: mci,
        slug,
        address: '',
        sub_area: '',
        bio: '',
        website: '',
        is_active: true,
        is_verified: false,
        tier: 'free',
        trial_started_at: new Date().toISOString(),
        city: cityForRow,
        experience_years: experience,
        linkedin_url: linkedinUrl,
        specialties: [specialization],
      })
    if (dentErr) {
      // The public-profile insert failed. We previously kept the auth user +
      // registration row and returned partial success — but that stranded an
      // auth.users row AND a dentist_registrations row with NO dentists row,
      // which is exactly the orphan state we had to clean up by hand. Roll
      // both back (in reverse insert order) so /join stays fully retry-able
      // and orphans never accumulate. Must be AWAITED: serverless freezes the
      // function at return, so detached cleanup never runs. Logged with the DB
      // message so a genuine (non-spam) failure is diagnosable next time.
      console.error('[india/register] dentists insert failed — rolling back registration + auth', {
        email, city: cityForRow, slug, detail: dentErr.message,
      })
      const { error: regDelErr } = await admin
        .from('dentist_registrations').delete().eq('ref_no', refNo)
      if (regDelErr) {
        console.error('[india/register] registration rollback failed — orphaned reg row', refNo, regDelErr)
      }
      await admin.auth.admin.deleteUser(created.user.id).catch(err =>
        console.error('[india/register] auth rollback failed — orphaned auth user', created.user.id, err),
      )
      return NextResponse.json(
        { error: 'Could not create your profile. Please try again in a moment.', detail: dentErr.message },
        { status: 500 },
      )
    }
  }

  // ── Welcome email + admin WhatsApp notification (best-effort) ────────
  const cityCfg = cityForRow ? CITY_CONFIGS[cityForRow] : null
  const cityName = cityCfg?.cityName || 'your city'
  const cityDomain = cityCfg?.domain || ''
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (RESEND_KEY) {
    const html = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F1923;">
        <div style="padding: 28px 32px; background: linear-gradient(135deg, #003F7A, #1D4ED8); color: #fff; border-radius: 14px 14px 0 0;">
          <h1 style="font-size: 22px; margin: 0;">Welcome to ${NATIONAL_HOST}</h1>
          <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.85;">India's professional network for dentists</p>
        </div>
        <div style="padding: 28px 32px; background: #fff; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 14px 14px;">
          <p style="font-size: 15px; line-height: 1.6;">Hi Dr. ${name},</p>
          <p style="font-size: 15px; line-height: 1.65; color: #475569;">
            Your profile has been created. Your professional profile on
            <a href="https://${NATIONAL_HOST}/professional/${slug || ''}" style="color: #1D4ED8; font-weight: 600;">dentistinindia.in</a>
            is already live — share clinical cases, follow peers, and build your reputation.
          </p>
          ${cityCfg ? `<p style="font-size: 15px; line-height: 1.65; color: #475569;">You're also listed on <strong>${cityDomain}</strong> as part of our ${cityName} directory. An admin will verify your credentials within 24 hours and add a ✓ verified badge to your profile.</p>` : ''}
          <p style="margin-top: 24px;">
            <a href="https://${NATIONAL_HOST}/for-dentists/login" style="display: inline-block; padding: 12px 22px; background: #1D4ED8; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Sign in to your profile →</a>
          </p>
          <p style="font-size: 12px; color: #94A3B8; margin-top: 28px;">© ${new Date().getFullYear()} DentistIn. All rights reserved.</p>
        </div>
      </div>`
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `DentistIn <${NATIONAL_FROM_EMAIL}>`,
        to: email,
        subject: "Welcome to India's Dental Professional Network",
        html,
      }),
    }).catch(() => {})
  }

  // Admin WhatsApp ping — link only, no API call. Same pattern the
  // existing /api/registrations route uses (admin sees a wa.me URL
  // in their server logs for click-to-chat). We use the platform
  // notification endpoint if it exists; otherwise this is a no-op.
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'https://' + NATIONAL_HOST : ''}/api/notifications/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: ADMIN_WHATSAPP,
      message: `🌐 New national join — Dr. ${name} (${specialization}, ${cityName}). ${clinicName}. ${email}.`,
    }),
  }).catch(() => {})

  return NextResponse.json({
    success: true,
    slug,
    city: cityForRow,
    message: cityForRow
      ? `Profile created! You're listed on dentistin${cityForRow}.in and your professional profile on ${NATIONAL_HOST} is live.`
      : `Profile created! Your professional profile on ${NATIONAL_HOST} is live. We'll list you on a city directory as soon as we launch one matching yours.`,
  })
}
