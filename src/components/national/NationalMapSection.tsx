'use client'

// Map + waitlist modal bound together as one client island. The actual
// d3-geo projection runs server-side; NationalHome passes the projected
// statePaths/liveDots/soonDots down as props so the client never needs
// to import d3 or the 559 KB state GeoJSON.

import { useState } from 'react'
import IndiaMap from './IndiaMap'
import NotifyMeModal from './NotifyMeModal'
import type { StatePath, LiveDot, SoonDot } from './indiaMapData'

interface Props {
  statePaths: StatePath[]
  liveDots: LiveDot[]
  soonDots: SoonDot[]
  dentistCountByCity: { [slug: string]: number }
}

export default function NationalMapSection({ statePaths, liveDots, soonDots, dentistCountByCity }: Props) {
  const [target, setTarget] = useState<{ slug: string; name: string; state: string } | null>(null)

  return (
    <>
      <IndiaMap
        statePaths={statePaths}
        liveDots={liveDots}
        soonDots={soonDots}
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
