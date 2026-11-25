// Admin Events review API (dentistinindia.in events and courses).
//   GET  — listings (pending first), the last auto-search runs, and this
//          month's paid total.
//   POST — { action, id, ... }:
//          approve      → live (status approved); emails the submitter
//          reject       → status rejected; a paid listing becomes refund_due
//          edit         → change the listing's facts (fields below)
//          create_link  → make a Razorpay pay link for a Featured request
//          mark_paid    → paid outside Razorpay (e.g. bank transfer)
//          mark_refunded→ after refunding in the Razorpay dashboard
//          make_free    → turn a Featured request into a free listing
// Refunds are done by hand in Razorpay; this screen only records them.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createEventPaymentLink, eventPaymentsEnabled } from '@/lib/eventPayments'
import { sendListingLiveEmail } from '@/lib/eventEmails'
import { featuredUntil, istToday } from '@/lib/eventFeatured'
import { eventAlertsEnabled } from '@/lib/eventAlerts'

const KINDS = ['exhibition', 'course', 'seminar', 'study_club', 'conference']

export async function GET() {
  const db = await requireAdmin()
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const since = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await db.from('events').select('*').gte('starts_on', since).order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: runs } = await db.from('event_search_runs').select('*').order('started_at', { ascending: false }).limit(5)
  const monthStart = istToday().slice(0, 8) + '01'
  const paidThisMonth = ((data || []) as Array<Record<string, any>>)
    .filter(e => e.payment_status === 'paid' && e.paid_at && e.paid_at.slice(0, 10) >= monthStart)
    .reduce((a, e) => a + (Number(e.amount_rupees) || 0), 0)
  return NextResponse.json({
    events: data || [],
    runs: runs || [],
    paid_this_month: paidThisMonth,
    payments_on: eventPaymentsEnabled(),
    alerts_on: eventAlertsEnabled(),
  })
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? (v.trim() ? v.trim().slice(0, max) : null) : undefined)
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function POST(request: NextRequest) {
  const db = await requireAdmin()
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await request.json().catch(() => null)
  const id = typeof b?.id === 'string' ? b.id : ''
  const action = String(b?.action || '')
  const { data: ev, error: getErr } = await db.from('events').select('*').eq('id', id).maybeSingle()
  if (getErr || !ev) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  const e = ev as Record<string, any>
  const now = new Date().toISOString()
  let update: Record<string, unknown> | null = null

  switch (action) {
    case 'approve': {
      update = { status: 'approved', approved_at: now }
      const after = { ...e, ...update }
      const until = featuredUntil(after)
      if (until) update.featured_until = until
      break
    }
    case 'reject':
      update = { status: 'rejected', admin_note: str(b?.note, 400) ?? e.admin_note }
      if (e.payment_status === 'paid') update.payment_status = 'refund_due'
      break
    case 'edit': {
      const f = b?.fields || {}
      update = {}
      const title = str(f.title, 160)
      if (title) update.title = title
      if (KINDS.includes(f.kind)) update.kind = f.kind
      if (isDate(f.starts_on)) update.starts_on = f.starts_on
      if (f.ends_on === '' || f.ends_on === null) update.ends_on = null
      else if (isDate(f.ends_on)) update.ends_on = f.ends_on
      if (typeof f.is_online === 'boolean') update.is_online = f.is_online
      for (const [k, max] of [['city', 60], ['organiser', 160], ['fee_text', 80], ['description', 600], ['admin_note', 400]] as const) {
        const v = str(f[k], max)
        if (v !== undefined) update[k] = v
      }
      const link = str(f.link, 400)
      if (link !== undefined) {
        if (link && !/^https?:\/\//.test(link)) return NextResponse.json({ error: 'The link must start with https://' }, { status: 400 })
        update.link = link
      }
      if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
      break
    }
    case 'create_link': {
      if (e.plan !== 'featured' || e.payment_status !== 'pending') return NextResponse.json({ error: 'Only a Featured listing waiting for payment needs a link' }, { status: 400 })
      const link = await createEventPaymentLink({ id: e.id, title: e.title, amount_rupees: e.amount_rupees, submitter_email: e.submitter_email, submitter_phone: e.submitter_phone, organiser: e.organiser })
      if (!link.ok) return NextResponse.json({ error: link.error }, { status: 400 })
      update = { payment_link_id: link.id, payment_link_url: link.url }
      break
    }
    case 'mark_paid':
      if (e.plan !== 'featured') return NextResponse.json({ error: 'Not a Featured listing' }, { status: 400 })
      update = { payment_status: 'paid', paid_at: now }
      if (e.status === 'approved') {
        const until = featuredUntil({ ...e, ...update })
        if (until) update.featured_until = until
      }
      break
    case 'mark_refunded':
      if (e.payment_status !== 'refund_due' && e.payment_status !== 'paid') return NextResponse.json({ error: 'Nothing to refund' }, { status: 400 })
      update = { payment_status: 'refunded' }
      break
    case 'make_free':
      if (e.payment_status === 'paid') return NextResponse.json({ error: 'Already paid: reject and refund instead' }, { status: 400 })
      update = { plan: 'free', payment_status: 'none', payment_link_id: null, payment_link_url: null }
      break
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { data: saved, error } = await db.from('events').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (action === 'approve' && e.status !== 'approved' && e.submitter_email) {
    await sendListingLiveEmail({ to: e.submitter_email, id: e.id, title: e.title, featured: e.plan === 'featured' && e.payment_status === 'paid' })
  }
  return NextResponse.json({ success: true, event: saved })
}
