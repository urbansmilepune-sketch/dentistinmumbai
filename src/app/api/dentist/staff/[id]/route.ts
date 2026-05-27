import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const db = admin()
  // Soft-remove (status='inactive') instead of a hard delete so re-inviting
  // the same person keeps history. The list query filters 'inactive' out so
  // they're invisible in the UI either way.
  const { data: existing } = await db.from('clinic_staff').select('id, dentist_id').eq('id', id).maybeSingle()
  if (!existing || existing.dentist_id !== owner.id) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  const { error } = await db.from('clinic_staff').update({ status: 'inactive' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Partial update — currently used to reassign a staff member to a different
// branch (location_id), but written to honour any subset of editable fields
// passed in the body. Empty string / explicit null on location_id clears
// the assignment back to "all branches".
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const patch: Record<string, unknown> = {}
  if ('location_id' in body) {
    const l = body.location_id
    patch.location_id = typeof l === 'string' && l ? l : null
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const db = admin()
  const { data: existing } = await db.from('clinic_staff').select('id, dentist_id').eq('id', id).maybeSingle()
  if (!existing || existing.dentist_id !== owner.id) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }
  const { error } = await db.from('clinic_staff').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
