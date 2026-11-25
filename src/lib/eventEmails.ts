// Emails to the person who listed an event or course: "we've got it" on
// submit and "it's live" on approval. Best effort, never throws.
//
// From address: EVENT_EMAIL_FROM if set, else hello@dentistinindia.in (that
// domain must be verified in Resend, or set EVENT_EMAIL_FROM to a city
// address such as "DentistIn <hello@dentistinmumbai.in>").

import { Resend } from 'resend'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { getCityFrom } from '@/lib/email'

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

async function send(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY || !to) return
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: process.env.EVENT_EMAIL_FROM || getCityFrom(null, { national: true }), to, subject, html })
  } catch (err) {
    console.error('[eventEmails] send failed', err)
  }
}

const wrap = (body: string) => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1923">${body}<p style="color:#64748B;font-size:12px;margin-top:24px">Team DentistIn India</p></div>`

export function sendListingReceivedEmail(p: { to: string; id: string; title: string; featured: boolean; amount: number | null; payUrl: string | null }) {
  const status = `${NATIONAL_ORIGIN}/events/listing/${p.id}`
  const pay = p.featured
    ? p.payUrl
      ? `<p>To finish your Featured listing, pay ₹${(p.amount || 0).toLocaleString('en-IN')} here: <a href="${esc(p.payUrl)}">${esc(p.payUrl)}</a>. If we don't approve it, we refund you in full.</p>`
      : `<p>You chose a Featured listing (₹${(p.amount || 0).toLocaleString('en-IN')}). We'll send you a payment link after we check the details.</p>`
    : ''
  return send(p.to, `We've got your listing: ${p.title}`, wrap(
    `<p>Thanks for listing <b>${esc(p.title)}</b> on DentistIn India.</p>${pay}<p>Our team checks every listing, usually within a day. See its status any time: <a href="${status}">${status}</a></p>`,
  ))
}

export function sendListingLiveEmail(p: { to: string; id: string; title: string; featured: boolean }) {
  const link = `${NATIONAL_ORIGIN}/events?e=${p.id}#ev-${p.id}`
  return send(p.to, `Your listing is live: ${p.title}`, wrap(
    `<p><b>${esc(p.title)}</b> is now live on DentistIn India: <a href="${link}">${link}</a></p>${p.featured ? '<p>As a Featured listing, dentists in your chosen area get an email and WhatsApp alert within a day, and again 2 days before your event.</p>' : ''}<p>Share the link with your attendees.</p>`,
  ))
}
