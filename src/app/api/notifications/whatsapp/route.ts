import { NextRequest, NextResponse } from 'next/server'

// WhatsApp notification via WhatsApp Business API / Twilio / WATI
// For now uses a simple WhatsApp link approach
// Replace with your actual WhatsApp API credentials when ready

const ADMIN_WHATSAPP = '917719903232'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, dentist_phone, dentist_name, patient_name, patient_phone, treatment, area, reference } = body

    let message = ''

    if (type === 'new_appointment') {
      message = `🦷 *New Appointment — dentistinmumbai.in*\n\nRef: ${reference}\nPatient: ${patient_name}\nPhone: ${patient_phone}\nTreatment: ${treatment || 'General'}\n\nReply to confirm.`
    } else if (type === 'new_enquiry') {
      message = `💬 *New Patient Enquiry — dentistinmumbai.in*\n\nPatient: ${patient_name}\nPhone: ${patient_phone}\nLooking for: ${treatment || 'General consultation'}\nArea: ${area}\n\nCall them back!`
    } else if (type === 'new_registration') {
      message = `🏅 *New Dentist Registration*\n\nName: ${dentist_name}\nPhone: ${dentist_phone}\nRef: ${reference}\n\nReview in admin panel.`
    }

    // Log the notification (replace with actual WhatsApp API call)
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
