// Strips anything that could reference a specific patient out of a URL before
// it's stored in / displayed on a bug report. Bug reports must never carry
// patient data, and a path like /dashboard/patients/<uuid> embeds exactly that
// kind of reference. Run on both the client (at capture time) and the server
// (before insert) so a hand-crafted request can't smuggle an id through.
//
//   /for-dentists/dashboard/patients/8720c8ba-...-0ff3  ->  .../patients/:id
//   /...?phone=9320231988                               ->  ...?phone=:num

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// 5+ consecutive digits catches patient phone numbers, UHIDs, and any bare
// numeric record id while leaving short, harmless query flags (?new=1) intact.
const LONG_DIGITS_RE = /\d{5,}/g

export function redactUrl(input: unknown): string {
  return String(input ?? '')
    .replace(UUID_RE, ':id')
    .replace(LONG_DIGITS_RE, ':num')
    .slice(0, 500)
}
