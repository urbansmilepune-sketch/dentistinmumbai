'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

interface Props {
  dentistId: string
  href: string
  style?: CSSProperties
  className?: string
  children: ReactNode
}

// next/link wrapper that fires a booking_click analytics event before
// the client-side navigation runs. `keepalive: true` on the fetch lets
// the request complete after the page transition kicks off so we don't
// lose the event on slow connections. TrackedLink (the sibling) renders
// a plain <a> because its callers are tel:/wa.me/ links where prefetch
// + client-side navigation don't apply; this component is the variant
// for internal book-flow routes that need next/link semantics.
export default function TrackedBookingLink({ dentistId, href, style, className, children }: Props) {
  function handleClick() {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'booking_click' }),
      keepalive: true,
    }).catch(() => {})
  }
  return (
    <Link href={href} style={style} className={className} onClick={handleClick}>
      {children}
    </Link>
  )
}
