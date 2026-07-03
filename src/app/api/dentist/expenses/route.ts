// List + create for clinic_expenses, scoped to the session dentist.
// dentist_id is taken from the session, never accepted from the client.
// Service role bypasses RLS so we re-verify ownership on mutations and
// scope every read with .eq('dentist_id', owner.id).
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'

const CATEGORIES = ['rent_emi','utilities','marketing','equipment','lab_work','miscellaneous'] as const
type Category = typeof CATEGORIES[number]

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function fail(scope: string, err: unknown, status = 500) {
  // TEMP: Supabase PostgrestError is a plain object, not an Error instance, so
  // the old `instanceof Error` check swallowed the real message as "Unknown error".
  // Surface message + code/details/hint so failures are visible in the Network tab.
  const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown } | null
  const message =
    err instanceof Error ? err.message
      : typeof err === 'string' ? err
      : e && typeof e.message === 'string' && e.message ? e.message
      : 'Unknown error'
  console.error(`[expenses:${scope}]`, err)
  return NextResponse.json(
    { error: message, scope, code: e?.code ?? null, details: e?.details ?? null, hint: e?.hint ?? null },
    { status },
  )
}

function normaliseCategory(raw: unknown): Category | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().replace(/[\s/-]+/g, '_')
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : null
}

// Month/year filter expands to a [start, nextMonthStart) range against the
// expense_date column. Keeps the index usable (no date_trunc / extract).
function monthRange(monthRaw: string | null, yearRaw: string | null): { start: string; end: string } | null {
  if (!monthRaw || !yearRaw) return null
  const month = parseInt(monthRaw, 10)
  const year = parseInt(yearRaw, 10)
  if (!Number.isFinite(month) || month < 1 || month > 12) return null
  if (!Number.isFinite(year) || year < 2000) return null
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { start, end }
}

export async function GET(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const range = monthRange(url.searchParams.get('month'), url.searchParams.get('year'))

    const db = admin()
    let q = db.from('clinic_expenses')
      .select('id, category, description, amount, expense_date, is_recurring, payment_mode, notes, location_id, created_at, updated_at')
      .eq('dentist_id', owner.id)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (range) q = q.gte('expense_date', range.start).lt('expense_date', range.end)

    const { data, error } = await q
    if (error) return fail('GET.select', error)
    return NextResponse.json({ expenses: data ?? [] })
  } catch (err) {
    return fail('GET', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const category = normaliseCategory(body.category)
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const expense_date = typeof body.expense_date === 'string' && body.expense_date ? body.expense_date : null
    const payment_mode = typeof body.payment_mode === 'string' ? body.payment_mode.trim() || null : null
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    const is_recurring = body.is_recurring === true

    if (!category) return NextResponse.json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` }, { status: 400 })
    if (!expense_date) return NextResponse.json({ error: 'expense_date is required (YYYY-MM-DD)' }, { status: 400 })
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })

    const db = admin()
    const { data, error } = await db
      .from('clinic_expenses')
      .insert({
        dentist_id: owner.id,
        category,
        description: description || null,
        amount, expense_date, is_recurring, payment_mode, notes,
      })
      .select('id, category, description, amount, expense_date, is_recurring, payment_mode, notes, location_id, created_at, updated_at')
      .single()
    if (error) return fail('POST.insert', error)
    return NextResponse.json({ expense: data, success: true })
  } catch (err) {
    return fail('POST', err)
  }
}
