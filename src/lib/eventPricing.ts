// Featured listing prices for the dentistinindia.in events calendar
// (approved by Ashish, 25 Nov 2026):
//
//   price = coverage rate for the chosen days + ₹3 per dentist alerted
//
//   coverage    7 days   15 days   30 days
//   each city   ₹499     ₹749      ₹999
//   All India   ₹1,499   ₹2,249    ₹2,998
//
// Alerts: every active dentist in the chosen cities (or all of India) gets an
// email and a WhatsApp twice: the day the listing goes live and 2 days
// before the event. Two marketing WhatsApps cost about ₹2 per dentist, so
// ₹3 covers it. Standard listings stay free and send no alerts.
//
// The same function runs in the browser (live price) and on the server (the
// price we actually charge), so they can't drift.

export const FEATURE_DAYS = [7, 15, 30] as const
export type FeatureDays = (typeof FEATURE_DAYS)[number]

export const CITY_RATE: Record<FeatureDays, number> = { 7: 499, 15: 749, 30: 999 }
export const ALL_INDIA_RATE: Record<FeatureDays, number> = { 7: 1499, 15: 2249, 30: 2998 }
export const ALERT_RATE_PER_DENTIST = 3

export function isFeatureDays(v: unknown): v is FeatureDays {
  return typeof v === 'number' && (FEATURE_DAYS as readonly number[]).includes(v)
}

export interface FeatureQuote {
  coverage: number
  alerts: number
  dentists: number
  total: number
}

/** counts = active dentists per city slug. */
export function quoteFeatured(opts: {
  allIndia: boolean
  cities: string[]
  days: FeatureDays
  counts: Record<string, number>
}): FeatureQuote {
  const cities = Array.from(new Set(opts.cities))
  const dentists = opts.allIndia
    ? Object.values(opts.counts).reduce((a, b) => a + b, 0)
    : cities.reduce((a, c) => a + (opts.counts[c] || 0), 0)
  const coverage = opts.allIndia ? ALL_INDIA_RATE[opts.days] : CITY_RATE[opts.days] * cities.length
  const alerts = dentists * ALERT_RATE_PER_DENTIST
  return { coverage, alerts, dentists, total: coverage + alerts }
}

export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
