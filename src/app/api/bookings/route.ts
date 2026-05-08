import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateReference(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      dentist_id, treatment_id, appt_date, time_slot,
      patient_name, patient_phone, patient_email, notes, consent,
    } = body

    if (!dentist_id || !appt_date || !time_slot || !patient_name || !patient_phone || !consent) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Check slot not already booked
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('dentist_id', dentist_id)
      .eq('appt_date', appt_date)
      .eq('time_slot', time_slot)
      .neq('status', 'cancelled')
      .single()

    if (existing) {
      return NextResponse.json({ error: 'This slot is already booked' }, { status: 409 })
    }

    // Generate unique reference
    let reference_no = generateReference()
    let attempts = 0
    while (attempts < 5) {
      const { data: refCheck } = await supabase.from('appointments').select('id').eq('reference_no', reference_no).single()
      if (!refCheck) break
      reference_no = generateReference()
      attempts++
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        reference_no,
        dentist_id,
        treatment_id: treatment_id === 'general' ? null : treatment_id,
        appt_date,
        time_slot,
        patient_name,
        patient_phone,
        patient_email: patient_email || null,
        notes: notes || null,
        consent,
        status: 'pending',
      })
      .select('reference_no')
      .single()

    if (error) throw error

    return NextResponse.json({ reference_no: data.reference_no, success: true })
  } catch (error) {
    console.error('Booking error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
