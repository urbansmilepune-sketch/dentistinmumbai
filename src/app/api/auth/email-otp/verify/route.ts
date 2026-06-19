// POST /api/auth/email-otp/verify — verifies a 6-digit login code issued by
// /api/auth/email-otp/send and, on success, returns a one-time Supabase magic
// link the client navigates to. That link lands on /auth/callback, which
// exchanges it for a session cookie and routes the dentist to the dashboard —
// the same session mechanism the approval email uses (see lib/approval.ts).
//
// Checks performed (all must pass): a matching bcrypt hash, not expired
// (10-min window), and not already used. The code row is burned (used_at
// stamped) before the link is minted so a code can't be replayed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Newest unused, unexpired code for this email. Resending issues a fresh
  // row, so the latest is the one the dentist is looking at.
  const nowIso = new Date().toISOString()
  const { data: row } = await admin
    .from('email_otps')
    .select('id, otp_hash, expires_at, used_at')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ error: 'That code has expired or was already used — request a new one.' }, { status: 400 })
  }

  const matches = await bcrypt.compare(otp, row.otp_hash)
  if (!matches) {
    return NextResponse.json({ error: 'Incorrect code. Check your email and try again.' }, { status: 400 })
  }

  // Burn the code first so a successful match can't be replayed even if link
  // minting below fails.
  await admin.from('email_otps').update({ used_at: new Date().toISOString() }).eq('id', row.id)

  // Same-origin callback so the host-scoped auth cookie sticks (each city +
  // the national host are separate apexes — see lib/approval.ts / auth/callback).
  const origin = request.headers.get('origin') || new URL(request.url).origin
  const redirectTo = `${origin}/auth/callback`

  // magiclink only resolves for an existing auth user, so this doubles as the
  // "is this a real account?" gate — we never create accounts from a login code.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })
  const actionLink = link?.properties?.action_link ?? null
  if (linkErr || !actionLink) {
    console.error('[auth/email-otp/verify] generateLink failed', { message: linkErr?.message })
    return NextResponse.json(
      { error: 'No account found for this email. Register first, or sign in with Google.' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true, redirect_url: actionLink })
}
