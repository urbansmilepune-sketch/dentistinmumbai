// PATCH / DELETE for a single clinic_expenses row. Companion file
// route.ts has the category list + shared notes.
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
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
  console.error(`[expenses:${scope}]`, err)
  return NextResponse.json({ error: message, scope }, { status })
}

function normaliseCategory(raw: unknown): Category | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().replace(/[\s/-]+/g, '_')
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : null
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const db = admin()
    const { data: existing, error: lookupErr } = await db.from('clinic_expenses').select('id, dentist_id').eq('id', id).maybeSingle()
    if (lookupErr) return fail('PATCH.lookup', lookupErr)
    if (!existing || existing.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const update: Record<string, any> = {}

    if (body.category !== undefined) {
      const cat = normaliseCategory(body.category)
      if (!cat) return NextResponse.json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` }, { status: 400 })
      update.category = cat
    }
    if (body.description !== undefined) {
      update.description = typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if (body.amount !== undefined) {
      const n = Number(body.amount)
      if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
      update.amount = n
    }
    if (body.expense_date !== undefined) {
      if (typeof body.expense_date !== 'string' || !body.expense_date) return NextResponse.json({ error: 'expense_date must be YYYY-MM-DD' }, { status: 400 })
      update.expense_date = body.expense_date
    }
    if (body.is_recurring !== undefined) update.is_recurring = body.is_recurring === true
    if (body.payment_mode !== undefined) update.payment_mode = typeof body.payment_mode === 'string' ? body.payment_mode.trim() || null : null
    if (body.notes !== undefined) update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    const { data, error } = await db
      .from('clinic_expenses')
      .update(update)
      .eq('id', id)
      .select('id, category, description, amount, expense_date, is_recurring, payment_mode, notes, location_id, created_at, updated_at')
      .single()
    if (error) return fail('PATCH.update', error)
    return NextResponse.json({ expense: data, success: true })
  } catch (err) {
    return fail('PATCH', err)
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const db = admin()
    const { data: existing, error: lookupErr } = await db.from('clinic_expenses').select('id, dentist_id').eq('id', id).maybeSingle()
    if (lookupErr) return fail('DELETE.lookup', lookupErr)
    if (!existing || existing.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const { error } = await db.from('clinic_expenses').delete().eq('id', id)
    if (error) return fail('DELETE.delete', error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return fail('DELETE', err)
  }
}
