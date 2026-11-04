// The 5 setup steps a new dentist goes through (wizard at /for-dentists/onboard).
// Each step is worth 20%. Steps 1–4 are needed to "go live" (80%); step 5 takes
// the profile to 100%. The wizard, the dashboard gate, the dashboard setup card
// and the sidebar all use this one list so a dentist sees the same number
// everywhere.
//
// Note: the SEO/sitemap gate still uses profileCompletion.ts. Moving the
// directory listing onto this score is a separate change.

export interface SetupFields {
  profile_photo?: string | null
  mci_number?: string | null
  maps_embed?: string | null
  consultation_fee?: number | string | null
  bio?: string | null
}

export type SetupStepKey = 'photo' | 'registration' | 'location' | 'fee' | 'about'

export interface SetupStep {
  step: 1 | 2 | 3 | 4 | 5
  key: SetupStepKey
  label: string
  minutes: string
  neededToGoLive: boolean
  done: boolean
}

export const BIO_MIN = 50

export function setupSteps(d: SetupFields): SetupStep[] {
  return [
    { step: 1, key: 'photo', label: 'Photo', minutes: '30 sec', neededToGoLive: true, done: !!d.profile_photo },
    { step: 2, key: 'registration', label: 'Registration number', minutes: '1 min', neededToGoLive: true, done: !!(d.mci_number && d.mci_number.trim()) },
    { step: 3, key: 'location', label: 'Clinic on Google Maps', minutes: '30 sec', neededToGoLive: true, done: !!d.maps_embed },
    { step: 4, key: 'fee', label: 'Fee and treatments', minutes: '45 sec', neededToGoLive: true, done: !!d.consultation_fee && Number(d.consultation_fee) > 0 },
    { step: 5, key: 'about', label: 'About you and hours', minutes: '1 min', neededToGoLive: false, done: !!(d.bio && d.bio.trim().length >= BIO_MIN) },
  ]
}

export function setupPct(d: SetupFields): number {
  return setupSteps(d).filter(s => s.done).length * 20
}

// Live = every go-live step done (80%+).
export function isSetupLive(d: SetupFields): boolean {
  return setupSteps(d).every(s => !s.neededToGoLive || s.done)
}

// First go-live step still missing, or null when live.
export function firstMissingLiveStep(d: SetupFields): number | null {
  const s = setupSteps(d).find(x => x.neededToGoLive && !x.done)
  return s ? s.step : null
}

// "Finish later" sets this cookie so the dashboard stops sending the dentist
// back to the wizard for the rest of the day. Next login day, they're asked
// again until they reach 80%.
export const SETUP_LATER_COOKIE = 'dentistin_setup_later'
export const SETUP_LATER_SECONDS = 12 * 60 * 60

// Default hours offered in step 5 (Mon–Sat 10–2 and 5–9, Sunday closed). Same
// shape as /for-dentists/dashboard/hours. Only saved when the dentist confirms.
const DAY = { is_open: true, open_time: '10:00', close_time: '21:00', has_break: true, break_start: '14:00', break_end: '17:00' }
export const DEFAULT_SETUP_HOURS: Record<string, typeof DAY> = {
  mon: DAY, tue: DAY, wed: DAY, thu: DAY, fri: DAY, sat: DAY,
  sun: { ...DAY, is_open: false },
}

// First draft of the "About you" text, written from what the dentist already
// entered. They can edit it before saving.
export function draftBio(d: {
  name?: string | null
  qualifications?: string | null
  experience_years?: number | string | null
  clinic_name?: string | null
  area?: string | null
  city?: string | null
  treatments?: string[]
  mci_number?: string | null
}): string {
  const name = (d.name || '').trim()
  const who = name ? (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`) : 'The doctor'
  const parts: string[] = []
  const quals = (d.qualifications || '').trim()
  const yrs = Number(d.experience_years) || 0
  let first = who
  if (quals) first += ` (${quals})`
  if (yrs > 0) first += ` has ${yrs} ${yrs === 1 ? 'year' : 'years'} of experience and`
  const place = [d.area, d.city].filter(Boolean).join(', ')
  first += ` runs ${d.clinic_name || 'a dental clinic'}${place ? ` in ${place}` : ''}.`
  parts.push(first)
  const t = (d.treatments || []).slice(0, 6)
  if (t.length) parts.push(`Treatments offered include ${t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}` : t[0]}.`)
  if (d.mci_number && d.mci_number.trim()) parts.push(`Registered with the State Dental Council (Reg. no. ${d.mci_number.trim()}).`)
  return parts.join(' ')
}
