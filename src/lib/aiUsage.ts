// Daily per-dentist rate limiting for the AI assistant endpoints. Each dentist
// gets a fixed number of AI calls per day, tracked in the ai_usage_log table.
// Shared by the prescription-suggest and refine-notes routes so the cap is a
// single combined budget across both.
//
// Writes use the service-role client (bypasses RLS) — the same pattern as the
// bug_reports route — so dentists can't forge or delete rows to dodge the cap.
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const DAILY_AI_LIMIT = 20

export const AI_LIMIT_MESSAGE =
  'Daily AI limit reached (20 uses).\nResets tomorrow. Write manually for now.'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// IST is UTC+5:30 with no DST. Every clinic runs on local time, so the daily
// limit should reset at IST midnight, not UTC midnight ("Resets tomorrow"
// means tomorrow for the dentist). Returns the UTC instant of the most recent
// IST midnight.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function startOfTodayIST(): Date {
  const nowAsIst = new Date(Date.now() + IST_OFFSET_MS)
  nowAsIst.setUTCHours(0, 0, 0, 0)
  return new Date(nowAsIst.getTime() - IST_OFFSET_MS)
}

export type RateLimitResult = { ok: true } | { ok: false; message: string }

// Returns ok:false (with the dentist-facing message) once the dentist has hit
// the daily cap. Fails open on a query error: the AI is an assistant and must
// never hard-block the clinical form because of a logging-table hiccup.
export async function checkAiRateLimit(dentistId: string): Promise<RateLimitResult> {
  const { count, error } = await admin()
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('dentist_id', dentistId)
    .gte('created_at', startOfTodayIST().toISOString())

  if (error) {
    console.error('[ai-usage:check]', error)
    return { ok: true }
  }
  if ((count ?? 0) >= DAILY_AI_LIMIT) return { ok: false, message: AI_LIMIT_MESSAGE }
  return { ok: true }
}

// Records one AI call against the dentist's daily budget. Best-effort: a
// logging failure is swallowed (logged server-side) so it never breaks the
// response the dentist is waiting on.
export async function logAiUsage(
  dentistId: string,
  action: string,
  tokensUsed: number | null,
): Promise<void> {
  try {
    const { error } = await admin().from('ai_usage_log').insert({
      dentist_id: dentistId,
      action,
      tokens_used: tokensUsed,
    })
    if (error) console.error('[ai-usage:log]', error)
  } catch (err) {
    console.error('[ai-usage:log]', err)
  }
}
