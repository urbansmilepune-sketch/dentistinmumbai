// SECTION 9 — Find the clinic. Map (if a usable embed exists), address +
// directions (if an address exists), and the working-hours grid — or the
// multi-branch LocationTabs when the dentist registered more than one clinic.
// Each block hides independently so a half-filled profile still looks clean.

import LocationTabs from './LocationTabs'
import { NAVY, TEAL_DARK } from './profileTheme'
import { MapPinIcon, DirectionsIcon } from './profileIcons'

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

interface Props {
  mapsHtml: string
  address: string | null
  directionsUrl: string | null
  workingHours: any
  locations: any[]
}

export default function LocationSection({ mapsHtml, address, directionsUrl, workingHours, locations }: Props) {
  const hasHours = workingHours && DAY_KEYS.some(d => workingHours?.[d])

  return (
    <>
      {mapsHtml && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
          <div className="profile-map-frame" dangerouslySetInnerHTML={{ __html: mapsHtml }} style={{ width: '100%', height: 320, display: 'block' }} />
        </div>
      )}

      {(address || directionsUrl) && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {address && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1, minWidth: 0, display: 'flex', gap: 8, alignItems: 'flex-start', overflowWrap: 'anywhere' }}>
              <MapPinIcon size={16} color={TEAL_DARK} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{address}</span>
            </p>
          )}
          {directionsUrl && (
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: NAVY, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              <DirectionsIcon size={16} color="#fff" /> Get directions
            </a>
          )}
        </div>
      )}

      {locations.length > 1 ? (
        <LocationTabs locations={locations as any} />
      ) : hasHours ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 }}>Working hours</h3>
          {DAY_KEYS.map(day => {
            const dh = workingHours?.[day]
            return (
              <div key={day} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{DAY_LABELS[day]}</span>
                <span style={{ fontWeight: 600, color: dh?.is_open ? NAVY : '#94A3B8' }}>{dh?.is_open ? `${dh.open_time} – ${dh.close_time}` : 'Closed'}</span>
              </div>
            )
          })}
        </div>
      ) : null}
    </>
  )
}
