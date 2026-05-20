// Public unsubscribe endpoint. Two callers:
//
//   1. Our /unsubscribe confirmation page — POST application/json { email }.
//      The page deliberately doesn't auto-fire on load because Outlook
//      safelinks and Slack unfurls would otherwise opt people out without
//      consent.
//   2. RFC 8058 one-click (Gmail / Yahoo / Apple Mail) — POST
//      application/x-www-form-urlencoded with body "List-Unsubscribe=One-Click"
//      and the email in the URL query string. The List-Unsubscribe header
//      in outreach.ts points here.
//
// No auth — anyone with the email + a link can opt out. The status flip is
// idempotent (already-unsubscribed rows stay unsubscribed).
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

async function resolveEmail(request: NextRequest): Promise<string> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase()

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    return typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  }

  // RFC 8058 / form-encoded path: the email rides in the URL query string
  // because the body is reserved for "List-Unsubscribe=One-Click".
  return (new URL(request.url).searchParams.get('email') || '').trim().toLowerCase()
}

async function flipUnsubscribed(email: string) {
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  // Look up the row first so we can no-op cleanly when the address isn't
  // in our list — we never leak presence/absence in the response.
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
}

export async function POST(request: NextRequest) {
  const email = await resolveEmail(request)
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  await flipUnsubscribed(email)
  return NextResponse.json({ success: true })
}
