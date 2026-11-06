// Google Maps "Book" button: the dentist adds their DentistIn booking link to
// the "Appointment links" field of their Google Business Profile.
//
// The link carries ?src=google so the booking page can count visits that came
// from Google (analytics_events 'google_book_visit'). When the dentist ticks
// "I've added it", we log one 'gbp_link_added' event; its presence is what
// moves the dashboard card from "set it up" to "live". No new table needed.

import { getCityBySlug } from '@/config/cities'

export const GBP_ADDED_EVENT = 'gbp_link_added'
export const GOOGLE_VISIT_EVENT = 'google_book_visit'

export function googleBookingLink(slug: string, city: string | null | undefined): string {
  const { domain } = getCityBySlug(city)
  return `https://${domain}/book/${slug}?src=google`
}

// Message a dentist can forward to whoever manages their Google listing.
export function googleStepsMessage(link: string, clinicName: string): string {
  return [
    `Please add our online booking link to the Google listing of ${clinicName || 'our clinic'}:`,
    '',
    link,
    '',
    '1. Open the clinic on Google (search the clinic name while signed in) and tap "Edit profile".',
    '2. Go to Contact, then "Appointment links" (not Website).',
    '3. Paste the link above and tap Save.',
    '',
    'Patients will then see a "Book" button on Google Maps.',
  ].join('\n')
}
