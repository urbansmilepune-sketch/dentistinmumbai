// /api/staff/accept — completes a staff invite issued by
// POST /api/dentist/staff. The flow is intentionally minimal: the staff
// member sends { token, password }, we verify the token, create or
// update the auth.users row, mark the clinic_staff row active, and
// invalidate the token. No email is required from the client because
// the token is bound to the row that already holds the invitee's email.
//
// Security notes:
//   - The token IS the credential. We do not require any other proof
//     of identity from the client — same shape as a magic link.
//     Compensation: the token is single-use (cleared when status flips
//     to 'active'), uniformly random (32 bytes), AND now expires
//     30 days after invited_at as belt-and-suspenders. A leaked-but-
//     not-yet-redeemed token from a year ago cannot be cashed in.
//   - status='invited' is required at accept time. A redeem of a
//     token that's already been used is impossible because the token
//     is null'd; but if the row was activated through some other path
//     (e.g. manual fix), refuse the redeem here too.
//   - Service role is used for the lookup, the auth user create/update,
//     and the row update. RLS does not gate the unauthenticated path
//     because the token gates it.
//   - Password is a free-form string (min 8 chars enforced here). Any
//     additional complexity policy belongs in Supabase auth settings.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient, type User } from '@supabase/supabase-js'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Invites are usable for 30 days from invited_at. Sized to be long
// enough that vacation/leave doesn't strand a new hire but short
// enough that a long-leaked link doesn't grant indefinite access.
// The /staff-accept page applies the same check so the staff member
// sees a friendly "expired" block before being asked for a password.
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000

// supabase-js doesn't expose a getUserByEmail admin call, so we paginate.
// At ~200/page this covers up to 1,000 users with a single round trip in
// the common case; staff invite volume is tiny so this is fine.
async function findAuthUserByEmail(db: ReturnType<typeof admin>, email: string): Promise<User | null> {
  const needle = email.toLowerCase()
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error('[staff/accept] listUsers page failed', { page, error })
      return null
    }
    const hit = (data.users || []).find(u => u.email?.toLowerCase() === needle)
    if (hit) return hit
    if (!data.users || data.users.length < 200) return null
  }
  return null
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!token) return NextResponse.json({ error: 'Missing invite token.' }, { status: 400 })
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const db = admin()

  const { data: row, error: lookupErr } = await db
    .from('clinic_staff')
    .select('id, email, status, dentist_id, role, invited_at')
    .eq('invite_token', token)
    .maybeSingle()
  if (lookupErr) {
    console.error('[staff/accept] lookup error', lookupErr)
    return NextResponse.json({ error: 'Could not verify your invite link.' }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'This invite link is no longer valid. Ask your clinic owner to send a new invite.' }, { status: 410 })
  }
  if (row.status !== 'invited') {
    return NextResponse.json({ error: 'This invite has already been accepted. Use the regular sign-in page.' }, { status: 409 })
  }

  // 30-day expiry. The token is single-use anyway, but this caps the
  // window in which a leaked-but-unused link is dangerous.
  const invitedAtMs = row.invited_at ? new Date(row.invited_at).getTime() : 0
  if (!invitedAtMs || Date.now() - invitedAtMs > INVITE_TTL_MS) {
    return NextResponse.json({ error: 'Invite link expired. Please ask your dentist to send a new invite.' }, { status: 410 })
  }

  // Create the auth.users row, or update an existing one if the email
  // was previously registered (e.g. staff member who was first invited
  // under the old magic-link flow and never finished signing in).
  let userId: string
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: row.email,
    password,
    email_confirm: true,
    user_metadata: { invited_via: 'staff_invite', clinic_staff_id: row.id, role: row.role },
  })

  if (createErr) {
    const msg = createErr.message || ''
    const looksLikeExists = /already registered|already exists|user already|duplicate/i.test(msg)
    if (!looksLikeExists) {
      console.error('[staff/accept] createUser failed', createErr)
      return NextResponse.json({ error: `Could not create your account: ${msg}` }, { status: 500 })
    }
    const existing = await findAuthUserByEmail(db, row.email)
    if (!existing) {
      console.error('[staff/accept] createUser says exists but lookup found none', { email: row.email })
      return NextResponse.json({ error: 'Account exists but could not be located. Contact support.' }, { status: 500 })
    }
    const { error: updErr } = await db.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (updErr) {
      console.error('[staff/accept] updateUserById failed', updErr)
      return NextResponse.json({ error: `Could not set your password: ${updErr.message}` }, { status: 500 })
    }
    userId = existing.id
  } else {
    userId = created!.user!.id
  }

  // Mark the clinic_staff row active and clear the token (single-use).
  const now = new Date().toISOString()
  const { error: activateErr } = await db
    .from('clinic_staff')
    .update({
      status: 'active',
      user_id: userId,
      accepted_at: now,
      invite_token: null,
    })
    .eq('id', row.id)
  if (activateErr) {
    console.error('[staff/accept] activate update failed', activateErr)
    return NextResponse.json({ error: `Account ready but invite finalize failed: ${activateErr.message}. Try signing in directly.` }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: row.email })
}
