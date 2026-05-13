'use client'

import { useState } from 'react'
import BookingModal from '@/components/BookingModal'

interface BookingTriggerProps {
  dentist: {
    id: string
    name: string
    clinic_name: string | null
    working_hours: any
  }
  treatments: {
    fee_from: number | null
    fee_to: number | null
    treatments: {
      id: string
      name: string
      slug: string
      icon: string
    }
  }[]
}

export default function BookingTrigger({ dentist, treatments }: BookingTriggerProps) {
  const [open, setOpen] = useState(false)

  function handleClick() {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentist.id, event_type: 'booking_click' }),
      keepalive: true,
    }).catch(() => {})
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
          background: 'var(--blue)', borderRadius: 10,
          fontWeight: 600, fontSize: 14, color: '#fff',
          fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer',
        }}
      >📅 Book Appointment</button>

      <BookingModal
        isOpen={open}
        onClose={() => setOpen(false)}
        dentist={dentist}
        treatments={treatments}
      />
    </>
  )
}
