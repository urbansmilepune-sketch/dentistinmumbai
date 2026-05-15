// Admin approval endpoint for dentist registrations.
//
// Required env:
//   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY   — service-role key (this route needs to write
//                                 dentists across RLS; auth is enforced by the
//                                 admin_users lookup below)
//
// Contract matches the admin UI in AdminPageClient.tsx:
//   { registration_id, action: 'approve' }                   → builds the dentist profile + sends email
//   { registration_id, action: 'decline', reason?: string }  → flips status + records the reason
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { sendApprovalEmail, sendDeclineEmail } from '@/lib/email'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'

type Plan = 'monthly' | 'annual'
function normalizePlan(v: unknown): Plan | null {
  return v === 'monthly' || v === 'annual' ? v : null
}

function normalizeCity(v: unknown): CitySlug {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? (v as CitySlug) : DEFAULT_CITY
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
  // Auth: identity comes from the JWT (user client). The admin_users lookup
  // runs on the service-role client so it bypasses RLS — otherwise an admin
  // with no self-read policy on admin_users gets a spurious Unauthorized.
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin_db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: admin } = await admin_db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const registration_id = typeof body.registration_id === 'string' ? body.registration_id : null
  const action = body.action === 'approve' || body.action === 'decline' ? body.action : null
  const reason = typeof body.reason === 'string' ? body.reason : null

  if (!registration_id || !action) {
    return NextResponse.json({ error: 'Missing registration_id or action' }, { status: 400 })
  }

  // Decline path: fetch the dentist's contact info, flip the status, then
  // fire the decline email. The dentist_registrations.status check
  // constraint allows 'pending' | 'approved' | 'rejected' — using 'rejected'
  // (not 'declined') to satisfy it and to line up with the Badge color map.
  if (action === 'decline') {
    const { data: declineReg, error: declineRegErr } = await admin_db
      .from('dentist_registrations')
      .select('name, clinic_name, email, city')
      .eq('id', registration_id)
      .single()
    if (declineRegErr || !declineReg) {
      console.error('[admin/registrations decline] registration fetch failed', { registration_id, declineRegErr })
      return NextResponse.json({ error: 'Registration not found', detail: declineRegErr?.message }, { status: 404 })
    }

    const { error } = await admin_db
      .from('dentist_registrations')
      .update({ status: 'rejected', decline_reason: reason })
      .eq('id', registration_id)
    if (error) {
      console.error('[admin/registrations decline] status update failed', error)
      return NextResponse.json({ error: error.message, code: error.code, hint: error.hint }, { status: 500 })
    }

    // Best-effort — don't fail the call if the email provider is down.
    sendDeclineEmail({
      name: declineReg.name,
      clinic_name: declineReg.clinic_name,
      to_email: declineReg.email,
      reason,
      city: normalizeCity((declineReg as any).city),
    }).catch(err => console.error('[admin/registrations decline] decline email failed', err))

    return NextResponse.json({ success: true })
  }

  console.error('[admin/registrations approve] start', { registration_id })

  // Approve path: build (or refresh) the dentists row, fire the email.
  const { data: reg, error: regErr } = await admin_db
    .from('dentist_registrations')
    .select('id, name, phone, email, clinic_name, area, qualification, mci_registration, selected_plan, city')
    .eq('id', registration_id)
    .single()
  if (regErr || !reg) {
    console.error('[admin/registrations approve] registration fetch failed', { registration_id, regErr })
    return NextResponse.json({ error: 'Registration not found', detail: regErr?.message }, { status: 404 })
  }
  // Whitelist city the same way as plan — unknown / missing values fall back
  // to DEFAULT_CITY ('mumbai'), so legacy rows from before the city column
  // existed still resolve to a sane value.
  const city: CitySlug = normalizeCity(reg.city)

  console.error('[admin/registrations approve] registration fetched', {
    id: reg.id, email: reg.email, area: reg.area, selected_plan: reg.selected_plan, city,
  })

  // Resolve area_id with auto-create: exact name → case-insensitive name →
  // create a new areas row. Means dentists can register with any
  // neighbourhood label without an admin pre-seeding the table; the new
  // area is filed under zone='Other' so it's visible but flagged for later
  // curation.
  let area_id: string | null = null
  if (reg.area) {
    const wanted = reg.area.trim()

    const { data: areaExact, error: areaExactErr } = await admin_db
      .from('areas').select('id, name').eq('name', wanted).maybeSingle()
    if (areaExactErr) console.error('[admin/registrations approve] area exact lookup error', areaExactErr)

    if (areaExact) {
      area_id = areaExact.id
      console.error('[admin/registrations approve] area matched (exact)', { wanted, area_id })
    } else {
      const { data: areaCi, error: areaCiErr } = await admin_db
        .from('areas').select('id, name').ilike('name', wanted).maybeSingle()
      if (areaCiErr) console.error('[admin/registrations approve] area ilike lookup error', areaCiErr)

      if (areaCi) {
        area_id = areaCi.id
        console.error('[admin/registrations approve] area matched (case-insensitive)', { wanted, matched: areaCi.name, area_id })
      } else {
        // Not found by either lookup — create it so the dentist still gets a
        // non-null area_id and the new area starts surfacing in /area pages.
        const newSlug = slugify(wanted)
        const newAreaPayload = { name: wanted, slug: newSlug, zone: 'Other', city }
        console.error('[admin/registrations approve] area not found — auto-creating', newAreaPayload)
        const { data: newArea, error: createErr } = await admin_db
          .from('areas')
          .insert(newAreaPayload)
          .select('id, name')
          .single()
        if (createErr) {
          console.error('[admin/registrations approve] area auto-create failed — proceeding with area_id=null', {
            wanted, newSlug, message: createErr.message, code: createErr.code, hint: createErr.hint, details: createErr.details,
          })
        } else if (newArea) {
          area_id = newArea.id
          console.error('[admin/registrations approve] area auto-created', { wanted, newSlug, area_id })
        }
      }
    }
  }

  const plan: Plan | null = normalizePlan(reg.selected_plan)

  // Does this email already have a dentists row? If yes, refresh it (preserves
  // any manual edits the admin made in Studio); if no, create with a fresh slug.
  const { data: existing, error: existingErr } = await admin_db
    .from('dentists')
    .select('id, slug')
    .eq('email', reg.email)
    .maybeSingle()
  if (existingErr) console.error('[admin/registrations approve] existing dentist lookup error', existingErr)
  console.error('[admin/registrations approve] existing dentist?', { email: reg.email, found: !!existing })

  let slug: string
  if (existing) {
    slug = existing.slug
    const updatePayload = {
      name: reg.name,
      clinic_name: reg.clinic_name,
      phone: reg.phone,
      qualifications: reg.qualification,
      mci_number: reg.mci_registration,
      area_id,
      selected_plan: plan,
      city,
      is_active: true,
    }
    console.error('[admin/registrations approve] updating existing dentist', { id: existing.id, slug, updatePayload })
    const { error: updateErr } = await admin_db
      .from('dentists')
      .update(updatePayload)
      .eq('id', existing.id)
    if (updateErr) {
      console.error('[admin/registrations approve] dentist update failed', updateErr)
      return NextResponse.json({
        error: 'Failed to update dentist profile',
        detail: updateErr.message,
        code: updateErr.code,
        hint: updateErr.hint,
      }, { status: 500 })
    }
  } else {
    // Generate a unique slug from clinic_name (fallback to name). Append -2, -3…
    // on collision. Cap at 10 attempts before bailing — clinic_name+random suffix
    // beyond that is unrealistic in practice.
    const base = slugify(reg.clinic_name || reg.name || 'clinic') || 'clinic'
    slug = base
    for (let i = 2; i <= 10; i++) {
      const { data: clash, error: clashErr } = await admin_db.from('dentists').select('id').eq('slug', slug).maybeSingle()
      if (clashErr) console.error('[admin/registrations approve] slug clash lookup error', { slug, clashErr })
      if (!clash) break
      slug = `${base}-${i}`
    }
    console.error('[admin/registrations approve] slug resolved', { base, slug })

    // address/sub_area/bio/website are NOT NULL in the dentists table but the
    // registration form doesn't collect them — seed with empty strings so the
    // insert succeeds; the dentist fills them in via the profile editor.
    const insertPayload = {
      email: reg.email,
      name: reg.name,
      clinic_name: reg.clinic_name,
      phone: reg.phone,
      qualifications: reg.qualification,
      mci_number: reg.mci_registration,
      area_id,
      slug,
      address: '',
      sub_area: '',
      bio: '',
      website: '',
      is_active: true,
      tier: 'free',
      selected_plan: plan,
      city,
    }
    console.error('[admin/registrations approve] inserting dentist', insertPayload)
    const { error: insertErr } = await admin_db
      .from('dentists')
      .insert(insertPayload)
    if (insertErr) {
      console.error('[admin/registrations approve] dentist insert failed', {
        message: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
        payload: insertPayload,
      })
      return NextResponse.json({
        error: 'Failed to create dentist profile',
        detail: insertErr.message,
        code: insertErr.code,
        hint: insertErr.hint,
      }, { status: 500 })
    }
    console.error('[admin/registrations approve] dentist insert succeeded', { slug })
  }

  // Flip the registration to approved.
  const { error: statusErr } = await admin_db
    .from('dentist_registrations')
    .update({ status: 'approved' })
    .eq('id', registration_id)
  if (statusErr) {
    console.error('[admin/registrations approve] status update failed', statusErr)
    // The dentist row is live; don't fail the whole call. The admin can re-run.
  }

  // Send the approval email (best-effort — log and continue on failure).
  sendApprovalEmail({
    name: reg.name,
    clinic_name: reg.clinic_name,
    slug,
    to_email: reg.email,
    selected_plan: plan,
    city,
  }).catch(err => console.error('[admin/registrations approve] approval email failed', err))

  return NextResponse.json({ success: true, slug })
}
