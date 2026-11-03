// Shared vocabulary for the fast visit workflow:
//   tablet check-in (dashboard/tablet) → dentist visit screen (dashboard/visit)
//   → pending plans (dashboard/pending-plans).
//
// Everything here is plain data + small pure helpers so both screens agree on
// ids and labels. Diagnosis suggestions are a simple rule list on purpose (no
// live AI): instant, free, and the dentist always makes the final pick.

export type Lang = 'en' | 'hi' | 'mr'

export type IntakeComplaint = {
  concerns: string[]
  area: string | null
  since: string | null
  triggers: string[]
  lang?: Lang
}

type Opt = { id: string; en: string; hi: string; mr: string }

export const CONCERNS: Opt[] = [
  { id: 'pain', en: 'Tooth pain', hi: 'दांत में दर्द', mr: 'दात दुखणे' },
  { id: 'checkup', en: 'Check-up / cleaning', hi: 'जांच / सफाई', mr: 'तपासणी / स्वच्छता' },
  { id: 'broken', en: 'Broken / chipped tooth', hi: 'टूटा हुआ दांत', mr: 'तुटलेला दात' },
  { id: 'gums', en: 'Bleeding gums', hi: 'मसूड़ों से खून', mr: 'हिरड्यांतून रक्त' },
  { id: 'smile', en: 'Smile / braces', hi: 'मुस्कान / ब्रेसेस', mr: 'हास्य / ब्रेसेस' },
  { id: 'missing', en: 'Missing tooth', hi: 'दांत नहीं है', mr: 'दात नाही' },
  { id: 'other', en: 'Something else', hi: 'कुछ और', mr: 'इतर काही' },
]

export const AREAS: Opt[] = [
  { id: 'upper_right', en: 'Upper right', hi: 'ऊपर दाएं', mr: 'वर उजवीकडे' },
  { id: 'upper_left', en: 'Upper left', hi: 'ऊपर बाएं', mr: 'वर डावीकडे' },
  { id: 'lower_right', en: 'Lower right', hi: 'नीचे दाएं', mr: 'खाली उजवीकडे' },
  { id: 'lower_left', en: 'Lower left', hi: 'नीचे बाएं', mr: 'खाली डावीकडे' },
  { id: 'front', en: 'Front teeth', hi: 'आगे के दांत', mr: 'पुढचे दात' },
  { id: 'unsure', en: 'Not sure', hi: 'पता नहीं', mr: 'माहीत नाही' },
]

export const SINCE: Opt[] = [
  { id: 'today', en: 'Today', hi: 'आज से', mr: 'आजपासून' },
  { id: 'days', en: '2 to 7 days', hi: '2 से 7 दिन', mr: '2 ते 7 दिवस' },
  { id: 'weeks', en: 'Weeks', hi: 'कुछ हफ्ते', mr: 'काही आठवडे' },
  { id: 'months', en: 'Months', hi: 'कुछ महीने', mr: 'काही महिने' },
]

export const TRIGGERS: Opt[] = [
  { id: 'cold', en: 'Cold', hi: 'ठंडा', mr: 'थंड' },
  { id: 'hot', en: 'Hot', hi: 'गरम', mr: 'गरम' },
  { id: 'sweet', en: 'Sweet', hi: 'मीठा', mr: 'गोड' },
  { id: 'chewing', en: 'Chewing', hi: 'चबाना', mr: 'चावणे' },
  { id: 'night', en: 'At night', hi: 'रात में', mr: 'रात्री' },
  { id: 'swelling', en: 'Swelling', hi: 'सूजन', mr: 'सूज' },
]

export const ALLERGIES: Opt[] = [
  { id: 'Penicillin / Amoxicillin', en: 'Penicillin / Amoxicillin', hi: 'पेनिसिलिन / अमोक्सिसिलिन', mr: 'पेनिसिलिन / अमोक्सिसिलिन' },
  { id: 'Sulfa', en: 'Sulfa', hi: 'सल्फा', mr: 'सल्फा' },
  { id: 'Painkillers (NSAIDs)', en: 'Painkillers', hi: 'दर्द की दवा', mr: 'वेदनाशामक' },
  { id: 'Local anaesthetic', en: 'Local anaesthetic', hi: 'सुन्न करने की दवा', mr: 'बधिर करणारे औषध' },
  { id: 'Latex', en: 'Latex', hi: 'लेटेक्स', mr: 'लेटेक्स' },
]

export const CONDITIONS: Opt[] = [
  { id: 'Diabetes', en: 'Diabetes', hi: 'डायबिटीज़', mr: 'मधुमेह' },
  { id: 'BP', en: 'BP', hi: 'बीपी', mr: 'बीपी' },
  { id: 'Heart problem', en: 'Heart problem', hi: 'दिल की बीमारी', mr: 'हृदयविकार' },
  { id: 'Blood thinner', en: 'Blood thinner', hi: 'खून पतला करने की दवा', mr: 'रक्त पातळ करण्याचे औषध' },
  { id: 'Thyroid', en: 'Thyroid', hi: 'थायरॉइड', mr: 'थायरॉईड' },
  { id: 'Asthma', en: 'Asthma', hi: 'दमा', mr: 'दमा' },
  { id: 'Pregnant', en: 'Pregnant', hi: 'गर्भवती', mr: 'गरोदर' },
]

export function optLabel(list: Opt[], id: string | null | undefined, lang: Lang = 'en'): string {
  if (!id) return ''
  const o = list.find(x => x.id === id)
  return o ? o[lang] : id
}

/** One-line English summary of a tablet complaint, for the dentist and the visit note. */
export function complaintSummary(c: IntakeComplaint | null | undefined): string {
  if (!c) return ''
  const parts: string[] = []
  const concerns = (c.concerns || []).map(id => optLabel(CONCERNS, id)).filter(Boolean)
  if (concerns.length) parts.push(concerns.join(', '))
  if (c.area && c.area !== 'unsure') parts.push(optLabel(AREAS, c.area).toLowerCase())
  if (c.since) parts.push(optLabel(SINCE, c.since).toLowerCase())
  let s = parts.join(', ')
  const trig = (c.triggers || []).map(id => optLabel(TRIGGERS, id).toLowerCase()).filter(Boolean)
  if (trig.length) s += `${s ? '. ' : ''}Worse with ${trig.join(', ')}`
  return s
}

// ---- Teeth -----------------------------------------------------------------

// FDI numbering, drawn as the dentist faces the patient: patient's right on
// the viewer's left.
export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

/** Teeth to highlight for the area the patient tapped on the tablet. */
export function teethForArea(area: string | null | undefined): number[] {
  switch (area) {
    case 'upper_right': return [11, 12, 13, 14, 15, 16, 17, 18]
    case 'upper_left': return [21, 22, 23, 24, 25, 26, 27, 28]
    case 'lower_left': return [31, 32, 33, 34, 35, 36, 37, 38]
    case 'lower_right': return [41, 42, 43, 44, 45, 46, 47, 48]
    case 'front': return [13, 12, 11, 21, 22, 23, 33, 32, 31, 41, 42, 43]
    default: return []
  }
}

/** Plain-words name for the patient view. 36 → "Lower left back tooth". */
export function toothPlainName(n: number): string {
  const q = Math.floor(n / 10)
  const pos = n % 10
  const side = q === 1 || q === 4 ? 'right' : 'left'
  const jaw = q <= 2 ? 'Upper' : 'Lower'
  const kind = pos <= 3 ? 'front tooth' : pos <= 5 ? 'side tooth' : 'back tooth'
  return `${jaw} ${side} ${kind}`
}

// ---- Diagnoses -------------------------------------------------------------

export const DIAGNOSES = [
  'Deep caries', 'Reversible pulpitis', 'Irreversible pulpitis', 'Periapical abscess',
  'Cracked tooth', 'Fractured tooth', 'Gingivitis', 'Periodontitis', 'Calculus',
  'Sensitivity', 'Impacted tooth', 'Missing tooth', 'Mobility', 'Malocclusion', 'Discoloration',
]

/** dental_chart_entries.condition for diagnoses that map cleanly onto the chart. */
export const DIAGNOSIS_TO_CONDITION: Record<string, string> = {
  'Deep caries': 'caries',
  'Reversible pulpitis': 'caries',
  'Irreversible pulpitis': 'caries',
  'Periapical abscess': 'abscess',
  'Cracked tooth': 'fracture',
  'Fractured tooth': 'fracture',
  'Sensitivity': 'sensitivity',
  'Impacted tooth': 'impacted',
  'Missing tooth': 'missing',
  'Mobility': 'mobility',
}

/** Up to 3 likely diagnoses from what the patient told the tablet. */
export function suggestDiagnoses(c: IntakeComplaint | null | undefined): string[] {
  if (!c) return []
  const has = (id: string) => (c.concerns || []).includes(id)
  const t = (id: string) => (c.triggers || []).includes(id)
  const out: string[] = []
  const add = (d: string) => { if (!out.includes(d)) out.push(d) }
  if (has('pain')) {
    if (t('swelling')) add('Periapical abscess')
    if (t('hot') || t('night') || c.since === 'weeks' || c.since === 'months') add('Irreversible pulpitis')
    if (t('cold') || t('sweet')) { add('Deep caries'); add('Reversible pulpitis') }
    if (t('chewing')) add('Cracked tooth')
    if (out.length === 0) { add('Deep caries'); add('Irreversible pulpitis') }
  }
  if (has('broken')) add('Fractured tooth')
  if (has('gums')) { add('Gingivitis'); add('Periodontitis') }
  if (has('checkup')) { add('Calculus'); add('Deep caries') }
  if (has('missing')) add('Missing tooth')
  if (has('smile')) { add('Malocclusion'); add('Discoloration') }
  return out.slice(0, 3)
}

// ---- Treatments ------------------------------------------------------------

export type TreatmentDef = {
  name: string
  sittings: number        // clinic visits it usually takes
  perTooth: boolean       // price multiplies by the number of teeth
  match: string[]         // lowercase words to find the clinic's own fee in dentist_treatments
  crown?: boolean
}

export const TREATMENTS: TreatmentDef[] = [
  { name: 'X-ray (IOPA)', sittings: 0, perTooth: true, match: ['x-ray', 'xray', 'iopa', 'radiograph'] },
  { name: 'Filling', sittings: 1, perTooth: true, match: ['filling', 'restoration', 'composite'] },
  { name: 'RCT', sittings: 3, perTooth: true, match: ['root canal', 'rct'] },
  { name: 'Crown', sittings: 2, perTooth: true, match: ['crown', 'cap'], crown: true },
  { name: 'Extraction', sittings: 1, perTooth: true, match: ['extraction'] },
  { name: 'Wisdom tooth removal', sittings: 1, perTooth: true, match: ['wisdom', 'impaction'] },
  { name: 'Scaling', sittings: 1, perTooth: false, match: ['scaling', 'cleaning'] },
  { name: 'Deep cleaning', sittings: 2, perTooth: false, match: ['deep cleaning', 'curettage', 'root planing'] },
  { name: 'Implant', sittings: 3, perTooth: true, match: ['implant'] },
  { name: 'Bridge', sittings: 2, perTooth: false, match: ['bridge'] },
  { name: 'Braces', sittings: 12, perTooth: false, match: ['braces', 'orthodontic', 'aligner'] },
  { name: 'Whitening', sittings: 1, perTooth: false, match: ['whitening', 'bleaching'] },
]

export const CROWN_TYPES = [
  { id: 'Metal-ceramic', patientNote: 'Strong, may show a thin grey line near the gum' },
  { id: 'Zirconia', patientNote: 'Very strong, looks natural, no metal' },
  { id: 'E-max', patientNote: 'Most natural look, best for front teeth' },
]

export const TREATMENT_PLAIN: Record<string, string> = {
  'X-ray (IOPA)': 'X-ray of the tooth',
  'Filling': 'Filling (closes the cavity)',
  'RCT': 'Root canal (removes the pain, saves the tooth)',
  'Crown': 'Cap (crown) to protect the tooth',
  'Extraction': 'Tooth removal',
  'Wisdom tooth removal': 'Wisdom tooth removal',
  'Scaling': 'Cleaning (scaling)',
  'Deep cleaning': 'Deep cleaning of gums',
  'Implant': 'Implant (new fixed tooth)',
  'Bridge': 'Bridge (fixed replacement tooth)',
  'Braces': 'Braces',
  'Whitening': 'Whitening',
}

export const DIAGNOSIS_PLAIN: Record<string, string> = {
  'Deep caries': 'deep decay (cavity)',
  'Reversible pulpitis': 'the nerve is irritated by decay',
  'Irreversible pulpitis': 'decay has reached the nerve of the tooth',
  'Periapical abscess': 'an infection at the root of the tooth',
  'Cracked tooth': 'a crack in the tooth',
  'Fractured tooth': 'a broken tooth',
  'Gingivitis': 'swollen, bleeding gums',
  'Periodontitis': 'gum disease that loosens teeth',
  'Calculus': 'hard deposits (tartar) on the teeth',
  'Sensitivity': 'sensitive teeth',
  'Impacted tooth': 'a tooth stuck under the gum',
  'Missing tooth': 'a missing tooth',
  'Mobility': 'a loose tooth',
  'Malocclusion': 'teeth not in line',
  'Discoloration': 'stained teeth',
}

/** Treatments to highlight for the picked diagnoses. */
export function suggestTreatments(diagnoses: string[]): string[] {
  const out: string[] = []
  const add = (n: string) => { if (!out.includes(n)) out.push(n) }
  for (const d of diagnoses) {
    if (d === 'Deep caries' || d === 'Reversible pulpitis') add('Filling')
    if (d === 'Irreversible pulpitis' || d === 'Periapical abscess') { add('X-ray (IOPA)'); add('RCT'); add('Crown') }
    if (d === 'Cracked tooth') add('Crown')
    if (d === 'Fractured tooth') { add('Filling'); add('Crown') }
    if (d === 'Gingivitis' || d === 'Calculus') add('Scaling')
    if (d === 'Periodontitis') add('Deep cleaning')
    if (d === 'Impacted tooth') { add('X-ray (IOPA)'); add('Wisdom tooth removal') }
    if (d === 'Missing tooth') { add('Implant'); add('Bridge') }
    if (d === 'Mobility') add('Extraction')
    if (d === 'Malocclusion') add('Braces')
    if (d === 'Discoloration') add('Whitening')
  }
  return out
}

/** Step name stored in treatment_plan_steps, e.g. "Crown (Zirconia)". */
export function stepName(treatment: string, crownType: string | null): string {
  return treatment === 'Crown' && crownType ? `Crown (${crownType})` : treatment
}

// ---- Prescriptions ---------------------------------------------------------

export type Medicine = { name: string; dosage: string; frequency: string; duration: string; instructions?: string }

const AMOX: Medicine = { name: 'Amoxicillin', dosage: '500 mg', frequency: '1-0-1', duration: '5 days', instructions: 'After food' }
const AZITHRO: Medicine = { name: 'Azithromycin', dosage: '500 mg', frequency: '1-0-0', duration: '3 days', instructions: 'After food' }
const IBU_PARA: Medicine = { name: 'Ibuprofen + Paracetamol', dosage: '400/325 mg', frequency: '1-0-1', duration: '3 days', instructions: 'After food' }
const PARA: Medicine = { name: 'Paracetamol', dosage: '650 mg', frequency: '1-0-1', duration: '3 days', instructions: 'After food' }
const PANTO: Medicine = { name: 'Pantoprazole', dosage: '40 mg', frequency: '1-0-0', duration: '3 days', instructions: 'Before breakfast' }
const METRO: Medicine = { name: 'Metronidazole', dosage: '400 mg', frequency: '1-1-1', duration: '5 days', instructions: 'After food' }
const CHX: Medicine = { name: 'Chlorhexidine mouthwash 0.2%', dosage: '10 ml', frequency: '1-0-1', duration: '14 days', instructions: 'Rinse 30 sec, do not swallow' }

export type RxTemplate = { name: string; medicines: Medicine[]; advice?: string; mine?: boolean }

export const RX_TEMPLATES: RxTemplate[] = [
  { name: 'RCT pain kit', medicines: [AMOX, IBU_PARA, PANTO], advice: 'Avoid chewing on the treated side until the next sitting.' },
  { name: 'After extraction', medicines: [AMOX, PARA, { ...CHX, duration: '7 days', instructions: 'Start from tomorrow. Do not swallow' }], advice: 'Bite on the gauze for 45 minutes. Cold food only today. No spitting or straw for 24 hours.' },
  { name: 'Gum infection', medicines: [METRO, CHX], advice: 'Brush twice daily with a soft brush.' },
  { name: 'Pain relief only', medicines: [IBU_PARA, PANTO], advice: 'Medicine only reduces the pain for a few days. The tooth still needs treatment.' },
  { name: 'No medicine', medicines: [] },
]

/**
 * Swap medicines the patient is allergic to. Returns the safe list plus a
 * human note for each swap so the dentist sees what changed.
 */
export function applyAllergySwaps(meds: Medicine[], allergiesText: string | null | undefined): { medicines: Medicine[]; notes: string[] } {
  const a = String(allergiesText || '').toLowerCase()
  const penicillin = /penicillin|amox|augmentin/.test(a)
  const nsaid = /nsaid|ibuprofen|painkiller|aspirin|diclofenac/.test(a)
  const notes: string[] = []
  const out: Medicine[] = []
  for (const m of meds) {
    if (penicillin && /amoxicillin|augmentin/i.test(m.name)) {
      out.push(AZITHRO); notes.push(`Swapped ${m.name} for Azithromycin (penicillin allergy).`); continue
    }
    if (nsaid && /ibuprofen|diclofenac|aceclofenac/i.test(m.name)) {
      out.push(PARA); notes.push(`Swapped ${m.name} for Paracetamol (painkiller allergy).`); continue
    }
    out.push(m)
  }
  return { medicines: out, notes }
}

// ---- Dates -----------------------------------------------------------------

export function istTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function prettyDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function rupees(n: number): string {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`
}

/** Same slot labels the Appointments page uses, so bookings line up. */
export const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM', '08:00 PM',
]

export function generateApptRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let ref = 'DIM'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}
