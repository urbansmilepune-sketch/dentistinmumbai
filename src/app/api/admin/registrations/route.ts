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
//
// The approve branch is a thin wrapper around approveDentistRegistration() in
// src/lib/approval.ts so it stays in lockstep with the auto-approval gate in
// POST /api/registrations.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { sendDeclineEmail } from '@/lib/email'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { approveDentistRegistration } from '@/lib/approval'

function normalizeCity(v: unknown): CitySlug {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? (v as CitySlug) : DEFAULT_CITY
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

  // Approve path: delegate to the shared helper. autoApproved=false marks
  // this as a manual admin action in the dentist_registrations row.
  // requestOrigin scopes the magic-link redirect to whichever city
  // domain the admin clicked Approve from, so the dentist lands on the
  // same apex their auth cookie will be scoped to.
  const requestOrigin = request.headers.get('origin')
    || request.headers.get('referer')?.split('/').slice(0, 3).join('/')
    || null
  const result = await approveDentistRegistration(admin_db, registration_id, { autoApproved: false, requestOrigin })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail, code: result.code, hint: result.hint },
      { status: result.status },
    )
  }
  return NextResponse.json({ success: true, slug: result.slug })
}
