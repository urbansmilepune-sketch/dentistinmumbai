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

function trackedUrl(trackBase: string, contactId: string, campaignId: string, url: string): string {
  return `${trackBase}/api/track/click?contact_id=${encodeURIComponent(contactId)}&campaign_id=${encodeURIComponent(campaignId)}&url=${encodeURIComponent(url)}`
}

// Per-line transformer that recognises three patterns we use heavily
// in outreach bodies and renders each as its own block:
//   1. "✅ …"        → styled checkmark row with a green tick
//   2. "👉 LABEL: https://…" → CTA-button row (we render the URL as a
//                              prominent button labelled LABEL, with the
//                              standard tracking redirect applied)
//   3. Anything else → paragraph with inline URL linkification
//
// Plain newlines outside these patterns collapse into vertical spacing
// rather than raw <br/> so the email still reads cleanly when the admin
// writes the body in plain text.
function transformBodyToHtml(body: string, trackBase: string, contactId: string, campaignId: string): string {
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  let paraBuf: string[] = []
  const flushPara = () => {
    if (paraBuf.length === 0) return
    const text = paraBuf.join('<br/>')
    out.push(`<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.7;">${text}</p>`)
    paraBuf = []
  }
  const linkify = (s: string) => s.replace(/https?:\/\/[^\s<>"]+/g, (url) => {
    return `<a href="${trackedUrl(trackBase, contactId, campaignId, url)}" style="color:#0057A8;text-decoration:underline;">${url}</a>`
  })

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushPara(); continue }

    // ✅ checklist row
    if (line.startsWith('✅')) {
      flushPara()
      const text = escapeHtml(line.replace(/^✅\s*/, ''))
      out.push(
        `<div style="display:flex;align-items:flex-start;gap:10px;margin:6px 0;font-size:15px;line-height:1.55;color:#0F1923;">` +
          `<span aria-hidden="true" style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#DCFCE7;color:#166534;font-weight:700;font-size:13px;line-height:22px;text-align:center;">✓</span>` +
          `<span>${linkify(text)}</span>` +
        `</div>`,
      )
      continue
    }

    // 👉 CTA button row — "👉 LABEL: https://..." or just "👉 https://..."
    const ctaMatch = line.match(/^👉\s*(?:([^:]+):\s*)?(https?:\/\/\S+)/)
    if (ctaMatch) {
      flushPara()
      const label = (ctaMatch[1] || 'Visit the link').trim()
      const url = ctaMatch[2]
      const tracked = trackedUrl(trackBase, contactId, campaignId, url)
      out.push(
        `<div style="text-align:center;margin:22px 0;">` +
          `<a href="${tracked}" style="display:inline-block;padding:14px 28px;background:#1D4ED8;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">` +
            `${escapeHtml(label)} →` +
          `</a>` +
        `</div>`,
      )
      continue
    }

    paraBuf.push(linkify(escapeHtml(line)))
  }
  flushPara()
  return out.join('')
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
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 16px; background: #F8FAFC;">
        <!-- Header: navy gradient with white wordmark + tagline. Inline
             styles only (no <style> blocks) so Gmail / Outlook render
             the gradient correctly. -->
        <div style="background: linear-gradient(135deg, #003F7A 0%, #0057A8 100%); padding: 28px 32px; border-radius: 14px 14px 0 0; text-align: center;">
          <div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-weight: 800; font-size: 24px; color: #ffffff; letter-spacing: -0.01em; line-height: 1.1;">
            Dentist<span style="color: #93C5FD;">InIndia</span>.in
          </div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.85); margin-top: 6px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">
            India's Dental Professional Network
          </div>
        </div>

        <!-- Body card. Solid white with soft border so the gradient
             header floats above it cleanly. -->
        <div style="background: #ffffff; padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 14px 14px;">
          ${html}
        </div>

        <!-- Footer chrome — light grey, small type, tracking pixel
             tucked in as the last element so opens fire after render. -->
        <div style="margin-top: 18px; padding: 0 8px; color: #94a3b8; font-size: 11px; line-height: 1.6; text-align: center;">
          You're receiving this because we thought ${escapeHtml(cfg.domain)} could help your clinic grow.<br/>
          <a href="${unsubUrl}" style="color: #94a3b8; text-decoration: underline;">Unsubscribe</a>
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
