import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { dentist_id, event_type } = await request.json()
    // event_type: 'profile_view' | 'whatsapp_click' | 'call_click' | 'booking_click' | 'case_share'
    // case_share is attributed to the case's *author* — the sharer can be
    // anyone, but the signal we care about is "this dentist's work got
    // amplified". No per-channel counter on the dentists table yet, so
    // the increment_counter step below skips it.

    if (!dentist_id || !event_type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const validEvents = ['profile_view', 'whatsapp_click', 'call_click', 'booking_click', 'case_share']
    if (!validEvents.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    // Insert event log
    await supabase.from('analytics_events').insert({
      dentist_id, event_type,
      created_at: new Date().toISOString(),
    })

    // Update dentist counters
    const counterField: Record<string, string> = {
      profile_view: 'profile_views',
      whatsapp_click: 'whatsapp_clicks',
      call_click: 'call_clicks',
      booking_click: 'booking_clicks',
    }

    const field = counterField[event_type]
    if (field) {
      await supabase.rpc('increment_counter', { dentist_id, field_name: field })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
