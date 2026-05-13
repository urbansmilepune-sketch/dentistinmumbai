'use client'

import { useEffect } from 'react'

export default function ViewTracker({ dentistId }: { dentistId: string }) {
  useEffect(() => {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'profile_view' }),
      keepalive: true,
    }).catch(() => {})
  }, [dentistId])

  return null
}
