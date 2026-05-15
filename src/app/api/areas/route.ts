// GET /api/areas?city=<slug>
//
// Returns the areas table filtered to the given city, ordered by name. Used by
// the public register form to populate its area dropdown dynamically so a
// dentist on dentistinpune.in sees Pune neighbourhoods, not Mumbai ones.
//
// Unknown / missing city → DEFAULT_CITY (mumbai) to keep behavior stable for
// any caller that drops the param.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'

export const dynamic = 'force-dynamic'

function normalizeCity(v: string | null): CitySlug {
  return v && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? (v as CitySlug) : DEFAULT_CITY
}

export async function GET(request: NextRequest) {
  const city = normalizeCity(request.nextUrl.searchParams.get('city'))

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data, error } = await supabase
    .from('areas')
    .select('id, name, slug, zone')
    .eq('city', city)
    .order('name', { ascending: true })

  if (error) {
    console.error('[api/areas] supabase error', { city, error })
    return NextResponse.json({ error: 'Failed to load areas' }, { status: 500 })
  }

  return NextResponse.json({ city, areas: data || [] })
}
