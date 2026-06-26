// Single source of truth for rendering a dentist count label across the site
// (homepage intent/area cards, area-page nearby widget, search results…). Before
// this, the same field rendered three different ways — "12 dentists", "0
// dentists", "View dentists". Patient-facing UI must never show "0 dentists":
// a zero count falls back to a neutral call-to-action instead.
export function dentistCountLabel(count: number): string {
  if (count >= 1) return `${count} dentist${count === 1 ? '' : 's'}`
  return 'View dentists'
}
