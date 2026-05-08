import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dentist_id = searchParams.get('dentist_id')
  const date = searchParams.get('date')

  if (!dentist_id || !date) {
    return NextResponse.json({ slots: [] })
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('appointments')
    .select('time_slot')
    .eq('dentist_id', dentist_id)
    .eq('appt_date', date)
    .neq('status', 'cancelled')

  const slots = data?.map(a => a.time_slot) || []
  return NextResponse.json({ slots })
}
