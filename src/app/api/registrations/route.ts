import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendRegistrationEmailToAdmin,
  sendRegistrationEmailToDentist,
  sendNewRegistrationAdminAlert,
  sendAutoApprovedAdminAlert,
} from '@/lib/email'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { approveDentistRegistration } from '@/lib/approval'

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

interface AutoApprovalInput {
  name: string
  phone: string
  clinic_name: string
  area: string
  mci_registration: string
}

/**
 * Gate that decides whether a fresh registration can skip the admin queue.
 * Returns null if all checks pass; otherwise the failure reason (for logs).
 * Keep this conservative — a false positive ships a dentist live without
 * human review. The signals here are low-effort to forge but also cheap to
 * undo: the admin can decline + delete the dentist row after the fact.
 */
function autoApprovalFailureReason(input: AutoApprovalInput): string | null {
  const phoneDigits = (input.phone || '').replace(/\D/g, '')
  if (phoneDigits.length !== 10) return `phone has ${phoneDigits.length} digits, need exactly 10`
  if (!(input.mci_registration || '').trim()) return 'mci_registration empty'
  if ((input.name || '').trim().length <= 3) return 'name too short (≤3 chars)'
  if ((input.clinic_name || '').trim().length <= 3) return 'clinic_name too short (≤3 chars)'
  if (!(input.area || '').trim()) return 'area empty'
  return null
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
      .select('id, ref_no')
      .single()

    if (error) throw error

    // ---- Auto-approval gate -------------------------------------------------
    // Decide whether we can promote this registration to 'approved' right now.
    // The check uses the values just submitted (no need to re-fetch the row).
    // If anything trips the gate we leave the row 'pending' and fall through
    // to the standard admin-alert path.
    const failReason = autoApprovalFailureReason({ name, phone, clinic_name, area, mci_registration })
    const cityDomain = CITY_CONFIGS[cityValue].domain

    if (failReason === null) {
      const result = await approveDentistRegistration(supabase, data.id, { autoApproved: true })
      if (result.ok) {
        console.log('[registrations] auto-approved', { ref_no: data.ref_no, slug: result.slug })
        // Tell the admin this happened — but skip the "approve here" alert
        // (there's nothing left to approve) and skip the dentist's "we'll
        // review in 24h" email (the approval email already went out from the
        // helper). One focused admin alert is enough.
        sendAutoApprovedAdminAlert({
          name, clinic_name, area, phone, email,
          ref_no: data.ref_no, slug: result.slug, city: cityValue,
        }).catch(err => console.error('[registrations] auto-approve admin alert failed:', err))

        return NextResponse.json({ ref_no: data.ref_no, success: true, auto_approved: true, slug: result.slug })
      }
      // Helper failed — degrade gracefully to the manual-review path so the
      // dentist doesn't see a 500 just because, say, the slugify collided.
      console.log('[registrations] auto-approve helper failed, leaving pending', { ref_no: data.ref_no, result })
    } else {
      console.log('[registrations] auto-approval gate failed', { ref_no: data.ref_no, reason: failReason })
    }

    // Manual-review path: pre-existing branded emails + new short alert email
    // + a wa.me click-to-chat ping so the admin gets a WhatsApp pop on their phone.
    const adminMsg = `New dentist registration: ${name}, ${clinic_name}, ${area}, ${phone}. Approve here: https://${cityDomain}/admin`
    const waUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(adminMsg)}`

    Promise.all([
      sendRegistrationEmailToAdmin({ name, clinic_name, area, phone, email, qualification, ref_no, city: cityValue }),
      sendRegistrationEmailToDentist({ name, clinic_name, area, phone, ref_no, to_email: email, city: cityValue }),
      sendNewRegistrationAdminAlert({ name, clinic_name, area, phone, city: cityValue }),
      fetch(waUrl, { method: 'GET' }).catch(() => null),
    ]).catch(err => console.error('Admin notification failed:', err))

    return NextResponse.json({ ref_no: data.ref_no, success: true, auto_approved: false })
  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Failed to submit registration' }, { status: 500 })
  }
}
