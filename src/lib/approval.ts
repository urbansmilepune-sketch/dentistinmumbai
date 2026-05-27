// Shared dentist-registration approval logic. Called from two places:
//   - POST /api/admin/registrations  (admin clicks "Approve" in the panel)
//   - POST /api/registrations        (auto-approval gate clears at signup time)
//
// Keeping the dentist-row build + status flip + approval email in one helper
// means both code paths stay in lockstep — if we add a new column to dentists
// or change how slugs are generated, there's exactly one place to touch.
//
// The helper returns a result tuple instead of throwing, so callers can map
// failure modes to whatever HTTP shape they need (the admin route preserves
// its existing { error, detail, code, hint } envelope; the public route
// converts a failure into "leave it pending" without 500-ing the dentist).
import type { SupabaseClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { sendApprovalEmail } from '@/lib/email'

export type Plan = 'monthly' | 'annual'

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

export type ApprovalSuccess = { ok: true; slug: string }
export type ApprovalFailure = {
  ok: false
  status: number
  error: string
  detail?: string
  code?: string
  hint?: string
}
export type ApprovalResult = ApprovalSuccess | ApprovalFailure

interface ApproveOptions {
  /** `true` when this approval came from the auto-approval gate in
   * POST /api/registrations. The flag is written to `dentist_registrations.auto_approved`
   * so the admin panel can distinguish the two paths. */
  autoApproved?: boolean
  /** Origin of the request that triggered the approval (e.g.
   * `https://dentistinpune.in`). Used as the magic-link redirect base so
   * the dentist lands on the city domain they actually registered from.
   * When omitted, falls back to the city domain stored on the
   * registration row — which silently defaults to `mumbai` for legacy
   * rows with NULL/unknown city, the original source of the
   * "all magic links go to dentistinmumbai.in" bug. Callers in API
   * routes should pass `request.headers.get('origin')` (with a referer
   * fallback) to avoid the fallback path. */
  requestOrigin?: string | null
}

/**
 * Build (or refresh) the dentists row for the given registration, flip the
 * registration row to `approved`, and fire the approval email. Idempotent on
 * email — re-running for the same registration just updates the existing
 * dentists row (preserving manual edits like working_hours or gallery).
 */
export async function approveDentistRegistration(
  admin_db: SupabaseClient,
  registration_id: string,
  opts: ApproveOptions = {},
): Promise<ApprovalResult> {
  const autoApproved = opts.autoApproved === true
  const tag = autoApproved ? '[approveDentistRegistration auto]' : '[approveDentistRegistration manual]'

  console.log(`${tag} start`, { registration_id })

  const { data: reg, error: regErr } = await admin_db
    .from('dentist_registrations')
    .select('id, status, name, phone, email, clinic_name, area, area_name_raw, qualification, mci_registration, selected_plan, city')
    .eq('id', registration_id)
    .single()
  if (regErr || !reg) {
    console.error(`${tag} registration fetch failed`, { registration_id, regErr })
    return { ok: false, status: 404, error: 'Registration not found', detail: regErr?.message }
  }

  // Refuse to re-run on a registration that's already approved. Two admins
  // clicking simultaneously, an admin re-clicking after a slow response, or
  // an auto-approval retry would otherwise: rebuild the dentists row,
  // re-mint a magic link (invalidating any pending one in the dentist's
  // inbox), and re-fire the approval email. Bail with 409 so callers can
  // surface a clear "already approved" message instead of silently
  // duplicating work.
  if (reg.status === 'approved') {
    console.log(`${tag} registration already approved — bailing`, { registration_id })
    return { ok: false, status: 409, error: 'Registration is already approved' }
  }

  const city: CitySlug = normalizeCity(reg.city)

  // Resolve area_id: exact → case-insensitive → auto-create under zone='Other'.
  // The "Other" registration path leaves reg.area empty and stashes the
  // dentist-typed value in reg.area_name_raw, so we fall back to that
  // before giving up. Once auto-created the area is curated for future
  // dentists in this city via /api/areas, no admin action required.
  const wantedAreaName = (reg.area && reg.area.trim()) || (reg.area_name_raw && reg.area_name_raw.trim()) || ''
  let area_id: string | null = null
  if (wantedAreaName) {
    const wanted = wantedAreaName
    const { data: areaExact } = await admin_db
      .from('areas').select('id, name').eq('name', wanted).maybeSingle()
    if (areaExact) {
      area_id = areaExact.id
    } else {
      const { data: areaCi } = await admin_db
        .from('areas').select('id, name').ilike('name', wanted).maybeSingle()
      if (areaCi) {
        area_id = areaCi.id
      } else {
        const newSlug = slugify(wanted)
        const { data: newArea, error: createErr } = await admin_db
          .from('areas')
          .insert({ name: wanted, slug: newSlug, zone: 'Other', city })
          .select('id, name')
          .single()
        if (createErr) {
          console.error(`${tag} area auto-create failed — proceeding with area_id=null`, {
            wanted, newSlug, message: createErr.message, code: createErr.code,
          })
        } else if (newArea) {
          area_id = newArea.id
        }
      }
    }
  }

  const plan: Plan | null = normalizePlan(reg.selected_plan)

  const { data: existing } = await admin_db
    .from('dentists')
    .select('id, slug')
    .eq('email', reg.email)
    .maybeSingle()

  let slug: string
  if (existing) {
    slug = existing.slug
    // Re-approval: don't reset trial_started_at — that would hand a second
    // trial to a dentist whose first one already elapsed (or worse, restart
    // a paying dentist's trial timer). The stamp is set once, on first
    // approval, and never moved by this code path.
    const { error: updateErr } = await admin_db
      .from('dentists')
      .update({
        name: reg.name,
        clinic_name: reg.clinic_name,
        phone: reg.phone,
        qualifications: reg.qualification,
        mci_number: reg.mci_registration,
        area_id,
        selected_plan: plan,
        city,
        is_active: true,
      })
      .eq('id', existing.id)
    if (updateErr) {
      console.error(`${tag} dentist update failed`, updateErr)
      return {
        ok: false, status: 500,
        error: 'Failed to update dentist profile',
        detail: updateErr.message, code: updateErr.code, hint: updateErr.hint,
      }
    }
  } else {
    const base = slugify(reg.clinic_name || reg.name || 'clinic') || 'clinic'
    slug = base
    for (let i = 2; i <= 10; i++) {
      const { data: clash } = await admin_db.from('dentists').select('id').eq('slug', slug).maybeSingle()
      if (!clash) break
      slug = `${base}-${i}`
    }

    const { error: insertErr } = await admin_db
      .from('dentists')
      .insert({
        email: reg.email,
        name: reg.name,
        clinic_name: reg.clinic_name,
        phone: reg.phone,
        qualifications: reg.qualification,
        mci_number: reg.mci_registration,
        area_id,
        slug,
        // NOT NULL on the dentists table — seeded blank, filled in by the
        // dentist via the profile editor.
        address: '',
        sub_area: '',
        bio: '',
        website: '',
        is_active: true,
        tier: 'free',
        // 30-day free trial. The dashboard reads this column via
        // src/lib/tier.ts#effectiveTier, which treats a free-tier dentist
        // inside their trial window as Gold for gating purposes.
        trial_started_at: new Date().toISOString(),
        selected_plan: plan,
        city,
      })
    if (insertErr) {
      console.error(`${tag} dentist insert failed`, {
        message: insertErr.message, code: insertErr.code, details: insertErr.details, hint: insertErr.hint,
      })
      return {
        ok: false, status: 500,
        error: 'Failed to create dentist profile',
        detail: insertErr.message, code: insertErr.code, hint: insertErr.hint,
      }
    }
  }

  const { error: statusErr } = await admin_db
    .from('dentist_registrations')
    .update({ status: 'approved', auto_approved: autoApproved })
    .eq('id', registration_id)
  if (statusErr) {
    // The dentist row is live; don't fail the whole call. Admin can re-run.
    console.error(`${tag} status update failed`, statusErr)
  }

  // Mint a magic link so the dentist can hop straight into their dashboard
  // from the approval email without setting a password first. invite first
  // (creates the auth.users row when they don't have one yet — true for
  // fresh registrations); magiclink as fallback if invite says "user
  // already registered" (re-approvals, admins who created the auth user
  // out-of-band). If both fail we still send the email, just without the
  // big "Access Your Dashboard" button — the dentist can use forgot-password
  // to recover. We never bubble this failure up: the approval is done.
  //
  // Redirect origin: prefer the caller-supplied requestOrigin (the city
  // the dentist actually registered from, captured via request headers in
  // the API route). Fall back to the registration row's city.domain only
  // when the caller didn't pass one — legacy rows with NULL city
  // normalize to DEFAULT_CITY = 'mumbai' here, which is the bug shape
  // this fix targets.
  const cityOrigin = `https://${CITY_CONFIGS[city].domain}`
  const origin = opts.requestOrigin || cityOrigin
  const redirectTo = `${origin}/auth/callback`
  let authLink: string | null = null
  try {
    const { data: invite, error: inviteErr } = await admin_db.auth.admin.generateLink({
      type: 'invite',
      email: reg.email,
      options: { redirectTo },
    })
    if (inviteErr) {
      const { data: ml } = await admin_db.auth.admin.generateLink({
        type: 'magiclink',
        email: reg.email,
        options: { redirectTo },
      })
      authLink = ml?.properties?.action_link ?? null
    } else {
      authLink = invite?.properties?.action_link ?? null
    }
  } catch (err) {
    console.error(`${tag} generateLink failed`, err)
  }

  sendApprovalEmail({
    name: reg.name,
    clinic_name: reg.clinic_name,
    slug,
    to_email: reg.email,
    selected_plan: plan,
    city,
    auth_link: authLink,
  }).catch(err => console.error(`${tag} approval email failed`, err))

  return { ok: true, slug }
}
