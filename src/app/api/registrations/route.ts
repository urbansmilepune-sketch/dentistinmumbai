import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRegistrationEmailToAdmin, sendRegistrationEmailToDentist, sendNewRegistrationAdminAlert } from '@/lib/email'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'

const ADMIN_WHATSAPP = '917719903232'

function normalizeCity(v: unknown): CitySlug {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? (v as CitySlug) : DEFAULT_CITY
}

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM-DR-'
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, email, clinic_name, area, qualification, mci_registration, founding_number, selected_plan, city } = body

    if (!name || !phone || !email || !clinic_name || !area || !qualification || !mci_registration) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Whitelist plan input — accept null or one of the two known values; ignore anything else.
    const planValue: 'monthly' | 'annual' | null =
      selected_plan === 'monthly' || selected_plan === 'annual' ? selected_plan : null

    // Whitelist city against the 13 known slugs; unknown / missing → DEFAULT_CITY.
    const cityValue: CitySlug = normalizeCity(city)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: existing } = await supabase
      .from('dentist_registrations')
      .select('id')
      .or(`phone.eq.${phone},email.eq.${email}`)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'A registration with this phone or email already exists.' }, { status: 409 })
    }

    let ref_no = generateRef()
    for (let i = 0; i < 5; i++) {
      const { data: refCheck } = await supabase.from('dentist_registrations').select('id').eq('ref_no', ref_no).single()
      if (!refCheck) break
      ref_no = generateRef()
    }

    const { data, error } = await supabase
      .from('dentist_registrations')
      .insert({ ref_no, name, phone, email, clinic_name, area, qualification, mci_registration, founding_number, selected_plan: planValue, city: cityValue, status: 'pending' })
      .select('ref_no')
      .single()

    if (error) throw error

    // Admin notifications: pre-existing branded emails + new short alert email
    // + a wa.me click-to-chat ping so the admin gets a WhatsApp pop on their phone.
    const adminMsg = `New dentist registration: ${name}, ${clinic_name}, ${area}, ${phone}. Approve here: https://www.dentistinmumbai.in/admin`
    const waUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(adminMsg)}`

    Promise.all([
      sendRegistrationEmailToAdmin({ name, clinic_name, area, phone, email, qualification, ref_no }),
      sendRegistrationEmailToDentist({ name, clinic_name, area, phone, ref_no, to_email: email }),
      sendNewRegistrationAdminAlert({ name, clinic_name, area, phone }),
      fetch(waUrl, { method: 'GET' }).catch(() => null),
    ]).catch(err => console.error('Admin notification failed:', err))

    return NextResponse.json({ ref_no: data.ref_no, success: true })
  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Failed to submit registration' }, { status: 500 })
  }
}
