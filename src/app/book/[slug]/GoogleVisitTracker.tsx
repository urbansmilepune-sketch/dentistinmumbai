'use client'

import { useEffect } from 'react'

// Counts a booking-page visit that came from the dentist's Google listing
// (the "Book" link carries ?src=google). Fire-and-forget, once per mount.
export default function GoogleVisitTracker({ dentistId }: { dentistId: string }) {
  useEffect(() => {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'google_book_visit' }),
      keepalive: true,
    }).catch(() => {})
  }, [dentistId])
  return null
}
