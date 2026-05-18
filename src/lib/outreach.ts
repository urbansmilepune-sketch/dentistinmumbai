// Shared helpers for the outreach surface — kept out of email.ts so the
// platform-wide email helpers stay focused on transactional flows.

import { Resend } from 'resend'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { getCityEmail } from '@/lib/email'

const resend = new Resend(process.env.RESEND_API_KEY)

// Subject + body lines support {name}, {clinic_name}, {city}, {area},
// {city_lower}, {email}, {first_name}.
const VAR_RE = /\{(name|clinic_name|city|area|first_name|city_lower|email)\}/g

export function renderOutreachTemplate(input: string, ctx: {
  name?: string | null
  clinic_name?: string | null
  city?: string | null
  area?: string | null
  email?: string | null
}): string {
  return input.replace(VAR_RE, (_match, key) => {
    if (key === 'first_name') return (ctx.name || '').split(/\s+/)[0] || 'there'
    if (key === 'city_lower') return cityLowerSlug(ctx.city || '')
    if (key === 'city')       return cityDisplayName(ctx.city)
    const v = (ctx as any)[key]
    return v == null || v === '' ? '' : String(v)
  })
}

/**
 * Resolve a city slug to its display name. Falls back to the raw value
 * (capitalised) when the slug isn't in our list — useful for the rare CSV
 * row that lands with a free-form city string.
 */
export function cityDisplayName(slug?: string | null): string {
  if (!slug) return ''
  if (Object.prototype.hasOwnProperty.call(CITY_CONFIGS, slug)) {
    return CITY_CONFIGS[slug as CitySlug].cityName
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

/**
 * The slug fragment used inside the brand URL — e.g. "mumbai" → "mumbai",
 * "Navi Mumbai" → "navimumbai", so {city_lower} drops cleanly into
 * "dentistin{city_lower}.in".
 */
export function cityLowerSlug(input: string): string {
  const v = (input || '').toLowerCase().trim().replace(/\s+/g, '')
  return v
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Wraps every plain http(s) URL in the body in a tracking redirect, then
// converts newlines to <br/>. The {{TRACK_PIXEL}} marker is replaced with the
// 1×1 open-pixel <img> just before send.
function transformBodyToHtml(body: string, trackBase: string, contactId: string, campaignId: string): string {
  const safe = escapeHtml(body)
  const linked = safe.replace(/https?:\/\/[^\s<>"]+/g, (url) => {
    const tracked = `${trackBase}/api/track/click?contact_id=${encodeURIComponent(contactId)}&campaign_id=${encodeURIComponent(campaignId)}&url=${encodeURIComponent(url)}`
    return `<a href="${tracked}" style="color:#0057A8;text-decoration:underline;">${url}</a>`
  })
  return linked.replace(/\n/g, '<br/>')
}

export interface OutreachSendInput {
  to_email: string
  contact_id: string
  campaign_id: string
  subject: string
  body: string
  city?: string | null
  origin: string
}

export async function sendOutreachEmail(input: OutreachSendInput) {
  const html = transformBodyToHtml(input.body, input.origin, input.contact_id, input.campaign_id)
  const pixel = `<img src="${input.origin}/api/track/open?contact_id=${encodeURIComponent(input.contact_id)}&campaign_id=${encodeURIComponent(input.campaign_id)}" width="1" height="1" style="display:none" alt="" />`
  const fromSlug = (input.city && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, input.city)
    ? input.city
    : DEFAULT_CITY) as CitySlug
  const cfg = CITY_CONFIGS[fromSlug]
  // Unsubscribe URL — the public /unsubscribe page reads ?email= and flips
  // the row's status. Mumbai is hardcoded because the page is hosted there
  // (single deployment serves every city domain).
  const unsubUrl = `${input.origin}/unsubscribe?email=${encodeURIComponent(input.to_email)}`
  return resend.emails.send({
    from: getCityEmail(fromSlug),
    to: input.to_email,
    subject: input.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #fff; padding: 20px; color: #1F2937; font-size: 15px; line-height: 1.7;">
          ${html}
          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 11px;">
            You're receiving this because we found ${escapeHtml(cfg.domain)} could help your clinic grow.
            To unsubscribe: <a href="${unsubUrl}" style="color:#94a3b8;text-decoration:underline;">${unsubUrl}</a>
          </div>
        </div>
        ${pixel}
      </div>
    `,
  })
}

/**
 * RFC-4180-tolerant CSV parser. Handles quoted fields, embedded commas,
 * doubled-quote escapes, and \r\n line endings. We avoid a 3rd-party parser
 * because the inputs are admin-controlled, the columns are fixed, and the
 * row counts are in the thousands at most.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        cur.push(field); field = ''
      } else if (ch === '\n') {
        cur.push(field); field = ''
        rows.push(cur); cur = []
      } else if (ch === '\r') {
        // swallow — handled by the \n branch
      } else {
        field += ch
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  return rows
}

const HEADER_ALIASES: Record<string, string[]> = {
  sr_no:       ['sr no', 'sr_no', 'srno', 'sr.', 'sr', 's.no', 'sno', 's.no.', '#'],
  name:        ['dentist name', 'name', 'dentist', 'dentist_name', 'doctor', 'doctor name'],
  clinic_name: ['clinic name', 'clinic_name', 'clinic', 'clinicname', 'practice', 'practice name'],
  email:       ['email', 'e-mail', 'email_address', 'email address'],
  city:        ['city', 'town'],
}

export interface CsvHeaderIndex {
  sr_no: number
  name: number
  clinic_name: number
  email: number
  city: number
}

export function buildHeaderIndex(headerRow: string[]): CsvHeaderIndex {
  const out: CsvHeaderIndex = { sr_no: -1, name: -1, clinic_name: -1, email: -1, city: -1 }
  const norm = headerRow.map(h => h.trim().toLowerCase())
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      const idx = norm.indexOf(a)
      if (idx !== -1) { (out as any)[key] = idx; break }
    }
  }
  return out
}

// Email validation with extra tripwires for the common typos the spec called
// out (".vom", ".comcom"). Anything that passes the RFC-ish regex AND survives
// the TLD-typo blacklist is considered valid.
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/
const TLD_TYPOS = ['.vom', '.cim', '.comcom', '.cmo', '.conm', '.con', '.coom', '.comm']

export function looksLikeEmail(v: string | null | undefined): boolean {
  if (!v) return false
  const t = v.trim().toLowerCase()
  if (!EMAIL_RE.test(t)) return false
  for (const bad of TLD_TYPOS) {
    if (t.endsWith(bad)) return false
  }
  // Reject obviously broken domains like "foo@bar." or "foo@.com".
  const atIdx = t.indexOf('@')
  const domain = t.slice(atIdx + 1)
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false
  return true
}

/**
 * Normalize a free-text city string into one of our slugs when possible.
 * Falls back to the lowered/spaceless input so the admin can still filter
 * on unfamiliar values.
 */
export function normalizeCsvCity(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v)) return v
  // Catch "Navi Mumbai" → "navimumbai" via the strip above.
  return v || null
}
