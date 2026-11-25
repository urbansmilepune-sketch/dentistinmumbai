// POST /api/webhooks/msg91-whatsapp?key=... — inbound WhatsApp messages from
// MSG91 (v2 network, Nov 2026): "post a case on WhatsApp".
//
// A dentist sends case photos to the DentistIn WhatsApp number. Each photo
// is copied to Cloudinary and added to their open WhatsApp draft; we reply
// once with a link to /cases/new, where the photos are already filled in
// and the dentist adds the details, runs the AI helper and ticks consent.
// The case is never published from WhatsApp alone.
//
// Safety:
//   - Only senders whose number matches a dentist's phone/WhatsApp are
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

import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { adminDb } from '@/lib/national'
import { cleanName } from '@/lib/dentistName'
import { sendWhatsAppText } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const DRAFT_HOURS = 24
const MAX_PHOTOS = 8
const REPLY_GAP_MS = 2 * 60 * 1000

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

async function copyToCloudinary(url: string, dentistId: string): Promise<string | null> {
  try {
    const authKey = process.env.MSG91_WHATSAPP_AUTH_KEY || process.env.MSG91_AUTH_KEY
    const headers: Record<string, string> = {}
    if (authKey && /msg91/i.test(new URL(url).hostname)) headers.authkey = authKey
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 10 * 1024 * 1024) return null
    const up = await cloudinary.uploader.upload(`data:${type};base64,${buf.toString('base64')}`, {
      folder: `cases/${dentistId}/whatsapp`, resource_type: 'image',
      transformation: [{ width: 1800, crop: 'limit' }], quality: 'auto:good', fetch_format: 'auto',
    })
    return up.secure_url
  } catch (err: any) {
    console.error('[wa-inbound] media copy failed', err?.message)
    return null
  }
}

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || ''
  if (!process.env.WHATSAPP_INBOUND_KEY || key !== process.env.WHATSAPP_INBOUND_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Some MSG91 webhooks send the body as text even with a JSON template.
  const raw = await req.text().catch(() => '')
  const payload = safeJson(raw) ?? { raw: raw.slice(0, 20000) }
  const db = adminDb()
  const { phone, text, mediaUrl, contentType } = parse(payload)

  // Always log (table may not exist yet; ignore errors).
  await db.from('whatsapp_inbound_log').insert({ payload, phone, content_type: contentType || null }).then(() => {}, () => {})

  if (process.env.WHATSAPP_CASE_POSTING_ENABLED !== 'true') return NextResponse.json({ ok: true, handled: false })
  // MSG91 webhooks can be account-wide (Thetoothwork uses another number on
  // the same account): only handle messages sent to the DentistIn number.
  const ourNumber = (process.env.MSG91_WHATSAPP_NUMBER || '917719013232').replace(/\D/g, '').slice(-10)
  const toNumber = (pick(payload, ['integratedNumber', 'integrated_number', 'businessNumber', 'display_phone_number']) || '').replace(/\D/g, '').slice(-10)
  if (toNumber && toNumber !== ourNumber) return NextResponse.json({ ok: true, handled: false, other_number: true })
  const last10 = (phone || '').replace(/\D/g, '').slice(-10)
  if (!/^[6-9]\d{9}$/.test(last10)) return NextResponse.json({ ok: true, handled: false })

  const { data: matches } = await db.from('dentists')
    .select('id, name, phone, whatsapp, is_active')
    .or(`phone.ilike.%${last10},whatsapp.ilike.%${last10}`)
    .eq('is_active', true).order('created_at').limit(1)
  const dentist = matches?.[0]
  if (!dentist) return NextResponse.json({ ok: true, handled: false })   // patient or unknown: ignore

  const since = new Date(Date.now() - DRAFT_HOURS * 3600000).toISOString()
  const { data: open } = await db.from('whatsapp_case_drafts').select('*')
    .eq('dentist_id', dentist.id).is('used_at', null).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1)
  let draft = open?.[0] as Record<string, any> | undefined
  const first = cleanName(dentist.name).split(' ')[0] || 'Doctor'
  const link = `${NATIONAL_ORIGIN}/cases/new`

  if (!mediaUrl) {
    if (draft && text) {
      const note = [draft.note, text].filter(Boolean).join('\n').slice(0, 4000)
      await db.from('whatsapp_case_drafts').update({ note }).eq('id', draft.id)
      return NextResponse.json({ ok: true, handled: true })
    }
    if (text && /\bcase\b/i.test(text)) {
      await sendWhatsAppText(phone, `Hi Dr. ${first}, to post a case on DentistIn India, send the case photos and X-rays here (face and name hidden), with one line about the case. Then finish it on ${link}`)
      return NextResponse.json({ ok: true, handled: true })
    }
    return NextResponse.json({ ok: true, handled: false })
  }

  const photos: string[] = Array.isArray(draft?.photo_urls) ? draft!.photo_urls : []
  if (photos.length >= MAX_PHOTOS) {
    return NextResponse.json({ ok: true, handled: true, full: true })
  }
  const url = await copyToCloudinary(mediaUrl, dentist.id)
  if (!url) {
    await sendWhatsAppText(phone, `Sorry Dr. ${first}, we could not save that photo. Please send it again, or upload it on ${link}`)
    return NextResponse.json({ ok: true, handled: true, saved: false })
  }
  const next = [...photos, url]
  if (draft) {
    await db.from('whatsapp_case_drafts').update({ photo_urls: next, note: text ? [draft.note, text].filter(Boolean).join('\n').slice(0, 4000) : draft.note }).eq('id', draft.id)
  } else {
    const ins = await db.from('whatsapp_case_drafts').insert({ dentist_id: dentist.id, photo_urls: next, note: text }).select('*').single()
    draft = ins.data || undefined
  }

  // One reply per burst of photos.
  const lastReply = draft?.replied_at ? new Date(draft.replied_at).getTime() : 0
  if (draft && Date.now() - lastReply > REPLY_GAP_MS) {
    await sendWhatsAppText(phone, `Got it, Dr. ${first}. ${next.length} photo${next.length === 1 ? '' : 's'} saved for your case. Send more if you like, then finish it here (add the details and patient consent): ${link}`)
    await db.from('whatsapp_case_drafts').update({ replied_at: new Date().toISOString() }).eq('id', draft.id)
  }
  return NextResponse.json({ ok: true, handled: true, saved: true })
}
