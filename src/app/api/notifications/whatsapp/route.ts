import { NextRequest, NextResponse } from 'next/server'
import { getCityBySlug } from '@/config/cities'

// WhatsApp notification endpoint. **Currently a stub** — every call is
// logged but nothing is delivered. Wire one of WATI / Twilio / MSG91 below
// to ship real messages; until then this route serves as the single
// abstraction every monitoring/admin caller can target without having to
// know about delivery.
//
// Two payload shapes are supported:
//
// 1. Generic — `{ message, to? }`:
//      { "message": "🚨 Health alert: ...", "to": "917719013232" }
//    The cron health-check and registration success/failure pings use this
//    form. `to` defaults to ADMIN_WHATSAPP (the admin phone) when omitted.
//
// 2. Typed — `{ type, ... }`:
//      Legacy shape used by the appointment / enquiry / new-registration
//      flows; the route composes the message string from the typed fields.
//      Kept verbatim for backwards compatibility.

const ADMIN_WHATSAPP = '917719013232'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, message: rawMessage, to, dentist_phone, dentist_name, patient_name, patient_phone, treatment, area, reference, city } = body

    // Generic path — caller already has the exact text it wants delivered.
    if (typeof rawMessage === 'string' && rawMessage.trim().length > 0) {
      const target = typeof to === 'string' && to.length > 0 ? to : ADMIN_WHATSAPP
      console.log('[WhatsApp Notification]', { to: target, message: rawMessage })
      return NextResponse.json({ success: true, message: 'Notification queued' })
    }

    // Typed path — legacy callers that pass structured fields and let this
    // route shape the message.
    const cityCfg = getCityBySlug(city)
    let message = ''

    if (type === 'new_appointment') {
      message = `🦷 *New Appointment — ${cityCfg.domain}*\n\nRef: ${reference}\nPatient: ${patient_name}\nPhone: ${patient_phone}\nTreatment: ${treatment || 'General'}\n\nReply to confirm.`
    } else if (type === 'new_enquiry') {
      message = `💬 *New Patient Enquiry — ${cityCfg.domain}*\n\nPatient: ${patient_name}\nPhone: ${patient_phone}\nLooking for: ${treatment || 'General consultation'}\nArea: ${area}\n\nCall them back!`
    } else if (type === 'new_registration') {
      message = `🏅 *New Dentist Registration*\n\nName: ${dentist_name}\nPhone: ${dentist_phone}\nRef: ${reference}\n\nReview in admin panel.`
    }

    console.log('[WhatsApp Notification]', { type, dentist_phone, message })

    // TODO: Integrate with WATI, Twilio, or MSG91 for actual sending
    // Example with WATI:
    // await fetch('https://live-mt-server.wati.io/api/v1/sendSessionMessage', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${process.env.WATI_API_KEY}` },
    //   body: JSON.stringify({ whatsappNumber: dentist_phone, messageText: message })
    // })

    return NextResponse.json({ success: true, message: 'Notification queued' })
  } catch (error) {
    console.error('[WhatsApp Notification Error]', error)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
