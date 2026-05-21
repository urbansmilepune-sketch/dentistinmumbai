// Staff invite + listing for the dashboard.
//
// Invite flow (new, token-based — see
// supabase/migrations/20260517140000_clinic_staff_invite_token.sql):
//   1. Insert a clinic_staff row with status='invited' and a fresh
//      64-char random invite_token (or revive a 'removed' row for the
//      same email — saves the owner re-typing details, and the row gets
//      a brand-new token so leaked old tokens are dead).
//   2. Email the staff member /staff-accept?token=… via Resend.
//   3. The invitee opens the link → server component looks up the row
//      by token → AcceptForm posts { token, password } to
//      /api/staff/accept → that handler creates (or updates) the
//      auth.users row, marks the clinic_staff row active, clears the
//      token. No expiring magic link, no /auth/callback for staff.
//
// The old auth.admin.generateLink path is gone because magic links
// expire in 1–24 hours, which silently broke any invite the staff
// member didn't click immediately.
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'
import { sendStaffInviteEmail } from '@/lib/email'
import { CITY_CONFIGS, type CitySlug, DEFAULT_CITY } from '@/config/cities'

const ROLES = ['owner', 'associate_dentist', 'reception'] as const
type Role = typeof ROLES[number]

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function resolveOrigin(req: NextRequest, cityFromOwner: string | null | undefined): string {
  // Prefer the request origin (lets local dev work without env). Fall back
  // to the owner's city domain so the invite link points at the dentist's
  // branded host even if the request came from a misconfigured proxy.
  const reqOrigin = req.nextUrl?.origin
  if (reqOrigin) return reqOrigin
  const slug: CitySlug = (cityFromOwner && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, cityFromOwner) ? cityFromOwner : DEFAULT_CITY) as CitySlug
  return `https://${CITY_CONFIGS[slug].domain}`
}

// 32 random bytes → 64 hex chars. Plenty of entropy that brute-forcing
// the token space is not practical; stored on clinic_staff.invite_token
// (unique partial index) and cleared at accept time.
function newInviteToken(): string {
  return randomBytes(32).toString('hex')
}

export async function GET() {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data, error } = await db
    .from('clinic_staff')
    .select('id, email, name, role, status, invited_at')
    .eq('dentist_id', owner.id)
    .neq('status', 'removed')
    .order('invited_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data ?? [] })
}

export async function POST(request: NextRequest) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  const role = (typeof body.role === 'string' ? body.role : '') as Role
  // The form treats Name as optional ("Name (optional)") but the
  // clinic_staff table has name NOT NULL. Fall back to the email local-part
  // so blank submissions still land. This matches what the staff list UI
  // already shows when name is empty: `s.name || s.email.split('@')[0]`.
  const name = rawName || (email ? email.split('@')[0] : '')

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  if (email === owner.email?.toLowerCase()) {
    return NextResponse.json({ error: "You can't invite yourself — you're already the clinic owner" }, { status: 400 })
  }

  const db = admin()

  // Reuse an existing row for this (dentist, email) pair if there is one.
  // Lets the owner re-send an invite after a typo, or re-add someone they
  // previously removed, without tripping the unique index.
  const { data: existing } = await db
    .from('clinic_staff')
    .select('id, status')
    .eq('dentist_id', owner.id)
    .ilike('email', email)
    .maybeSingle()

  // Fresh token on every invite-or-resend, so any prior link the staff
  // member or attacker may have hold of is dead the moment the owner
  // clicks "Invite" again.
  const invite_token = newInviteToken()

  let staffId: string
  if (existing) {
    if (existing.status === 'active') {
      return NextResponse.json({ error: 'This person is already on your team' }, { status: 409 })
    }
    const { error: updErr } = await db
      .from('clinic_staff')
      .update({
        status: 'invited', role, name,
        invited_at: new Date().toISOString(),
        accepted_at: null,
        invite_token,
      })
      .eq('id', existing.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    staffId = existing.id
  } else {
    const { data: inserted, error: insErr } = await db
      .from('clinic_staff')
      .insert({ dentist_id: owner.id, email, name, role, status: 'invited', invite_token })
      .select('id')
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    staffId = inserted.id
  }

  const origin = resolveOrigin(request, owner.city)
  const inviteUrl = `${origin}/staff-accept?token=${invite_token}`

  sendStaffInviteEmail({
    to_email: email,
    invite_url: inviteUrl,
    clinic_name: owner.clinic_name || 'your clinic',
    owner_name: owner.name || 'The clinic owner',
    role,
    city: owner.city ?? undefined,
  }).catch(err => console.error('[staff/invite] email send failed', err))

  return NextResponse.json({ success: true, id: staffId })
}
