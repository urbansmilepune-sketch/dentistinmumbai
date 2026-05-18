// Shared helpers for the outreach surface — kept out of email.ts so the
// platform-wide email helpers stay focused on transactional flows.

import { Resend } from 'resend'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'
import { getCityEmail } from '@/lib/email'

const resend = new Resend(process.env.RESEND_API_KEY)

// Subject + body lines support {name}, {clinic_name}, {city}, {area}. The
// curly-brace style mirrors what admins type in the UI; nothing fancy.
const VAR_RE = /\{(name|clinic_name|city|area|first_name)\}/g

export function renderOutreachTemplate(input: string, ctx: {
  name?: string | null
  clinic_name?: string | null
  city?: string | null
  area?: string | null
}): string {
  return input.replace(VAR_RE, (_match, key) => {
    if (key === 'first_name') return (ctx.name || '').split(/\s+/)[0] || 'there'
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
    const tracked = `${trackBase}/api/track/click?id=${encodeURIComponent(contactId)}&campaign=${encodeURIComponent(campaignId)}&redirect=${encodeURIComponent(url)}`
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
  const pixel = `<img src="${input.origin}/api/track/open?id=${encodeURIComponent(input.contact_id)}&campaign=${encodeURIComponent(input.campaign_id)}" width="1" height="1" style="display:none" alt="" />`
  const fromSlug = (input.city && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, input.city)
    ? input.city
    : DEFAULT_CITY) as CitySlug
  const cfg = CITY_CONFIGS[fromSlug]
  return resend.emails.send({
    from: getCityEmail(fromSlug),
    to: input.to_email,
    subject: input.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #fff; padding: 20px; color: #1F2937; font-size: 15px; line-height: 1.7;">
          ${html}
          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 11px;">
            You're receiving this because we found ${escapeHtml(cfg.domain)} could help your clinic grow. Reply STOP to unsubscribe.
          </div>
        </div>
        ${pixel}
      </div>
    `,
  })
}

/**
 * Naive but resilient CSV parser. Handles RFC-4180-quoted fields with embedded
 * commas, doubled-quote escapes, and \r\n line endings. We avoid pulling in a
 * 3rd-party parser because the inputs here are admin-controlled, the columns
 * are fixed, and the row counts are in the thousands at most.
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
  // Trailing field / row, if the file didn't end on a newline
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  return rows
}

/**
 * Map a header row to a column index for each expected outreach column.
 * Header matching is case-insensitive and tolerant of common variants
 * (clinic name vs clinic_name vs clinicName).
 */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'dentist', 'dentist_name', 'doctor', 'doctor_name'],
  clinic_name: ['clinic_name', 'clinic', 'clinic name', 'clinicname', 'practice', 'practice_name'],
  email: ['email', 'e-mail', 'email_address', 'email address'],
  phone: ['phone', 'phone_number', 'mobile', 'whatsapp', 'contact'],
  city: ['city', 'town'],
  area: ['area', 'locality', 'neighbourhood', 'neighborhood', 'location'],
  source: ['source', 'list', 'origin'],
}

export interface CsvHeaderIndex {
  name: number
  clinic_name: number
  email: number
  phone: number
  city: number
  area: number
  source: number
}

export function buildHeaderIndex(headerRow: string[]): CsvHeaderIndex {
  const out: CsvHeaderIndex = { name: -1, clinic_name: -1, email: -1, phone: -1, city: -1, area: -1, source: -1 }
  const norm = headerRow.map(h => h.trim().toLowerCase())
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      const idx = norm.indexOf(a)
      if (idx !== -1) { (out as any)[key] = idx; break }
    }
  }
  return out
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function looksLikeEmail(v: string | null | undefined): boolean {
  if (!v) return false
  return EMAIL_RE.test(v.trim())
}
