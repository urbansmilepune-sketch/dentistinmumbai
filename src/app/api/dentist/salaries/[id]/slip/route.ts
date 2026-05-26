// Returns the salary slip payload the client renders with jsPDF. We don't
// return application/pdf here — the codebase's PDF pattern (see
// src/lib/invoicePdf.ts) is client-side jsPDF, so keeping the renderer
// next to the existing invoice one means no new server dependency and no
// duplicated layout logic.
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

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const db = admin()
    const { data: salary, error: lookupErr } = await db.from('staff_salaries')
      .select('id, dentist_id, staff_id, month, year, basic_pay, allowances, bonus, deductions, net_payable, status, payment_mode, paid_date, notes')
      .eq('id', id)
      .maybeSingle()
    if (lookupErr) return fail('GET.lookup', lookupErr)
    if (!salary || salary.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Salary record not found' }, { status: 404 })
    }

    const [dentistRes, staffRes] = await Promise.all([
      db.from('dentists').select('name, clinic_name, address, phone, city, areas(name)').eq('id', owner.id).maybeSingle(),
      db.from('clinic_staff').select('name, email, role').eq('id', salary.staff_id).maybeSingle(),
    ])
    if (dentistRes.error) return fail('GET.dentist', dentistRes.error)
    if (staffRes.error) return fail('GET.staff', staffRes.error)

    return NextResponse.json({
      slip: {
        ...salary,
        dentist: dentistRes.data ?? null,
        staff: staffRes.data ?? null,
      },
    })
  } catch (err) {
    return fail('GET', err)
  }
}
