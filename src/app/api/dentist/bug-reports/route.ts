// Create-only endpoint for dashboard bug reports. dentist_id comes from the
// session, never the client. This route is intentionally PHI-free: it does
// NOT read the patients table or any patient-scoped table, and it persists
// only the redacted page URL, an allow-listed browser_info snapshot, and the
// dentist's description. Anything that could reference a patient (UUIDs, long
// digit runs in the URL) is stripped via redactUrl before insert.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'
import { redactUrl } from '@/lib/redactUrl'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function fail(scope: string, err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
  console.error(`[bug-reports:${scope}]`, err)
  return NextResponse.json({ error: message, scope }, { status })
}

// Only a fixed set of environment fields is accepted, each coerced to a
// trimmed, length-capped string. Anything else the client sends is dropped,
// so browser_info can't become a dumping ground for arbitrary (possibly
// patient) data.
const BROWSER_FIELDS = ['userAgent', 'platform', 'language', 'viewport', 'screen'] as const

function cleanBrowserInfo(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  const src = raw as Record<string, unknown>
  for (const key of BROWSER_FIELDS) {
    const v = src[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 300)
  }
  return out
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    if (!description) return NextResponse.json({ error: 'A description is required' }, { status: 400 })
    if (description.length > 5000) return NextResponse.json({ error: 'Description is too long (5000 char max)' }, { status: 400 })

    const page_url = body.page_url ? redactUrl(body.page_url) : null
    const browser_info = cleanBrowserInfo(body.browser_info)

    const db = admin()
    const { data, error } = await db
      .from('bug_reports')
      .insert({
        dentist_id: owner.id,
        page_url,
        browser_info,
        description: description.slice(0, 5000),
      })
      .select('id, created_at')
      .single()
    if (error) return fail('POST.insert', error)
    return NextResponse.json({ report: data, success: true })
  } catch (err) {
    return fail('POST', err)
  }
}
