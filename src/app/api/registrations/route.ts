import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM-DR-'
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, email, clinic_name, area, qualification, mci_registration, founding_number } = body

    if (!name || !phone || !email || !clinic_name || !area || !qualification || !mci_registration) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Check for duplicate phone/email
    const { data: existing } = await supabase
      .from('dentist_registrations')
      .select('id')
      .or(`phone.eq.${phone},email.eq.${email}`)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'A registration with this phone or email already exists.' }, { status: 409 })
    }

    // Generate unique ref
    let ref_no = generateRef()
    for (let i = 0; i < 5; i++) {
      const { data: refCheck } = await supabase.from('dentist_registrations').select('id').eq('ref_no', ref_no).single()
      if (!refCheck) break
      ref_no = generateRef()
    }

    const { data, error } = await supabase
      .from('dentist_registrations')
      .insert({ ref_no, name, phone, email, clinic_name, area, qualification, mci_registration, founding_number, status: 'pending' })
      .select('ref_no')
      .single()

    if (error) throw error

    return NextResponse.json({ ref_no: data.ref_no, success: true })
  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Failed to submit registration' }, { status: 500 })
  }
}
