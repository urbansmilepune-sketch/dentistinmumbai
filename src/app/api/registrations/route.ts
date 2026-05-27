import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
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
  area_name_raw: string | null
  mci_registration: string
}

/**
 * Gate that decides whether a fresh registration can skip the admin queue.
 * Returns null if all checks pass; otherwise the failure reason (for logs).
 * Keep this conservative — a false positive ships a dentist live without
 * human review. The signals here are low-effort to forge but also cheap to
 * undo: the admin can decline + delete the dentist row after the fact.
 *
 * "Other"-path registrations send area='' and area_name_raw=<typed>; we
 * accept that as a non-empty area for the gate. The approval helper will
 * auto-create the area row when it doesn't exist.
 */
function autoApprovalFailureReason(input: AutoApprovalInput): string | null {
  const phoneDigits = (input.phone || '').replace(/\D/g, '')
  if (phoneDigits.length !== 10) return `phone has ${phoneDigits.length} digits, need exactly 10`
  if (!(input.mci_registration || '').trim()) return 'mci_registration empty'
  if ((input.name || '').trim().length <= 3) return 'name too short (≤3 chars)'
  if ((input.clinic_name || '').trim().length <= 3) return 'clinic_name too short (≤3 chars)'
  const effectiveArea = (input.area || '').trim() || (input.area_name_raw || '').trim()
  if (!effectiveArea) return 'area empty'
  return null
}

export async function POST(request: NextRequest) {
  // Origin for internal fire-and-forget pings. Hoisted out of the try
  // block so the catch handler can still reach the WhatsApp endpoint when
  // an error happens during body parsing or DB writes.
  const origin = new URL(request.url).origin
  function notifyAdmin(msg: string) {
    fetch(`${origin}/api/notifications/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    }).catch(err => console.error('[registrations] admin whatsapp failed', err))
  }

  // Hoisted so the catch handler can include the email in the failure
  // ping — otherwise we'd alert "🚨 FAILED for undefined" on every
  // upstream parse error.
  let emailForAlert: string | undefined

  try {
    const body = await request.json()
    const { name, phone, email, clinic_name, area, qualification, mci_registration, founding_number, selected_plan, city } = body
    emailForAlert = typeof email === 'string' ? email : undefined
    const rawAreaName = typeof body.area_name_raw === 'string' ? body.area_name_raw.trim() : null
    const area_name_raw = rawAreaName && rawAreaName.length > 0 ? rawAreaName : null

    // Either a curated area name or the free-text "Other" value is fine —
    // the rest of the pipeline (auto-approval gate, approval helper) reads
    // both columns and treats either one as the source of truth.
    if (!name || !phone || !email || !clinic_name || !qualification || !mci_registration) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!area && !area_name_raw) {
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

    // Two separate eq() queries instead of .or(`phone.eq.${phone},email.eq.${email}`).
    // The PostgREST .or() syntax embeds values into a parsed expression
    // string; a comma, paren, or `).foo(` in the user-supplied phone/email
    // would let an attacker rewrite the filter (or break the parse and
    // surface as an empty match that bypasses the dedupe check). Two
    // explicit eq() calls keep each value strictly as a value.
    const [phoneCheck, emailCheck] = await Promise.all([
      supabase.from('dentist_registrations').select('id').eq('phone', phone).maybeSingle(),
      supabase.from('dentist_registrations').select('id').eq('email', email).maybeSingle(),
    ])
    if (phoneCheck.data || emailCheck.data) {
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
      .insert({ ref_no, name, phone, email, clinic_name, area, area_name_raw, qualification, mci_registration, founding_number, selected_plan: planValue, city: cityValue, status: 'pending' })
      .select('id, ref_no')
      .single()

    if (error) throw error

    // Cold-outreach attribution. If we previously cold-emailed this dentist,
    // mark the contact as 'registered' and bump the source campaign's
    // registration_count. Wrapped in a try/catch so a missing table /
    // schema-drift can't 500 the registration flow — attribution loss is
    // strictly worse than a 500 here, but neither is acceptable.
    try {
      const lower = String(email).trim().toLowerCase()
      const { data: contact } = await supabase
        .from('outreach_contacts')
        .select('id, campaign_id, registered_at')
        .eq('email', lower)
        .maybeSingle()
      if (contact && !contact.registered_at) {
        await supabase
          .from('outreach_contacts')
          .update({ status: 'registered', registered_at: new Date().toISOString() })
          .eq('id', contact.id)
        if (contact.campaign_id) {
          const { data: campaign } = await supabase
            .from('outreach_campaigns')
            .select('id, registration_count')
            .eq('id', contact.campaign_id)
            .maybeSingle()
          if (campaign) {
            await supabase
              .from('outreach_campaigns')
              .update({ registration_count: (campaign.registration_count || 0) + 1 })
              .eq('id', campaign.id)
          }
        }
      }
    } catch (err) {
      console.error('[registrations] outreach attribution skipped:', err)
    }

    // Monitoring ping — fires once per successful insert regardless of
    // whether the row auto-approves or falls through to manual review.
    // If these stop arriving during business hours for 2+ hours, something
    // is wrong upstream (form, CDN, captcha, etc.).
    notifyAdmin(`✅ New Registration: ${name} from ${cityValue} - ${data.ref_no}`)

    // Effective area name for downstream emails / alerts. "Other" path
    // registrations send area='' and area_name_raw=<typed>, so we collapse
    // to whichever one is set.
    const areaForDisplay = (area && area.trim()) || (area_name_raw || '')

    // ---- Auto-approval gate -------------------------------------------------
    // Decide whether we can promote this registration to 'approved' right now.
    // The check uses the values just submitted (no need to re-fetch the row).
    // If anything trips the gate we leave the row 'pending' and fall through
    // to the standard admin-alert path.
    const failReason = autoApprovalFailureReason({ name, phone, clinic_name, area, area_name_raw, mci_registration })
    const cityDomain = CITY_CONFIGS[cityValue].domain

    if (failReason === null) {
      // requestOrigin → the city the dentist registered from. The
      // approval helper uses it as the magic-link redirect base so the
      // auth cookie set by Supabase lands on the same apex their
      // browser will hit next.
      const requestOrigin = request.headers.get('origin')
        || request.headers.get('referer')?.split('/').slice(0, 3).join('/')
        || null
      const result = await approveDentistRegistration(supabase, data.id, { autoApproved: true, requestOrigin })
      if (result.ok) {
        console.log('[registrations] auto-approved', { ref_no: data.ref_no, slug: result.slug })
        // Tell the admin this happened — but skip the "approve here" alert
        // (there's nothing left to approve) and skip the dentist's "we'll
        // review in 24h" email (the approval email already went out from the
        // helper). One focused admin alert is enough.
        sendAutoApprovedAdminAlert({
          name, clinic_name, area: areaForDisplay, phone, email,
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
    const adminMsg = `New dentist registration: ${name}, ${clinic_name}, ${areaForDisplay}, ${phone}. Approve here: https://${cityDomain}/admin`
    const waUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(adminMsg)}`

    Promise.all([
      sendRegistrationEmailToAdmin({ name, clinic_name, area: areaForDisplay, phone, email, qualification, ref_no, city: cityValue }),
      sendRegistrationEmailToDentist({ name, clinic_name, area: areaForDisplay, phone, ref_no, to_email: email, city: cityValue }),
      sendNewRegistrationAdminAlert({ name, clinic_name, area: areaForDisplay, phone, city: cityValue }),
      fetch(waUrl, { method: 'GET' }).catch(() => null),
    ]).catch(err => console.error('Admin notification failed:', err))

    return NextResponse.json({ ref_no: data.ref_no, success: true, auto_approved: false })
  } catch (error: any) {
    console.error('Registration error:', error)
    // Ship the raw error to Sentry alongside the WhatsApp/log alerts — the
    // admin ping gives a heads-up, Sentry gives the stack trace + breadcrumbs.
    Sentry.captureException(error)
    notifyAdmin(`🚨 Registration FAILED for ${emailForAlert ?? 'unknown email'} - Error: ${error?.message ?? 'unknown'}`)
    return NextResponse.json({ error: 'Failed to submit registration' }, { status: 500 })
  }
}
