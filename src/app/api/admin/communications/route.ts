// Admin-only fan-out endpoint for the Communications tab. Resolves the
// target dentist set from one of three modes, then sends an ad-hoc email
// to each via Resend. Returns sent / failed counts so the UI can show
// per-blast stats.
//
// Modes:
//   { mode: 'individual', targets: <dentist_id>, subject, message }
//   { mode: 'bulk',       targets: 'all' | 'free' | 'silver' | 'gold' | 'featured', subject, message }
//   { mode: 'city',       cityFilters: ['mumbai', 'pune', ...], subject, message }
//
// We DO NOT throttle. Resend's transactional limit is generous (~10 req/s
// on paid plans) and dentist counts are in the hundreds — well within a
// single 60s function execution. If we ever cross ~600 recipients we
// should switch to Resend's batch API or move this to a background queue.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { sendAdminBulkMessage } from '@/lib/email'
import { CITY_CONFIGS } from '@/config/cities'

type Mode = 'individual' | 'bulk' | 'city'
type Tier = 'free' | 'silver' | 'gold' | 'featured'
const TIERS: Tier[] = ['free', 'silver', 'gold', 'featured']

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  // Auth — identity from the JWT, admin allowlist via admin_users table
  // (same pattern the rest of /api/admin/* uses).
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: adminRow } = await db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const mode = body.mode as Mode
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const targets = body.targets
  const cityFilters = Array.isArray(body.cityFilters) ? (body.cityFilters as string[]) : []

  if (!['individual', 'bulk', 'city'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }
  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  // Resolve recipients from the mode. We always restrict to is_active + a
  // non-null email so a deactivated row or a half-finished migration row
  // can't accidentally receive a blast.
  let query = db
    .from('dentists')
    .select('id, email, name, city')
    .eq('is_active', true)
    .not('email', 'is', null)

  if (mode === 'individual') {
    if (typeof targets !== 'string' || !targets) {
      return NextResponse.json({ error: 'targets must be a dentist id for individual mode' }, { status: 400 })
    }
    query = query.eq('id', targets)
  } else if (mode === 'bulk') {
    // 'all' is the no-filter case. A tier slug narrows to that tier.
    if (targets && targets !== 'all') {
      if (!TIERS.includes(targets as Tier)) {
        return NextResponse.json({ error: 'Invalid tier filter' }, { status: 400 })
      }
      query = query.eq('tier', targets)
    }
  } else {
    // mode === 'city'
    const cleanCities = cityFilters.filter(c => Object.prototype.hasOwnProperty.call(CITY_CONFIGS, c))
    if (cleanCities.length === 0) {
      return NextResponse.json({ error: 'At least one valid city is required' }, { status: 400 })
    }
    query = query.in('city', cleanCities)
  }

  const { data: recipients, error: recipErr } = await query
  if (recipErr) {
    console.error('[admin/communications] recipient fetch failed', recipErr)
    return NextResponse.json({ error: recipErr.message }, { status: 500 })
  }
  const list = (recipients ?? []) as Array<{ id: string; email: string; name: string | null; city: string | null }>
  if (list.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, total: 0, error: 'No matching dentists' }, { status: 200 })
  }

  // Fan out in batches of 10 with a 1-second pause between batches. Resend's
  // documented limits are 2 req/s (free) and 10 req/s (Pro). The previous
  // implementation fired all recipients concurrently with Promise.allSettled —
  // a 250-dentist blast would burst ~250 calls at once and drop most under
  // a 429. Batching at 10/sec keeps us inside the Pro rate limit while
  // still being parallel within each batch.
  //
  // No retry on failure — Resend rejections are counted as `failed` and
  // returned to the admin. Retry would belong in a background queue, not
  // inline in a request handler.
  const BATCH_SIZE = 10
  const BATCH_DELAY_MS = 1000
  const results: PromiseSettledResult<unknown>[] = []
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map(r =>
        sendAdminBulkMessage({
          to_email: r.email,
          dentist_name: r.name,
          subject,
          message,
          city: r.city ?? undefined,
        }),
      ),
    )
    results.push(...batchResults)
    // Skip the sleep after the final batch — no point pausing before we
    // return.
    if (i + BATCH_SIZE < list.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }
  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.length - sent
  if (failed > 0) {
    const firstReason = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
    console.error('[admin/communications] some sends failed', {
      sent, failed, total: list.length, firstReason: firstReason?.reason,
    })
  }

  // Audit log entry. Best-effort — if the insert fails (table missing
  // because the migration hasn't been applied yet, RLS surprise, etc.) we
  // log to console but don't fail the whole call. The emails are already
  // out; the admin shouldn't see a 500 for a missing audit row.
  const { error: logErr } = await db.from('admin_communications_log').insert({
    sent_by: user.email,
    mode,
    subject,
    message,
    recipient_count: sent,
    failed_count: failed,
    city_filters: mode === 'city' ? cityFilters.filter(c => Object.prototype.hasOwnProperty.call(CITY_CONFIGS, c)) : null,
    tier_filter: mode === 'bulk' ? (typeof targets === 'string' ? targets : 'all') : null,
  })
  if (logErr) {
    console.error('[admin/communications] audit log insert failed', logErr)
  }

  return NextResponse.json({ sent, failed, total: list.length })
}

export async function GET() {
  // Same auth gate as POST — admin allowlist via the admin_users table.
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: adminRow } = await db
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Recent first; cap at 50 rows so the panel doesn't ship megabytes when
  // the audit log grows. Add cursor pagination later if needed.
  const { data, error } = await db
    .from('admin_communications_log')
    .select('id, sent_by, mode, subject, recipient_count, failed_count, city_filters, tier_filter, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[admin/communications GET] fetch failed', error)
    return NextResponse.json({ error: error.message, history: [] }, { status: 500 })
  }
  return NextResponse.json({ history: data ?? [] })
}
