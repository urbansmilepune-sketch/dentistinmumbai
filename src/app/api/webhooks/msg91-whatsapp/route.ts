// POST /api/webhooks/msg91-whatsapp?key=... — inbound WhatsApp messages from
// MSG91 (v2 network, Nov 2026): "post a case on WhatsApp".
//
// A dentist sends case photos to the DentistIn WhatsApp number. Each photo
// is copied to Cloudinary and added to their open WhatsApp draft; we reply
// once asking for a line of details (tooth, age, complaint, what was done).
// Their next text, or "skip", gets the link to /cases/new; with no text in
// 2 minutes the link is sent anyway. A caption on the photos counts as the
// details, so then the link comes in the first reply. Each draft gets the
// link once (link_sent_at; without that column, the old one-reply flow).
// Any caption or follow-up text is kept as a note; on opening the form the
// AI helper drafts title, specialty, diagnosis, plan and write-up from the
// photos + note into the empty fields, and the dentist checks, ticks consent
// and submits.
// The case is never published from WhatsApp alone.
//
// Safety:
//   - Only senders whose number matches an active dentist's phone/WhatsApp are
//     handled. Patients write to this number too (it sends booking
//     messages); they are logged and ignored, never answered.
//   - Text from a dentist is kept as a note only while a draft is open, or
//     answered with instructions if it says "case". Anything else is ignored.
//   - Off until WHATSAPP_CASE_POSTING_ENABLED=true. Every request is still
//     logged to whatsapp_inbound_log so the payload format can be checked.
//
// Setup (MSG91 panel > WhatsApp > Webhook / Inbound): point it at
//   https://dentistinindia.in/api/webhooks/msg91-whatsapp?key=<WHATSAPP_INBOUND_KEY>
//
// The payload shape differs between MSG91 accounts, so fields are found by
// name anywhere in the JSON (see pick()). Check whatsapp_inbound_log after the
// first test message if something is not picked up.

import { NextRequest, NextResponse, after } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { adminDb } from '@/lib/national'
import { cleanName } from '@/lib/dentistName'
import { waCaseLink } from '@/lib/waLoginLink'
import { sendWhatsAppText } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
// 300: the handler that answers an album may wait LINK_FALLBACK_MS for the
// dentist's details before sending the link anyway.
export const maxDuration = 300

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const DRAFT_HOURS = 24
const MAX_PHOTOS = 8
const REPLY_GAP_MS = 2 * 60 * 1000
const REPLY_WAIT_MS = 8000   // let the rest of an album arrive before replying
const LINK_FALLBACK_MS = 2 * 60 * 1000   // no details by then: send the link anyway

/** First value found under any of these keys, searching the whole object. */
function pick(obj: unknown, keys: string[], depth = 0): string | null {
  if (!obj || typeof obj !== 'object' || depth > 6) return null
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    // MSG91's default inbound payload can carry nested JSON as a string
    // (e.g. "messages": "[{...}]"), so parse those and look inside too.
    const inner = typeof v === 'string' && /^\s*[[{]/.test(v) ? safeJson(v) : v
    if (inner && typeof inner === 'object') {
      const r = pick(inner, keys, depth + 1)
      if (r) return r
    }
  }
  return null
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

function parse(payload: unknown) {
  const phone = pick(payload, ['customerNumber', 'customer_number', 'from', 'sender', 'mobile', 'wa_id'])
  const contentType = (pick(payload, ['contentType', 'content_type', 'type']) || '').toLowerCase()
  const text = pick(payload, ['text', 'body', 'caption', 'message'])
  const mediaUrl = pick(payload, ['url', 'mediaUrl', 'media_url', 'fileUrl', 'file_url', 'link'])
  const isImage = /image|photo/.test(contentType) || (!!mediaUrl && /\.(jpe?g|png|webp)(\?|$)/i.test(mediaUrl))
  return { phone, text: text && !/^https?:\/\//.test(text) ? text : null, mediaUrl: isImage ? mediaUrl : null, contentType }
}

async function copyToCloudinary(url: string, dentistId: string): Promise<{ url: string | null; error: string }> {
  try {
    const authKey = process.env.MSG91_WHATSAPP_AUTH_KEY || process.env.MSG91_AUTH_KEY
    const headers: Record<string, string> = {}
    // MSG91 serves inbound media from whatsapp.phone91.com; send the auth key
    // to MSG91's own hosts only.
    if (authKey && /(^|\.)(msg91\.com|phone91\.com)$/i.test(new URL(url).hostname)) headers.authkey = authKey
    const res = await fetch(url, { headers })
    if (!res.ok) return { url: null, error: `media download HTTP ${res.status}` }
    const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
    if (!type.startsWith('image/')) return { url: null, error: `media is ${type}, not an image` }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 10 * 1024 * 1024) return { url: null, error: 'image over 10 MB' }
    const up = await cloudinary.uploader.upload(`data:${type};base64,${buf.toString('base64')}`, {
      folder: `cases/${dentistId}/whatsapp`, resource_type: 'image',
      transformation: [{ width: 1800, crop: 'limit' }], quality: 'auto:good', fetch_format: 'auto',
    })
    return { url: up.secure_url, error: '' }
  } catch (err: any) {
    console.error('[wa-inbound] media copy failed', err?.message)
    return { url: null, error: `media copy error: ${String(err?.message || 'unknown').slice(0, 200)}` }
  }
}

// GET: setup check you can open in a browser. Shows only whether the two
// Vercel settings are present and whether the key in the URL matches; never
// the key itself.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || ''
  const expected = process.env.WHATSAPP_INBOUND_KEY || ''
  return NextResponse.json({
    webhook: 'msg91-whatsapp',
    key_set_in_vercel: !!expected,
    key_in_url_matches: !!expected && key === expected,
    posting_enabled: process.env.WHATSAPP_CASE_POSTING_ENABLED === 'true',
    whatsapp_enabled: process.env.WHATSAPP_ENABLED === 'true',
  })
}

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || ''
  // Some MSG91 webhooks send the body as text even with a JSON template.
  const raw = await req.text().catch(() => '')
  const db = adminDb()
  if (!process.env.WHATSAPP_INBOUND_KEY || key !== process.env.WHATSAPP_INBOUND_KEY) {
    // Log rejected calls too (short, without the key) so a setup mistake is
    // visible in whatsapp_inbound_log instead of silently returning 401.
    const why = !process.env.WHATSAPP_INBOUND_KEY ? 'rejected: WHATSAPP_INBOUND_KEY not set in Vercel' : 'rejected: wrong key in webhook URL'
    await db.from('whatsapp_inbound_log').insert({ payload: { raw: raw.slice(0, 2000) }, phone: null, content_type: why }).then(() => {}, () => {})
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const payload = safeJson(raw) ?? { raw: raw.slice(0, 20000) }
  const { phone, text, mediaUrl, contentType } = parse(payload)

  // MSG91 waits only 3 seconds and retries on timeout, so: log the message,
  // answer 200 at once, and do the slow part (download, Cloudinary, reply)
  // after the response. The WhatsApp message id makes retries no-ops.
  const messageId = pick(payload, ['uuid', 'wamid', 'message_id', 'messageId'])
  let ins = await db.from('whatsapp_inbound_log')
    .insert({ payload, phone, content_type: contentType || null, message_id: messageId })
    .select('id').single()
  if (ins.error?.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
  if (ins.error) {
    // message_id / outcome columns not added yet (5-webhook-outcome.sql): log without them.
    ins = await db.from('whatsapp_inbound_log').insert({ payload, phone, content_type: contentType || null }).select('id').single()
  }
  const logId = (ins.data as any)?.id as number | undefined

  after(() => handleMessage({ db, payload, phone, text, mediaUrl, contentType, logId }).catch(err => {
    console.error('[wa-inbound] handler error', err?.message)
    if (logId) db.from('whatsapp_inbound_log').update({ outcome: `error: ${String(err?.message || err).slice(0, 300)}` }).eq('id', logId).then(() => {}, () => {})
  }))
  return NextResponse.json({ ok: true, queued: true })
}

async function handleMessage(ctx: {
  db: ReturnType<typeof adminDb>
  payload: unknown
  phone: string | null
  text: string | null
  mediaUrl: string | null
  contentType: string
  logId: number | undefined
}): Promise<void> {
  const { db, payload, phone, text, mediaUrl, contentType, logId } = ctx
  const done = async (outcome: string) => {
    if (logId) await db.from('whatsapp_inbound_log').update({ outcome: outcome.slice(0, 500) }).eq('id', logId).then(() => {}, () => {})
  }
  const reply = async (msg: string) => {
    const r = await sendWhatsAppText(phone, msg)
    return r.success ? 'reply sent' : `reply FAILED: ${String((r as any).error || '').slice(0, 300)}`
  }

  // MSG91 webhooks can be account-wide (Thetoothwork uses another number on
  // the same account): only handle messages sent to the DentistIn number.
  const ourNumber = (process.env.MSG91_WHATSAPP_NUMBER || '917719013232').replace(/\D/g, '').slice(-10)
  const toNumber = (pick(payload, ['integratedNumber', 'integrated_number', 'businessNumber', 'display_phone_number']) || '').replace(/\D/g, '').slice(-10)
  if (toNumber && toNumber !== ourNumber) return done(`ignored: sent to another number (${toNumber})`)
  const last10 = (phone || '').replace(/\D/g, '').slice(-10)
  if (!/^[6-9]\d{9}$/.test(last10)) return done('ignored: no valid sender number')

  // "Stop event alerts" (the quick-reply button on event alerts) or a plain
  // STOP turns event alerts off for every dentist row with this number.
  // Always honoured, whatever the case-posting switch says.
  if (text && /^\s*stop(\s+event\s+alerts)?\s*[.!]?\s*$/i.test(text)) {
    const loose = `%${last10.split('').join('%')}%`
    const { data: rows } = await db.from('dentists').select('id, phone, whatsapp').or(`phone.ilike.${loose},whatsapp.ilike.${loose}`).limit(20)
    const d10 = (v: unknown) => String(v || '').replace(/\D/g, '').slice(-10)
    const ids = ((rows || []) as Array<Record<string, any>>).filter(d => d10(d.phone) === last10 || d10(d.whatsapp) === last10).map(d => d.id as string)
    if (!ids.length) return done(`stop: no dentist with number ending ${last10}`)
    const { error } = await db.from('dentists').update({ event_alerts_off: true }).in('id', ids)
    if (error) return done(`stop FAILED: ${error.message}`)
    const r = await reply('Done. You will not get event alerts from DentistIn India any more.')
    return done(`event alerts off for ${ids.length} dentist row(s); ${r}`)
  }

  if (process.env.WHATSAPP_CASE_POSTING_ENABLED !== 'true') return done('ignored: WHATSAPP_CASE_POSTING_ENABLED is not true')

  // Stored numbers vary ("+91 99751 91883", "099751-91883"), so match the
  // ten digits with anything in between, then confirm on digits only.
  const loose = `%${last10.split('').join('%')}%`
  const { data: candidates } = await db.from('dentists')
    .select('id, name, phone, whatsapp, is_active, created_at')
    .or(`phone.ilike.${loose},whatsapp.ilike.${loose}`)
    .order('created_at').limit(20)
  const digits10 = (v: unknown) => String(v || '').replace(/\D/g, '').slice(-10)
  const sameNumber = ((candidates || []) as Array<Record<string, any>>)
    .filter(d => digits10(d.phone) === last10 || digits10(d.whatsapp) === last10)
  const dentist = sameNumber.find(d => d.is_active !== false)
  if (!dentist) {
    return done(sameNumber.length
      ? `ignored: dentist ${sameNumber[0].id} with this number is not active`
      : `ignored: no dentist with number ending ${last10}`)   // patient or unknown
  }

  const since = new Date(Date.now() - DRAFT_HOURS * 3600000).toISOString()
  const { data: open } = await db.from('whatsapp_case_drafts').select('*')
    .eq('dentist_id', dentist.id).is('used_at', null).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1)
  let draft = open?.[0] as Record<string, any> | undefined
  const first = cleanName(dentist.name).split(' ')[0] || 'Doctor'
  // Signed link: signs them in on dentistinindia.in in one tap (their login
  // may only exist on their city site, whose cookie doesn't carry over).
  const link = waCaseLink(dentist.id)

  if (!mediaUrl) {
    if (draft && text) {
      const skip = /^\s*(skip|no|nothing|later)\s*[.!]?\s*$/i.test(text)
      const firstNote = !draft.note
      if (!skip) {
        const note = [draft.note, text].filter(Boolean).join('\n').slice(0, 4000)
        await db.from('whatsapp_case_drafts').update({ note }).eq('id', draft.id)
      }
      const claim = await claimLink(db, draft.id)
      if (claim === 'sent-before') return done(`note added to draft ${draft.id}; link already sent`)
      if (claim === 'no-column' && !firstNote && !skip) return done(`note added to draft ${draft.id}`)
      const msg = skip
        ? `No problem, Dr. ${first}. Open your case here, check the details we filled in from your photos, and tap Submit: ${link}`
        : `Thanks, Dr. ${first}. We will fill in your case from your photos and this note. Open it here, check the details and tap Submit: ${link}`
      const r = await reply(msg)
      if (r !== 'reply sent' && claim === 'claimed') await unclaimLink(db, draft.id)
      return done(`${skip ? 'skip' : 'note added'} on draft ${draft.id}; link ${r}`)
    }
    if (text && /\bcase\b/i.test(text)) {
      return done(`instructions: ${await reply(`Hi Dr. ${first}, to post a case on DentistIn India, send the case photos and X-rays here (face and name hidden), with one line about the case, e.g. "36 RCT, 34 yr male, pain 2 weeks". We fill in the details for you; then check and submit it on ${link}`)}`)
    }
    return done(`ignored: ${contentType || 'message'} with no photo from dentist ${dentist.id}`)
  }

  const photos: string[] = Array.isArray(draft?.photo_urls) ? draft!.photo_urls : []
  if (photos.length >= MAX_PHOTOS) {
    return done(`ignored: draft ${draft?.id} already has ${MAX_PHOTOS} photos`)
  }
  const copied = await copyToCloudinary(mediaUrl, dentist.id)
  if (!copied.url) {
    const r = await reply(`Sorry Dr. ${first}, we could not save that photo. Please send it again, or upload it on ${link}`)
    return done(`photo NOT saved (${copied.error}); ${r}`)
  }
  // Photos in an album arrive as separate webhooks within a second, so several
  // of these handlers run at once. Every write below is safe under that.
  const url = copied.url
  let draftId: string | undefined = draft?.id
  if (!draftId) {
    const ins = await db.from('whatsapp_case_drafts').insert({ dentist_id: dentist.id, photo_urls: [], note: null }).select('id').single()
    draftId = (ins.data as any)?.id
    // Two handlers may have created a draft at the same moment: everyone uses
    // the oldest open one, and the extra empty one is deleted.
    const { data: opens } = await db.from('whatsapp_case_drafts').select('id')
      .eq('dentist_id', dentist.id).is('used_at', null).gte('created_at', since)
      .order('created_at').order('id').limit(5)
    const oldest = (opens as any[] | null)?.[0]?.id as string | undefined
    if (oldest && draftId && oldest !== draftId) {
      await db.from('whatsapp_case_drafts').delete().eq('id', draftId)
      draftId = oldest
    }
  }
  if (!draftId) return done('photo NOT saved: could not open a draft')
  const added = await appendPhoto(db, draftId, url, text)
  if (!added.ok) return done(`photo NOT saved: ${added.error}`)

  // One reply per burst: wait for the rest of the album, then only the
  // handler that wins the replied_at claim sends it, with the final count.
  await new Promise(r => setTimeout(r, REPLY_WAIT_MS))
  const nowIso = new Date().toISOString()
  const cutoff = new Date(Date.now() - REPLY_GAP_MS).toISOString()
  const { data: claimed } = await db.from('whatsapp_case_drafts')
    .update({ replied_at: nowIso })
    .eq('id', draftId)
    .or(`replied_at.is.null,replied_at.lt.${cutoff}`)
    .select('photo_urls')
  if (!claimed?.length) return done(`photo saved to draft ${draftId} (${added.count}); reply skipped, another message in this burst replied`)
  const count = Array.isArray((claimed[0] as any).photo_urls) ? (claimed[0] as any).photo_urls.length : added.count
  const saved = `Got it, Dr. ${first}. ${count} photo${count === 1 ? '' : 's'} saved for your case.`
  const unclaimReply = () => db.from('whatsapp_case_drafts').update({ replied_at: null }).eq('id', draftId).eq('replied_at', nowIso)

  const { data: state, error: stateErr } = await db.from('whatsapp_case_drafts').select('note, link_sent_at').eq('id', draftId).single()
  const hasNote = !!(state as any)?.note
  // Old flow (link_sent_at column not added yet), or the link went out
  // already (more photos later): photos saved + link in one message.
  const linkAt = (state as any)?.link_sent_at as string | null | undefined
  if (stateErr || linkAt) {
    // Link sent in the last 10 minutes (e.g. their details text overtook the
    // album): don't send it twice.
    const recent = !!linkAt && Date.now() - new Date(linkAt).getTime() < 10 * 60 * 1000
    const r = await reply(recent ? `${saved} Use the link above to finish your case.` : `${saved} Open your case here, check the details and tap Submit: ${link}`)
    if (r !== 'reply sent') await unclaimReply()
    return done(`photo saved to draft ${draftId} (${count}); ${r}`)
  }
  // A caption came with the photos: that is the details, send the link now.
  if (hasNote) {
    const claim = await claimLink(db, draftId)
    if (claim !== 'claimed') return done(`photo saved to draft ${draftId} (${count}); link already sent`)
    const r = await reply(`${saved} We will fill in your case from your photos and message. Open it here, check the details and tap Submit: ${link}`)
    if (r !== 'reply sent') { await unclaimReply(); await unclaimLink(db, draftId) }
    return done(`photo saved to draft ${draftId} (${count}); link ${r}`)
  }
  // Ask for details first; their reply (or "skip") gets the link.
  const r = await reply(`${saved}\n\nAny details you want to share? Reply with one line, e.g. "36 RCT, 34 yr male, pain 2 weeks". We use it to fill in your case for you. No patient names or phone numbers, please.\n\nOr reply SKIP to get the link now.`)
  if (r !== 'reply sent') {
    await unclaimReply()
    return done(`photo saved to draft ${draftId} (${count}); details ask ${r}`)
  }
  await done(`photo saved to draft ${draftId} (${count}); details ask sent, waiting for details`)
  // Nobody gets stuck: no details in 2 minutes, send the link anyway.
  await new Promise(res => setTimeout(res, LINK_FALLBACK_MS))
  const claim = await claimLink(db, draftId)
  if (claim !== 'claimed') return done(`photo saved to draft ${draftId} (${count}); details ask sent; link sent by the details reply`)
  const r2 = await reply(`Dr. ${first}, here is the link to finish your case. Check the details we filled in from your photos and tap Submit: ${link}`)
  if (r2 !== 'reply sent') await unclaimLink(db, draftId)
  return done(`photo saved to draft ${draftId} (${count}); details ask sent; no details in 2 min, link ${r2}`)
}

// Marks a draft's link as sent, once. 'claimed' = this caller sends it.
async function claimLink(db: ReturnType<typeof adminDb>, draftId: string): Promise<'claimed' | 'sent-before' | 'no-column'> {
  const { data, error } = await db.from('whatsapp_case_drafts')
    .update({ link_sent_at: new Date().toISOString() })
    .eq('id', draftId).is('link_sent_at', null).select('id')
  if (error) return 'no-column'
  return data?.length ? 'claimed' : 'sent-before'
}

async function unclaimLink(db: ReturnType<typeof adminDb>, draftId: string): Promise<void> {
  await db.from('whatsapp_case_drafts').update({ link_sent_at: null }).eq('id', draftId).then(() => {}, () => {})
}

// Postgres array literal, for an exact-match filter on photo_urls.
function pgArray(items: string[]): string {
  return `{${items.map(u => `"${u.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
}

// Adds one photo to a draft without losing photos that other handlers add at
// the same moment: the write only lands if photo_urls is unchanged since we
// read it; otherwise read again and retry.
async function appendPhoto(db: ReturnType<typeof adminDb>, draftId: string, url: string, text: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data: row, error } = await db.from('whatsapp_case_drafts').select('photo_urls, note').eq('id', draftId).single()
    if (error || !row) return { ok: false, error: `draft ${draftId} not found` }
    const photos: string[] = Array.isArray((row as any).photo_urls) ? (row as any).photo_urls : []
    if (photos.includes(url)) return { ok: true, count: photos.length }
    if (photos.length >= MAX_PHOTOS) return { ok: false, error: `draft ${draftId} already has ${MAX_PHOTOS} photos` }
    const note = text ? [(row as any).note, text].filter(Boolean).join('\n').slice(0, 4000) : (row as any).note
    const { data: upd, error: updErr } = await db.from('whatsapp_case_drafts')
      .update({ photo_urls: [...photos, url], note })
      .eq('id', draftId)
      .eq('photo_urls', pgArray(photos))
      .select('id')
    if (upd?.length) return { ok: true, count: photos.length + 1 }
    if (updErr) {
      // The array filter was refused: save anyway rather than lose the photo.
      const plain = await db.from('whatsapp_case_drafts').update({ photo_urls: [...photos, url], note }).eq('id', draftId)
      return plain.error ? { ok: false, error: plain.error.message } : { ok: true, count: photos.length + 1 }
    }
    await new Promise(r => setTimeout(r, 100 + Math.random() * 300))
  }
  return { ok: false, error: 'draft busy, gave up after 12 tries' }
}
