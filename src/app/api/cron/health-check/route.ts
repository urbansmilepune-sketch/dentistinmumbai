// Vercel cron — every-5-minute liveness probe for the three things that
// would cause silent revenue loss if they broke: Supabase, the
// registration table, and the auth backplane. The schedule lives in
// /vercel.json. A failing check fires a WhatsApp ping to the admin phone
// (via the existing /api/notifications/whatsapp stub) plus an email to the
// app inbox — both fire-and-forget so a notification failure can't mask
// the underlying outage in the cron's own logs.
//
// **Note on schedule:** "*/5 * * * *" = 288 invocations/day, which sits
// above the Vercel Hobby tier's 2-crons-per-day cap. This route requires
// the Pro plan to actually fire on schedule.
//
// Required env:
//   CRON_SECRET               — Vercel cron auth (Bearer header)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY — bypass RLS + grants auth.admin.listUsers
//   RESEND_API_KEY            — alert email channel
//   NEXT_PUBLIC_SITE_URL      — origin for the internal WhatsApp POST
//                                (optional; falls back to dentistinmumbai.in)
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ALERT_EMAIL = 'dentistinmumbaiapp@gmail.com'
const ALERT_FROM = 'hello@dentistinmumbai.in'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dentistinmumbai.in'

type CheckResult = { name: string; ok: boolean; error?: string; detail?: unknown }

export async function GET(request: NextRequest) {
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Reject anything
  // else so the endpoint can't be triggered from the public internet.
  const authHeader = request.headers.get('authorization') || ''
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const results: CheckResult[] = []

  // Check 1: Supabase reachable.
  // `head: true` returns no rows but exercises the network + auth + a real
  // table read — cheaper and more informative than a synthetic `select 1`.
  try {
    const { error } = await supabase.from('dentists').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) throw error
    results.push({ name: 'Supabase connection', ok: true })
  } catch (err) {
    results.push({ name: 'Supabase connection', ok: false, error: errMsg(err) })
  }

  // Check 2: registration table accessible. A failing migration or a
  // missing column would surface here before the next signup attempt fails.
  try {
    const { error, count } = await supabase
      .from('dentist_registrations')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
    if (error) throw error
    results.push({ name: 'Registration API', ok: true, detail: { count } })
  } catch (err) {
    results.push({ name: 'Registration API', ok: false, error: errMsg(err) })
  }

  // Check 3: auth backplane responding. listUsers also implicitly
  // verifies the service role key hasn't been rotated/revoked.
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) throw error
    if (!data?.users || data.users.length === 0) throw new Error('auth.users is empty')
    results.push({ name: 'Auth system', ok: true })
  } catch (err) {
    results.push({ name: 'Auth system', ok: false, error: errMsg(err) })
  }

  const failed = results.filter(r => !r.ok)

  if (failed.length > 0) {
    const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })
    await Promise.all(failed.flatMap(f => {
      const msg = `🚨 DentistIn Health Alert: ${f.name} is failing. Check immediately! Time: ${istTime}`
      return [
        // Fire-and-forget WhatsApp via the internal endpoint so a future
        // provider swap (WATI/Twilio/MSG91) automatically picks this up.
        fetch(`${SITE_URL}/api/notifications/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg }),
        }).catch(e => console.error('[cron/health-check] whatsapp failed', e)),
        // Email alert — independent channel so a stuck WhatsApp provider
        // doesn't silence the alarm.
        sendAlertEmail({
          subject: `🚨 Health Alert: ${f.name} failing`,
          checkName: f.name,
          error: f.error || 'unknown',
          istTime,
        }).catch(e => console.error('[cron/health-check] email failed', e)),
      ]
    }))
  }

  return NextResponse.json({
    ok: failed.length === 0,
    failed: failed.length,
    checks: results,
    checked_at: new Date().toISOString(),
  })
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try { return JSON.stringify(err) } catch { return 'unknown error' }
}

async function sendAlertEmail(args: { subject: string; checkName: string; error: string; istTime: string }) {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: ALERT_FROM,
    to: ALERT_EMAIL,
    subject: args.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0F1923;">
        <h2 style="color: #B91C1C; margin-bottom: 8px;">🚨 Health check failed</h2>
        <p style="margin: 0 0 16px; color: #475569;">A scheduled health probe reported a failing component. Investigate before patient-facing flows break.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748B;">Check</td><td style="padding: 6px 0; font-weight: 700;">${escapeHtml(args.checkName)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Error</td><td style="padding: 6px 0; font-family: monospace; font-size: 12px;">${escapeHtml(args.error)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Time (IST)</td><td style="padding: 6px 0;">${escapeHtml(args.istTime)}</td></tr>
        </table>
      </div>
    `,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
