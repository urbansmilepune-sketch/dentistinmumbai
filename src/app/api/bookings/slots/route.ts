import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dentist_id = searchParams.get('dentist_id')
  const date = searchParams.get('date')
  // Optional. When present, a multi-branch dentist's slot list only counts
  // appointments at the selected branch — 10 AM at branch A doesn't block
  // 10 AM at branch B. When absent, falls back to the legacy dentist-wide
  // booked-slot list.
  const location_id = searchParams.get('location_id')

  if (!dentist_id || !date) {
    return NextResponse.json({ slots: [] })
  }

  const supabase = await createClient()
  let q = supabase
    .from('appointments')
    .select('time_slot')
    .eq('dentist_id', dentist_id)
    .eq('appt_date', date)
    .neq('status', 'cancelled')
  if (location_id) q = q.eq('location_id', location_id)
  const { data } = await q

  const slots = data?.map(a => a.time_slot) || []
  return NextResponse.json({ slots })
}
