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
import { sendApprovalEmail } from '@/lib/email'

type Plan = 'monthly' | 'annual'
function normalizePlan(v: unknown): Plan | null {
  return v === 'monthly' || v === 'annual' ? v : null
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

  // Decline path: just flip the status + record the reason.
  if (action === 'decline') {
    const { error } = await admin_db
      .from('dentist_registrations')
      .update({ status: 'declined', decline_reason: reason })
      .eq('id', registration_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Approve path: build (or refresh) the dentists row, fire the email.
  const { data: reg, error: regErr } = await admin_db
    .from('dentist_registrations')
    .select('id, name, phone, email, clinic_name, area, qualification, mci_registration, selected_plan')
    .eq('id', registration_id)
    .single()
  if (regErr || !reg) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  }

  // Resolve area_id by name (best effort — if unmatched we leave area_id null).
  let area_id: string | null = null
  if (reg.area) {
    const { data: areaRow } = await admin_db.from('areas').select('id').eq('name', reg.area).maybeSingle()
    if (areaRow) area_id = areaRow.id
  }

  const plan: Plan | null = normalizePlan(reg.selected_plan)

  // Does this email already have a dentists row? If yes, refresh it (preserves
  // any manual edits the admin made in Studio); if no, create with a fresh slug.
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
        is_active: true,
      })
      .eq('id', existing.id)
    if (updateErr) {
      console.error('[admin/registrations approve] dentist update failed', updateErr)
      return NextResponse.json({ error: 'Failed to update dentist profile' }, { status: 500 })
    }
  } else {
    // Generate a unique slug from clinic_name (fallback to name). Append -2, -3…
    // on collision. Cap at 10 attempts before bailing — clinic_name+random suffix
    // beyond that is unrealistic in practice.
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
        is_active: true,
        tier: 'free',
        selected_plan: plan,
      })
    if (insertErr) {
      console.error('[admin/registrations approve] dentist insert failed', insertErr)
      return NextResponse.json({ error: 'Failed to create dentist profile' }, { status: 500 })
    }
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
  }).catch(err => console.error('[admin/registrations approve] approval email failed', err))

  return NextResponse.json({ success: true, slug })
}
