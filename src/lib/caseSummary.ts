// Plain one-paragraph text for meta tags and public pages: collapse
// whitespace, drop anything that looks like a phone number or email (case
// text is dentist-written and patient details must never go public), and
// cut on a word break. Used by the
// public case summary (/cases/[id]) and the public case library (/cases).
export function summaryText(raw: string | null | undefined, max: number): string {
  if (!raw) return ''
  let t = raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/(?:\+?\d[\d\s-]{8,}\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > max) {
    t = t.slice(0, max)
    const cut = t.lastIndexOf(' ')
    t = (cut > max * 0.6 ? t.slice(0, cut) : t).replace(/[,;:.\s]+$/, '') + '…'
  }
  return t
}
