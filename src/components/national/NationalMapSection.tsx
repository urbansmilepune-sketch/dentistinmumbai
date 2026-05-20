'use client'

// Map + waitlist modal bound together as one client island. NationalHome
// passes the dentist-count map in; this component owns the open/close
// state for the NotifyMeModal so the map dot click can hand off cleanly.

import { useState } from 'react'
import IndiaMap from './IndiaMap'
import NotifyMeModal from './NotifyMeModal'

interface Props {
  dentistCountByCity: { [slug: string]: number }
}

export default function NationalMapSection({ dentistCountByCity }: Props) {
  const [target, setTarget] = useState<{ slug: string; name: string; state: string } | null>(null)

  return (
    <>
      <IndiaMap
        dentistCountByCity={dentistCountByCity}
        onComingSoonClick={setTarget}
      />
      {target && (
        <NotifyMeModal
          city={target}
          source="homepage_map"
          onClose={() => setTarget(null)}
        />
      )}
    </>
  )
}
