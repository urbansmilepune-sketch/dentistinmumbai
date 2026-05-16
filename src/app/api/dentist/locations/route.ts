// Locations CRUD for the dashboard. Scoped to whatever dentist owns the
// current session — we never accept a dentist_id from the client.
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

export async function GET() {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data, error } = await db
    .from('clinic_locations')
    .select('id, name, address, area_id, area_name_raw, city, phone, working_hours, is_primary, sort_order, created_at, areas(name, slug)')
    .eq('dentist_id', owner.id)
    .order('is_primary', { ascending: false })
    .order('sort_order')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locations: data ?? [] })
}

export async function POST(request: NextRequest) {
  const owner = await getDentistOwner()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const areaName = typeof body.area_name === 'string' ? body.area_name.trim() : ''
  const city = typeof body.city === 'string' && body.city ? body.city : (owner.city ?? 'mumbai')
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null
  const workingHours = body.working_hours ?? null
  const isPrimary = body.is_primary === true

  if (!name) return NextResponse.json({ error: 'Clinic name is required' }, { status: 400 })

  const db = admin()

  // Resolve area: exact name → case-insensitive name → auto-create (same
  // pattern as registration approval). Free-text raw value is kept on the
  // row for the rare case the area row was deleted later.
  let area_id: string | null = null
  if (areaName) {
    const { data: areaExact } = await db.from('areas').select('id').eq('name', areaName).maybeSingle()
    if (areaExact) area_id = areaExact.id
    else {
      const { data: areaCi } = await db.from('areas').select('id').ilike('name', areaName).maybeSingle()
      if (areaCi) area_id = areaCi.id
      else {
        const { data: newArea } = await db.from('areas').insert({ name: areaName, slug: slugifyArea(areaName), zone: 'Other', city }).select('id').single()
        if (newArea) area_id = newArea.id
      }
    }
  }

  // If is_primary is requested, atomically demote any existing primary first.
  // The partial unique index would otherwise reject the insert.
  if (isPrimary) {
    await db.from('clinic_locations').update({ is_primary: false }).eq('dentist_id', owner.id).eq('is_primary', true)
  }

  // First location auto-promotes to primary — saves the dentist a click and
  // keeps the public profile consistent (there's always exactly one primary
  // when count > 0).
  const { count: existingCount } = await db
    .from('clinic_locations')
    .select('id', { count: 'exact', head: true })
    .eq('dentist_id', owner.id)
  const autoPrimary = (existingCount ?? 0) === 0

  const { data, error } = await db
    .from('clinic_locations')
    .insert({
      dentist_id: owner.id,
      name, address, area_id, area_name_raw: areaName || null,
      city, phone, working_hours: workingHours,
      is_primary: isPrimary || autoPrimary,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id, success: true })
}
