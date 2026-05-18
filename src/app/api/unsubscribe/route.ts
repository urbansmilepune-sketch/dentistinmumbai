// Public unsubscribe endpoint. Called by the /unsubscribe page once the
// recipient lands and confirms — we don't auto-unsubscribe on page load
// because pre-fetching link previews (Slack, Outlook safelinks, etc.) would
// then opt people out without their consent.
//
//   POST { email: string }
//
// No auth — anyone with the email + a link can opt out. The status flip is
// idempotent (already-unsubscribed rows stay unsubscribed).
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  // Look up the row first so we can echo a friendly result; the update runs
  // even if the address isn't in our list so we don't leak presence/absence.
  const { data: row } = await db
    .from('outreach_contacts')
    .select('id, status')
    .eq('email', email)
    .maybeSingle()

  if (row) {
    await db
      .from('outreach_contacts')
      .update({ status: 'unsubscribed' })
      .eq('id', row.id)
  }

  return NextResponse.json({ success: true })
}
