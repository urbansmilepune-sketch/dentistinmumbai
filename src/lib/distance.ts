// Great-circle distance via the Haversine formula. Inputs in decimal degrees,
// output in kilometres. Earth's radius is the WGS-84 mean (6371 km); good
// enough for "how far is this dentist" — Mumbai's max city span is under 50km.

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

/**
 * Renders a distance for display. Under 1 km shows whole metres ("450 m away"),
 * otherwise one-decimal kilometres ("2.3 km away").
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  if (km < 1) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}
