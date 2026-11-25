// Display names for dentists on the national site. Stored names are typed
// by dentists and vary: "Dr. Priyanka ...", "DR. SANDESH MANOHAR PAWAR",
// "bhushan pawar". drName() strips any existing Dr prefix (any case, with
// or without a dot) and adds exactly one "Dr. ". Names typed all in capitals
// or all in lower case are shown in title case; mixed-case names are left
// as typed (so "McDonald" or "DSouza" survive).

const PREFIX = /^\s*(dr|doctor)(\.\s*|\s+)/i

export function cleanName(raw: string | null | undefined): string {
  let n = (raw || '').trim().replace(/\s+/g, ' ')
  while (PREFIX.test(n)) n = n.replace(PREFIX, '')
  const letters = n.replace(/[^A-Za-z]/g, '')
  if (letters && (letters === letters.toUpperCase() || letters === letters.toLowerCase())) {
    n = n.toLowerCase().replace(/(^|[\s\-'.(])([a-z])/g, (_m, p, c) => p + c.toUpperCase())
  }
  return n
}

/** "Dr. Firstname Lastname", never "Dr. Dr. ...". */
export function drName(raw: string | null | undefined, fallback = 'Unknown'): string {
  return `Dr. ${cleanName(raw) || fallback}`
}
