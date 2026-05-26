// PATCH for a single staff_salaries row — used both to edit the breakdown
// and to flip status pending → paid via the Mark-Paid button. When status
// is set to 'paid' we default paid_date to today and accept an optional
// payment_mode in the same request; flipping back to 'pending' clears
// both. net_payable is recomputed on every breakdown edit so the stored
// value never drifts from basic + allowances + bonus - deductions.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function fail(scope: string, err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
  console.error(`[salaries:${scope}]`, err)
  return NextResponse.json({ error: message, scope }, { status })
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const db = admin()
    const { data: existing, error: lookupErr } = await db.from('staff_salaries')
      .select('id, dentist_id, basic_pay, allowances, bonus, deductions')
      .eq('id', id)
      .maybeSingle()
    if (lookupErr) return fail('PATCH.lookup', lookupErr)
    if (!existing || existing.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Salary record not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const update: Record<string, any> = {}

    let breakdownTouched = false
    for (const k of ['basic_pay', 'allowances', 'bonus', 'deductions'] as const) {
      if (body[k] !== undefined) {
        const v = Number(body[k])
        if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: `${k} must be a non-negative number` }, { status: 400 })
        update[k] = v
        breakdownTouched = true
      }
    }
    if (breakdownTouched) {
      const basic = update.basic_pay ?? Number(existing.basic_pay)
      const allow = update.allowances ?? Number(existing.allowances)
      const bonus = update.bonus ?? Number(existing.bonus)
      const ded = update.deductions ?? Number(existing.deductions)
      update.net_payable = basic + allow + bonus - ded
    }

    if (body.status !== undefined) {
      const s = String(body.status).toLowerCase()
      if (!['pending', 'paid'].includes(s)) return NextResponse.json({ error: 'status must be pending or paid' }, { status: 400 })
      update.status = s
      if (s === 'paid') {
        update.paid_date = typeof body.paid_date === 'string' && body.paid_date
          ? body.paid_date
          : new Date().toISOString().slice(0, 10)
        if (typeof body.payment_mode === 'string' && body.payment_mode.trim()) {
          update.payment_mode = body.payment_mode.trim()
        }
      } else {
        update.paid_date = null
        update.payment_mode = null
      }
    } else {
      if (body.payment_mode !== undefined) update.payment_mode = typeof body.payment_mode === 'string' ? body.payment_mode.trim() || null : null
      if (body.paid_date !== undefined) update.paid_date = typeof body.paid_date === 'string' && body.paid_date ? body.paid_date : null
    }

    if (body.notes !== undefined) update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    const { data, error } = await db
      .from('staff_salaries')
      .update(update)
      .eq('id', id)
      .select('id, staff_id, month, year, basic_pay, allowances, bonus, deductions, net_payable, status, payment_mode, paid_date, notes, created_at, updated_at')
      .single()
    if (error) return fail('PATCH.update', error)
    return NextResponse.json({ salary: data, success: true })
  } catch (err) {
    return fail('PATCH', err)
  }
}
