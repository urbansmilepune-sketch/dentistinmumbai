'use client'

import type { AnchorHTMLAttributes } from 'react'

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  dentistId: string
  eventType: 'whatsapp_click' | 'call_click' | 'booking_click'
}

export default function TrackedLink({ dentistId, eventType, onClick, children, ...rest }: Props) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: eventType }),
      keepalive: true,
    }).catch(() => {})
    onClick?.(e)
  }

  return (
    <a {...rest} onClick={handleClick}>
      {children}
    </a>
  )
}
