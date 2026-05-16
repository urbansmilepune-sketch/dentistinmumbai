// Staff invite + listing for the dashboard.
//
// Invite flow:
//   1. Insert a clinic_staff row with status='invited' (or revive a 'removed'
//      row for the same email — saves the owner re-typing details).
//   2. Ask Supabase auth.admin.generateLink to mint an invite link tied to
//      this email. We don't let Supabase send its own email; we drop the URL
//      into our own branded template via Resend so the dentist's clinic
//      name and role show up.
//   3. The invitee clicks the link → /auth/callback exchanges the code →
//      callback sees no dentists row → finds the clinic_staff row → marks
//      status='active', joined_at=now(), user_id=auth.users.id → redirects
//      to the staff portal.
import { NextRequest, NextResponse } from 'next/server'
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
  // to the owner's city domain so the magic link points at the dentist's
  // branded host even if the request came from a misconfigured proxy.
  const reqOrigin = req.nextUrl?.origin
  if (reqOrigin) return reqOrigin
  const slug: CitySlug = (cityFromOwner && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, cityFromOwner) ? cityFromOwner : DEFAULT_CITY) as CitySlug
  return `https://${CITY_CONFIGS[slug].domain}`
}

export async function GET() {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data, error } = await db
    .from('clinic_staff')
    .select('id, email, name, role, status, invited_at, joined_at')
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
  const name = typeof body.name === 'string' ? body.name.trim() : null
  const role = (typeof body.role === 'string' ? body.role : '') as Role

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

  let staffId: string
  if (existing) {
    if (existing.status === 'active') {
      return NextResponse.json({ error: 'This person is already on your team' }, { status: 409 })
    }
    const { error: updErr } = await db
      .from('clinic_staff')
      .update({ status: 'invited', role, name, invited_at: new Date().toISOString(), joined_at: null })
      .eq('id', existing.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    staffId = existing.id
  } else {
    const { data: inserted, error: insErr } = await db
      .from('clinic_staff')
      .insert({ dentist_id: owner.id, email, name, role, status: 'invited' })
      .select('id')
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    staffId = inserted.id
  }

  // Mint an invite link through Supabase auth.admin. This creates the
  // auth.users row (status: invited) and returns a single-use URL ending
  // at /auth/callback. We do NOT let Supabase send its own email — we
  // re-send via Resend with our brand on it.
  const origin = resolveOrigin(request, owner.city)
  let inviteUrl: string | null = null
  try {
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${origin}/auth/callback` },
    })
    if (linkErr) {
      // The most common error here is "user already registered" — which is
      // fine in our model; the existing auth.users row will accept a magic
      // link on its own. Fall back to a magiclink type so they can still
      // sign in.
      const { data: ml } = await db.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${origin}/auth/callback` },
      })
      inviteUrl = ml?.properties?.action_link ?? null
    } else {
      inviteUrl = link?.properties?.action_link ?? null
    }
  } catch (err) {
    console.error('[staff/invite] generateLink failed', err)
  }

  if (!inviteUrl) {
    // The row is created; the owner can re-send to retry. Don't 500 here —
    // surface the message but keep the row so the UI can show "Pending".
    return NextResponse.json({
      success: true, id: staffId,
      warning: 'Invite created but email link generation failed. Try resending in a moment.',
    })
  }

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
