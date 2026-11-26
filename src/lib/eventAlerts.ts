// Email + WhatsApp alerts to dentists for paid Featured events and courses.
//
// Who: every active dentist in the cities the organiser paid for (or every
// active dentist for All India), minus anyone who turned event alerts off.
// When: once the day the listing goes live, once 2 days before it starts.
// Sent by the daily cron /api/cron/event-alerts, never from a request.
//
// Off until EVENT_ALERTS_ENABLED=true. WhatsApp also needs WHATSAPP_ENABLED
// and the two MARKETING templates (event_alert_live, event_alert_reminder)
// approved by Meta. Until then the cron only reports how many it would send.
//
// Opt-out: the WhatsApp templates carry a "Stop event alerts" button (and
// replying STOP works too, see the MSG91 webhook); every email has a link to
// /events/stop-alerts?t=<signed token>. Either sets dentists.event_alerts_off.
//
// Every send is recorded in event_alert_log (event, dentist, kind), so a
// retried or overlapping run never sends the same alert twice.

import { createHmac, createHash, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { getCityFrom } from '@/lib/email'
import { cleanName } from '@/lib/dentistName'
import { cityNameOf } from '@/lib/national'
import { sendEventAlertWhatsApp, whatsAppEnabled } from '@/lib/whatsapp'

export type AlertKind = 'live' | 'reminder'

export function eventAlertsEnabled(): boolean {
  return process.env.EVENT_ALERTS_ENABLED === 'true'
}

/** Active dentists per city slug (used for the price and the audience size). */
export async function activeDentistCounts(db: SupabaseClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('dentists').select('city').eq('is_active', true).range(from, from + 999)
    if (error || !data) break
    for (const r of data as Array<{ city: string | null }>) {
      if (r.city) counts[r.city] = (counts[r.city] || 0) + 1
    }
    if (data.length < 1000) break
  }
  return counts
}

interface AudienceDentist { id: string; name: string | null; email: string | null; phone: string | null; whatsapp: string | null; city: string | null }

export async function alertAudience(db: SupabaseClient, ev: { feature_all_india: boolean; feature_cities: string[] | null }): Promise<AudienceDentist[]> {
  const out: AudienceDentist[] = []
  const cities = ev.feature_cities || []
  if (!ev.feature_all_india && !cities.length) return out
  for (let from = 0; ; from += 1000) {
    let q = db.from('dentists').select('id, name, email, phone, whatsapp, city, event_alerts_off')
      .eq('is_active', true).order('id').range(from, from + 999)
    if (!ev.feature_all_india) q = q.in('city', cities)
    const { data, error } = await q
    if (error || !data) break
    for (const d of data as Array<AudienceDentist & { event_alerts_off?: boolean }>) {
      if (d.event_alerts_off) continue
      out.push(d)
    }
    if (data.length < 1000) break
  }
  return out
}

// ── Signed stop-alerts link (email) ──

function key(): Buffer | null {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  return base ? createHash('sha256').update(`event-alerts-stop:v1:${base}`).digest() : null
}

export function stopAlertsToken(dentistId: string): string | null {
  const k = key()
  if (!k) return null
  const sig = createHmac('sha256', k).update(dentistId).digest('base64url').slice(0, 24)
  return `${Buffer.from(dentistId).toString('base64url')}.${sig}`
}

export function dentistFromStopToken(token: string): string | null {
  const k = key()
  const [b, sig] = String(token || '').split('.')
  if (!k || !b || !sig) return null
  let id: string
  try { id = Buffer.from(b, 'base64url').toString('utf8') } catch { return null }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const expected = createHmac('sha256', k).update(id).digest('base64url').slice(0, 24)
  const a = Buffer.from(expected), c = Buffer.from(sig)
  return a.length === c.length && timingSafeEqual(a, c) ? id : null
}

// ── Message text ──

export function eventWhen(ev: { starts_on: string; ends_on?: string | null }): string {
  const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return ev.ends_on && ev.ends_on !== ev.starts_on ? `${f(ev.starts_on)} to ${f(ev.ends_on)}` : f(ev.starts_on)
}

export function eventWhere(ev: { is_online: boolean; city: string | null }): string {
  return ev.is_online ? 'Online' : (cityNameOf(ev.city) || ev.city || 'India')
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function emailHtml(p: { kind: AlertKind; firstName: string; title: string; when: string; where: string; organiser: string | null; link: string; stopUrl: string }): string {
  const lead = p.kind === 'live'
    ? `A new ${esc(p.where === 'Online' ? 'online event' : 'event')} for dentists is listed on DentistIn India:`
    : 'A reminder, this starts in 2 days:'
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1923">
  <p>Hi Dr. ${esc(p.firstName)},</p>
  <p>${lead}</p>
  <div style="border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin:12px 0">
    <div style="font-size:18px;font-weight:700;margin-bottom:6px">${esc(p.title)}</div>
    <div style="color:#475569">${esc(p.when)} · ${esc(p.where)}</div>
    ${p.organiser ? `<div style="color:#475569">By ${esc(p.organiser)}</div>` : ''}
  </div>
  <p><a href="${esc(p.link)}" style="display:inline-block;background:#1D4ED8;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">See details</a></p>
  <p style="font-size:12px;color:#64748B;margin-top:24px">This is a Featured listing on DentistIn India. You get these because you are a registered DentistIn dentist. <a href="${esc(p.stopUrl)}" style="color:#64748B">Stop event alerts</a></p>
</div>`
}

/**
 * Send one kind of alert for one event to its whole audience. Skips anyone
 * already in event_alert_log for this (event, kind). Returns counts; with
 * live=false it only counts.
 */
export async function sendEventAlerts(db: SupabaseClient, ev: Record<string, any>, kind: AlertKind, live: boolean) {
  const audience = await alertAudience(db, { feature_all_india: !!ev.feature_all_india, feature_cities: ev.feature_cities || [] })
  const { data: done } = await db.from('event_alert_log').select('dentist_id').eq('event_id', ev.id).eq('kind', kind)
  const already = new Set(((done || []) as Array<{ dentist_id: string }>).map(r => r.dentist_id))
  const todo = audience.filter(d => !already.has(d.id))
  const stats = { audience: audience.length, todo: todo.length, email_sent: 0, whatsapp_sent: 0, failed: 0 }
  if (!live || !todo.length) return stats

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const from = process.env.EVENT_EMAIL_FROM || getCityFrom(null, { national: true })
  const link = `${NATIONAL_ORIGIN}/events?e=${ev.id}#ev-${ev.id}`
  const when = eventWhen(ev as { starts_on: string; ends_on: string | null })
  const where = eventWhere(ev as { is_online: boolean; city: string | null })
  const title = String(ev.title || 'Dental event')
  const sendWa = whatsAppEnabled()

  async function one(d: AudienceDentist) {
    const firstName = cleanName(d.name).split(' ')[0] || 'Doctor'
    let emailOk = false, waOk = false
    if (resend && d.email) {
      const t = stopAlertsToken(d.id)
      const stopUrl = t ? `${NATIONAL_ORIGIN}/events/stop-alerts?t=${t}` : `${NATIONAL_ORIGIN}/events`
      try {
        const r: any = await resend.emails.send({
          from, to: d.email,
          subject: kind === 'live' ? `New on DentistIn: ${title}` : `In 2 days: ${title}`,
          html: emailHtml({ kind, firstName, title, when, where, organiser: ev.organiser || null, link, stopUrl }),
        })
        emailOk = !r?.error
      } catch { emailOk = false }
    }
    const phone = d.whatsapp || d.phone
    if (sendWa && phone) {
      const r = await sendEventAlertWhatsApp({ dentistPhone: phone, kind, firstName, title, when, where, link })
      waOk = r.success
    }
    if (emailOk) stats.email_sent++
    if (waOk) stats.whatsapp_sent++
    if (!emailOk && !waOk) { stats.failed++; return }
    await db.from('event_alert_log').upsert(
      { event_id: ev.id, dentist_id: d.id, kind, email_ok: emailOk, whatsapp_ok: waOk },
      { onConflict: 'event_id,dentist_id,kind', ignoreDuplicates: true },
    )
  }

  // Two at a time, at most one pair a second: Resend allows about 2 sends a
  // second, and a few hundred dentists still fit in the cron's 5 minutes.
  for (let i = 0; i < todo.length; i += 2) {
    const t0 = Date.now()
    await Promise.all(todo.slice(i, i + 2).map(d => one(d).catch(() => { stats.failed++ })))
    const wait = 1000 - (Date.now() - t0)
    if (wait > 0 && i + 2 < todo.length) await new Promise(r => setTimeout(r, wait))
  }
  return stats
}
