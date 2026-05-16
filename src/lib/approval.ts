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

  console.error(`${tag} start`, { registration_id })

  const { data: reg, error: regErr } = await admin_db
    .from('dentist_registrations')
    .select('id, name, phone, email, clinic_name, area, qualification, mci_registration, selected_plan, city')
    .eq('id', registration_id)
    .single()
  if (regErr || !reg) {
    console.error(`${tag} registration fetch failed`, { registration_id, regErr })
    return { ok: false, status: 404, error: 'Registration not found', detail: regErr?.message }
  }
  const city: CitySlug = normalizeCity(reg.city)

  // Resolve area_id: exact → case-insensitive → auto-create under zone='Other'.
  let area_id: string | null = null
  if (reg.area) {
    const wanted = reg.area.trim()
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

  sendApprovalEmail({
    name: reg.name,
    clinic_name: reg.clinic_name,
    slug,
    to_email: reg.email,
    selected_plan: plan,
    city,
  }).catch(err => console.error(`${tag} approval email failed`, err))

  return { ok: true, slug }
}
