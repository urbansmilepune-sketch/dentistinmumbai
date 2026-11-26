// Monthly auto-search for upcoming dental events and courses in India.
//
// Runs on the 1st of each month (cron /api/cron/event-search) and from the
// admin Events tab ("Search now"). Five searches run side by side (four for
// India, one for the big international congresses, which looks 9 months
// ahead), each a Claude call with the web search tool limited to 10
// searches, so one run is about 50 searches. Claude reads the organisers' pages and returns only the
// facts (name, dates, city, organiser, fee, link). We never copy page text
// or posters: the description is one short sentence in our own words and
// every listing links back to the source.
//
// Everything found is saved as status 'pending', source 'search'. Nothing
// goes live until an admin approves it. Past events, events more than about
// 4 months out and duplicates (same name + start date, or already listed)
// are dropped.
//
// Cost (Nov 2026 prices, Sonnet 4.6): about $10 per 1,000 searches plus
// tokens, so roughly $3-4 a run. Each run is logged in event_search_runs.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CITY_CONFIGS } from '@/config/cities'
import { CLAUDE_MODEL } from '@/lib/anthropic'
import { normalizeCountry, INDIA } from '@/lib/eventCountries'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const KINDS = ['exhibition', 'course', 'seminar', 'study_club', 'conference']
const HORIZON_DAYS = 130
// Big international meetings are announced a year ahead, so look further.
const INTL_HORIZON_DAYS = 270

interface Theme { text: string; intl?: boolean }

const THEMES: Theme[] = [
  { text: 'Large national and state dental conferences and trade exhibitions in India (for example Famdent shows, Indian Dental Association national and state conferences, national conferences of the Indian speciality societies for prosthodontics, orthodontics, periodontics, endodontics, oral surgery, paedodontics, oral medicine and public health dentistry).' },
  { text: 'Continuing dental education (CDE) programs, seminars and study club meetings run by Indian Dental Association (IDA) branches and state branches across India.' },
  { text: 'CDE programs, workshops and hands-on courses run by dental colleges, universities and health sciences universities in India, including Dental Council of India and state dental council CDE listings.' },
  { text: 'Hands-on clinical courses and online courses or webinars for dentists in India run by Indian training institutes, academies and dental companies (implants, endodontics, aligners, lasers, smile design, practice management).' },
  { text: 'The major international dental congresses and trade shows outside India that Indian dentists travel to (for example AEEDC Dubai, IDS Cologne, FDI World Dental Congress, EuroPerio, ITI World Symposium, the American Association of Orthodontists annual session, Greater New York Dental Meeting, CED-IADR and the big Asia-Pacific dental congresses in Singapore, Thailand and Malaysia).', intl: true },
]

function system(today: string, until: string, intl = false): string {
  return `You find upcoming dental events for a calendar used by dentists in India.

Search the web and read the organisers' own pages. List only events that:
- are for dentists or dental students (not patient camps),
${intl ? '- take place outside India (in person), and are large enough that Indian dentists travel to them,' : '- take place in India, or online run by an Indian organiser,'}
- start between ${today} and ${until},
- you saw on a real page during this search, with a date stated on that page.

Never guess a date, city, fee or link. If the page does not state something, leave it null. Skip anything you are unsure about. Do not copy wording from the page: write the description yourself, one neutral sentence of at most 25 words.

Answer with ONLY a JSON array, no other text. Each item:
{"title": string, "kind": one of ${JSON.stringify(KINDS)}, "starts_on": "YYYY-MM-DD", "ends_on": "YYYY-MM-DD" or null, "city": city name or null, "country": country name (${intl ? 'the country it takes place in' : '"India"'}), "is_online": boolean, "organiser": string or null, "fee_text": short fee as stated (e.g. "₹2,500", "Free") or null, "link": the https URL of the page where you found it, "description": string or null, "gives_certificate": boolean}

Return [] if you found nothing that qualifies. At most 25 items.`
}

interface Found {
  title: string; kind: string; starts_on: string; ends_on: string | null; city: string | null; country?: string | null; is_online: boolean
  organiser: string | null; fee_text: string | null; link: string; description: string | null; gives_certificate: boolean
}

interface CallResult { intl: boolean; until: string; items: Found[]; searches: number; inputTokens: number; outputTokens: number; error?: string }

async function searchTheme(theme: Theme, today: string): Promise<CallResult> {
  const intl = !!theme.intl
  const until = new Date(Date.parse(today) + (intl ? INTL_HORIZON_DAYS : HORIZON_DAYS) * 86400000).toISOString().slice(0, 10)
  const base = { intl, until }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ...base, items: [], searches: 0, inputTokens: 0, outputTokens: 0, error: 'ANTHROPIC_API_KEY is not configured' }
  const messages: any[] = [{ role: 'user', content: `Find upcoming events in this group: ${theme.text}` }]
  let searches = 0, inputTokens = 0, outputTokens = 0
  let text = ''
  // The server pauses a long search turn (stop_reason pause_turn); we resend
  // the conversation so it carries on. Three rounds is plenty.
  for (let round = 0; round < 3; round++) {
    let res: Response
    try {
      res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 8000,
          system: system(today, until, intl),
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10, user_location: { type: 'approximate', country: 'IN', timezone: 'Asia/Kolkata' } }],
          messages,
        }),
        signal: AbortSignal.timeout(240000),
      })
    } catch (err: any) {
      return { ...base, items: [], searches, inputTokens, outputTokens, error: `network: ${err?.message || err}` }
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ...base, items: [], searches, inputTokens, outputTokens, error: `Anthropic ${res.status}: ${detail.slice(0, 200)}` }
    }
    const data = await res.json().catch(() => null)
    inputTokens += Number(data?.usage?.input_tokens) || 0
    outputTokens += Number(data?.usage?.output_tokens) || 0
    searches += Number(data?.usage?.server_tool_use?.web_search_requests) || 0
    const blocks: any[] = Array.isArray(data?.content) ? data.content : []
    text = blocks.filter(b => b?.type === 'text').map(b => b.text).join('')
    if (data?.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: blocks })
      continue
    }
    break
  }
  return { ...base, items: parseItems(text), searches, inputTokens, outputTokens }
}

function parseItems(text: string): Found[] {
  const start = text.indexOf('['), end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const arr = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

const CITY_BY_NAME: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const c of Object.values(CITY_CONFIGS)) {
    m[c.cityName.toLowerCase()] = c.citySlug
    m[c.citySlug.toLowerCase()] = c.citySlug
  }
  m['bengaluru'] = 'bangalore'; m['mysuru'] = 'mysore'; m['mangaluru'] = 'mangalore'
  m['aurangabad'] = 'sambhajinagar'; m['chhatrapati sambhajinagar'] = 'sambhajinagar'
  m['bombay'] = 'mumbai'; m['new delhi'] = 'delhi'
  return m
})()

function cityValue(city: string | null): string | null {
  if (!city) return null
  const c = city.trim().replace(/\s+/g, ' ')
  const slug = CITY_BY_NAME[c.toLowerCase()]
  if (slug && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, slug)) return slug
  return c.slice(0, 60) || null
}

export function dedupeKey(title: string, startsOn: string): string {
  const t = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|of|and|in|on|for|a|an|20\d\d)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return `${t.slice(0, 80)}|${startsOn}`
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

export async function runEventSearch(db: SupabaseClient, trigger: 'cron' | 'manual') {
  const now = new Date()
  const today = new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10) // IST date

  const { data: runRow } = await db.from('event_search_runs').insert({ trigger }).select('id').single()
  const runId = (runRow as any)?.id as string | undefined

  const results = await Promise.all(THEMES.map(t => searchTheme(t, today)))
  const searches = results.reduce((a, r) => a + r.searches, 0)
  const inputTokens = results.reduce((a, r) => a + r.inputTokens, 0)
  const outputTokens = results.reduce((a, r) => a + r.outputTokens, 0)
  const errors = results.map(r => r.error).filter(Boolean) as string[]
  // Sonnet 4.6: $3 / $15 per million tokens; web search $10 per 1,000.
  const costUsd = Math.round((inputTokens * 3 / 1e6 + outputTokens * 15 / 1e6 + searches * 0.01) * 1000) / 1000

  // Already-listed events in the window, to skip ones we (or an organiser) have.
  const { data: existing } = await db.from('events').select('title, starts_on, dedupe_key').gte('starts_on', today).limit(2000)
  const seen = new Set<string>()
  for (const e of (existing || []) as Array<{ title: string; starts_on: string; dedupe_key: string | null }>) {
    seen.add(e.dedupe_key || dedupeKey(e.title, e.starts_on))
  }

  const rows: Record<string, unknown>[] = []
  let found = 0
  for (const r of results) {
    for (const it of r.items) {
      found++
      const title = str(it?.title, 160)
      const link = str(it?.link, 400)
      if (!title || !link || !/^https:\/\//.test(link) || /google\.|bing\.com|facebook\.com\/search/.test(link)) continue
      if (!isDate(it.starts_on) || it.starts_on < today || it.starts_on > r.until) continue
      const endsOn = isDate(it.ends_on) && it.ends_on >= it.starts_on ? it.ends_on : null
      const key = dedupeKey(title, it.starts_on)
      if (seen.has(key)) continue
      seen.add(key)
      const online = it.is_online === true
      const country = r.intl ? normalizeCountry(it.country) : INDIA
      // The international group must not bring Indian events back as abroad.
      if (r.intl && country === INDIA) continue
      rows.push({
        country,
        title,
        kind: KINDS.includes(it.kind) ? it.kind : 'seminar',
        starts_on: it.starts_on,
        ends_on: endsOn,
        is_online: online,
        city: online ? null : r.intl ? str(it.city, 60) : cityValue(str(it.city, 60)),
        organiser: str(it.organiser, 160),
        fee_text: str(it.fee_text, 80),
        link,
        source_url: link,
        description: str(it.description, 300),
        gives_certificate: it.gives_certificate === true,
        status: 'pending',
        source: 'search',
        dedupe_key: key,
      })
    }
  }

  let added = 0
  if (rows.length) {
    const { data: ins, error } = await db.from('events').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id')
    if (error) errors.push(`save: ${error.message}`)
    else added = (ins || []).length
  }

  if (runId) {
    await db.from('event_search_runs').update({
      finished_at: new Date().toISOString(), found, added, searches,
      input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd,
      error: errors.length ? errors.join(' | ').slice(0, 1000) : null,
    }).eq('id', runId)
  }
  return { found, added, searches, cost_usd: costUsd, errors }
}
