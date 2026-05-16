// Phone-number normalisation helpers shared by every wa.me deep-link in the
// codebase. The dentists table stores whatsapp/phone as raw user input —
// some rows are '9876543210', some are '+919876543210', some are
// '91 9876 543 210' with spaces. Hardcoding `91${raw.replace(/\D/g, '')}`
// at each call site produced '919876543210' for plain input but
// '9191xxxxxxxxxx' (or worse) when the raw already had a country code.
//
// `formatIndianWhatsAppDigits` returns just the digits with a single leading
// 91, or null when the input clearly isn't a usable Indian mobile number.

/**
 * Strip all non-digits, drop a leading 91 (or 0 prefix), then re-prepend a
 * single 91. Returns null when the resulting "subscriber number" isn't
 * exactly 10 digits, since wa.me silently treats malformed numbers as a
 * search query rather than a chat target.
 */
export function formatIndianWhatsAppDigits(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  // Some rows arrive as '0XXXXXXXXXX' (trunk prefix); drop the leading 0.
  if (digits.startsWith('0')) digits = digits.slice(1)
  // Drop a leading country code so we can re-add it canonically. We strip
  // 91 only if removing it leaves exactly 10 digits — otherwise a real
  // 11-digit subscriber number that happens to start with 91 would lose
  // a digit.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length !== 10) return null
  return `91${digits}`
}

/**
 * Build a full wa.me URL from a raw whatsapp number (and optional prefilled
 * message). Returns null when the number is unusable — callers should
 * conditionally render the button.
 */
export function whatsappLink(raw: string | null | undefined, text?: string): string | null {
  const digits = formatIndianWhatsAppDigits(raw)
  if (!digits) return null
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`
}
