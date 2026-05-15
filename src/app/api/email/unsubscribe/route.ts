// One-click unsubscribe handler for reminder emails. Reached from the
// `Unsubscribe` link in profile-reminder emails. The dentist's UUID is the
// only auth signal — low-stakes (worst case: someone unsubscribes a dentist
// from nudge emails) so we trade a HMAC token for fewer moving parts.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function htmlResponse(title: string, message: string, ok: boolean) {
  const color = ok ? '#00A878' : '#DC2626'
  const icon = ok ? '✓' : '✗'
  return new NextResponse(
    `<!doctype html>
    <html><head><meta charset="utf-8"><title>${title}</title></head>
    <body style="font-family: Arial, sans-serif; background: #f8faff; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px 32px; text-align: center;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: ${color}; color: #fff; font-size: 30px; line-height: 56px; margin: 0 auto 18px;">${icon}</div>
        <h1 style="font-size: 22px; color: #0F1923; margin: 0 0 12px;">${title}</h1>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${message}</p>
        <a href="https://www.dentistinmumbai.in/for-dentists/dashboard" style="display: inline-block; background: #0057A8; color: #fff; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Back to dashboard</a>
      </div>
    </body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return htmlResponse('Invalid link', 'This unsubscribe link is missing required info.', false)
  }

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: dentist, error } = await db
    .from('dentists')
    .update({ email_reminders_opt_out: true })
    .eq('id', id)
    .select('id')
    .single()

  if (error || !dentist) {
    return htmlResponse('Could not unsubscribe', 'We could not find your account. Please email us if this keeps happening.', false)
  }

  return htmlResponse(
    "You've been unsubscribed",
    "We won't send you profile-completion reminders anymore. You'll still get important account emails like booking confirmations and invoices.",
    true,
  )
}
