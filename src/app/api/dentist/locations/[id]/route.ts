// PATCH / DELETE for a single clinic_locations row. The companion file
// route.ts has the schema notes — the same column rename applies here
// (clinic_name not name; no sort_order; no updated_at).
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDentistOwner } from '@/lib/dentistSession'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function slugifyArea(input: string): string {
  return input.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60)
}

function fail(scope: string, err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
  console.error(`[locations:${scope}]`, err)
  return NextResponse.json({ error: message, scope }, { status })
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params

    const db = admin()
    // Ownership check — service role bypasses RLS, so we re-verify here.
    const { data: existing, error: lookupErr } = await db.from('clinic_locations').select('id, dentist_id, city').eq('id', id).maybeSingle()
    if (lookupErr) return fail('PATCH.lookup', lookupErr)
    if (!existing || existing.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const update: Record<string, any> = {}
    if (typeof body.name === 'string') update.clinic_name = body.name.trim()
    if (typeof body.address === 'string') update.address = body.address.trim()
    if (typeof body.phone === 'string') update.phone = body.phone.trim() || null
    if (typeof body.city === 'string' && body.city) update.city = body.city
    if (body.working_hours !== undefined) update.working_hours = body.working_hours

    // Same area-resolve flow as create. Only fire if the client actually sent
    // an area_name field, so untouched PATCHes don't accidentally null out the
    // area_id.
    if (typeof body.area_name === 'string') {
      const areaName = body.area_name.trim()
      update.area_name_raw = areaName || null
      if (!areaName) {
        update.area_id = null
      } else {
        const cityForArea = (update.city as string) || existing.city || 'mumbai'
        const { data: areaExact } = await db.from('areas').select('id').eq('name', areaName).maybeSingle()
        if (areaExact) update.area_id = areaExact.id
        else {
          const { data: areaCi } = await db.from('areas').select('id').ilike('name', areaName).maybeSingle()
          if (areaCi) update.area_id = areaCi.id
          else {
            const { data: newArea, error: areaErr } = await db.from('areas').insert({ name: areaName, slug: slugifyArea(areaName), zone: 'Other', city: cityForArea }).select('id').single()
            if (areaErr) return fail('PATCH.area-insert', areaErr)
            if (newArea) update.area_id = newArea.id
          }
        }
      }
    }

    // Primary flip is its own little dance: demote whoever was primary, then
    // promote this row. Two writes, but the partial unique index won't let us
    // collapse it into a single upsert without a race.
    if (body.is_primary === true) {
      const { error: demoteErr } = await db.from('clinic_locations').update({ is_primary: false }).eq('dentist_id', owner.id).eq('is_primary', true)
      if (demoteErr) return fail('PATCH.demote-primary', demoteErr)
      update.is_primary = true
    } else if (body.is_primary === false) {
      update.is_primary = false
    }

    const { error } = await db.from('clinic_locations').update(update).eq('id', id)
    if (error) return fail('PATCH.update', error)
    return NextResponse.json({ success: true })
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
    const { data: existing, error: lookupErr } = await db.from('clinic_locations').select('id, dentist_id, is_primary').eq('id', id).maybeSingle()
    if (lookupErr) return fail('DELETE.lookup', lookupErr)
    if (!existing || existing.dentist_id !== owner.id) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const { error } = await db.from('clinic_locations').delete().eq('id', id)
    if (error) return fail('DELETE.delete', error)

    // If we just deleted the primary, promote whichever location is left so
    // the "always exactly one primary when count > 0" invariant holds.
    if (existing.is_primary) {
      const { data: next } = await db
        .from('clinic_locations')
        .select('id')
        .eq('dentist_id', owner.id)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (next) {
        await db.from('clinic_locations').update({ is_primary: true }).eq('id', next.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return fail('DELETE', err)
  }
}
