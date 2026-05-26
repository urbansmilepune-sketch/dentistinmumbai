// Staff salary records, one row per (staff_id, month, year). The Salaries
// tab on /dashboard/expenses auto-populates from clinic_staff for the
// selected period — rows without a salary record show "Add Salary"; rows
// with a record show the breakdown + Mark-Paid + Download-Slip actions.
//
// We deliberately don't use a PostgREST FK join (clinic_staff:staff_id(...))
// here because we've been bitten by silent FK detection misses elsewhere
// (see commit fb0412d). The page joins staff ↔ salary client-side instead.
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

export async function GET(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const monthRaw = url.searchParams.get('month')
    const yearRaw = url.searchParams.get('year')

    const db = admin()
    let q = db.from('staff_salaries')
      .select('id, staff_id, month, year, basic_pay, allowances, bonus, deductions, net_payable, status, payment_mode, paid_date, notes, created_at, updated_at')
      .eq('dentist_id', owner.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    if (monthRaw && yearRaw) {
      const month = parseInt(monthRaw, 10)
      const year = parseInt(yearRaw, 10)
      if (Number.isFinite(month) && Number.isFinite(year)) {
        q = q.eq('month', month).eq('year', year)
      }
    }

    const { data, error } = await q
    if (error) return fail('GET.select', error)
    return NextResponse.json({ salaries: data ?? [] })
  } catch (err) {
    return fail('GET', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const staff_id = typeof body.staff_id === 'string' ? body.staff_id : ''
    const month = Number(body.month)
    const year = Number(body.year)
    const basic_pay = Number(body.basic_pay ?? 0)
    const allowances = Number(body.allowances ?? 0)
    const bonus = Number(body.bonus ?? 0)
    const deductions = Number(body.deductions ?? 0)
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    if (!staff_id) return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
    if (!Number.isFinite(month) || month < 1 || month > 12) return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 })
    if (!Number.isFinite(year) || year < 2000) return NextResponse.json({ error: 'year is required' }, { status: 400 })
    for (const [n, v] of [['basic_pay', basic_pay], ['allowances', allowances], ['bonus', bonus], ['deductions', deductions]] as const) {
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: `${n} must be a non-negative number` }, { status: 400 })
    }

    const db = admin()
    // Staff row must belong to the session dentist — service role bypasses RLS.
    const { data: staffRow, error: staffErr } = await db.from('clinic_staff').select('id, dentist_id').eq('id', staff_id).maybeSingle()
    if (staffErr) return fail('POST.staff-lookup', staffErr)
    if (!staffRow || staffRow.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    const net_payable = basic_pay + allowances + bonus - deductions
    const { data, error } = await db
      .from('staff_salaries')
      .insert({
        dentist_id: owner.id,
        staff_id, month, year,
        basic_pay, allowances, bonus, deductions, net_payable,
        notes,
      })
      .select('id, staff_id, month, year, basic_pay, allowances, bonus, deductions, net_payable, status, payment_mode, paid_date, notes, created_at, updated_at')
      .single()
    if (error) {
      // 23505 = unique_violation; the (staff_id, month, year) constraint
      // catches double-clicks on Add Salary and POSTs from a stale tab.
      if ((error as any).code === '23505') {
        return NextResponse.json({ error: 'Salary already recorded for this staff member in this month' }, { status: 409 })
      }
      return fail('POST.insert', error)
    }
    return NextResponse.json({ salary: data, success: true })
  } catch (err) {
    return fail('POST', err)
  }
}
