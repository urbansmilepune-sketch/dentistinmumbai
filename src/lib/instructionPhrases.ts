// Localised medication-instruction phrases shared by the prescription form
// (the Add Rx modal in patients/[id]) and the EMR medications table. The
// dentist picks a language and taps a phrase chip to insert the localised text;
// it then prints verbatim on the prescription PDF (rendered as HTML, so the
// Devanagari script displays natively without font embedding).
//
// Kept in one place so the English / Hindi / Marathi tables can't drift apart
// between the two forms.

export type RxLang = 'en' | 'hi' | 'mr'

export const RX_LANG_LABELS: Record<RxLang, string> = { en: 'English', hi: 'हिंदी', mr: 'मराठी' }

export const INSTRUCTION_PHRASES: Record<RxLang, string>[] = [
  { en: 'After food',                  hi: 'खाने के बाद',         mr: 'जेवणानंतर' },
  { en: 'Before food',                 hi: 'खाने से पहले',        mr: 'जेवणाआधी' },
  { en: 'Morning + Night',             hi: 'सुबह + रात',          mr: 'सकाळी + रात्री' },
  { en: 'Morning + Afternoon + Night', hi: 'सुबह + दोपहर + रात',   mr: 'सकाळी + दुपारी + रात्री' },
  { en: 'As needed',                   hi: 'जरूरत के अनुसार',     mr: 'गरजेनुसार' },
  { en: 'Empty stomach',               hi: 'खाली पेट',            mr: 'रिकाम्या पोटी' },
]

// localStorage key for the per-dentist instruction-language preference, shared
// by both forms so the dentist only ever picks their language once.
export const rxLangStorageKey = (dentistId: string) => `rx_instr_lang:${dentistId}`

// Type guard for safely narrowing a raw localStorage string back to RxLang.
export function isRxLang(v: unknown): v is RxLang {
  return v === 'en' || v === 'hi' || v === 'mr'
}
