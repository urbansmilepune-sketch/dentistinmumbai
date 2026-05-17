// Dentist Communications fan-out endpoint. Reads the message + recipient
// scope, resolves to actual patient rows (filtered to opted-in only),
// either emails them through Resend in throttled batches or returns
// wa.me links for the client to open in tabs, then writes a row to
// communications_log so the dashboard can show send history.
//
// Three send modes mirror the UI tabs:
//   { mode: 'individual', patient_ids: [<id>] }
//   { mode: 'selected',   patient_ids: [<id>, <id>, …] }
//   { mode: 'all' }
//
// Personalization happens server-side: the message comes in with tags
// like {patient_name}; we interpolate per recipient before each email
// goes out and before each wa.me link is built. Keeps the client form
// dumb (it just types the template) and the audit-log row carries the
// raw template, not the N expanded copies.
//
// Throttling — email path goes 10 at a time with a 1s gap between
// batches. Resend's transactional rate limit on paid plans is generous
// (~10/s) so this is conservative; if we ever hit it the response 429
// will surface as a failed_count line on the audit row.
//
// WhatsApp — we don't have the Business API yet, so this endpoint
// just builds wa.me links the client opens in new tabs. The audit log
// still records the blast because the dentist did the work; it just
// can't confirm delivery the way Resend can.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPatientMessage } from '@/lib/email'

type Mode = 'individual' | 'selected' | 'all'
type Channel = 'email' | 'whatsapp'

const EMAIL_BATCH_SIZE = 10
const EMAIL_BATCH_DELAY_MS = 1000

interface Patient {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  opt_out_communications: boolean | null
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Personalize: replace {patient_name}, {clinic_name}, {dentist_name},
// {clinic_phone} with the per-recipient values. Tags the dentist
// doesn't fill in (e.g. clinic_phone when the dentist row has no
// phone) are replaced with empty string rather than left as literal
// `{clinic_phone}` text in the outgoing message.
function personalize(template: string, vars: { patient_name: string; clinic_name: string; dentist_name: string; clinic_phone: string }): string {
  return template
    .replaceAll('{patient_name}', vars.patient_name)
    .replaceAll('{clinic_name}', vars.clinic_name)
    .replaceAll('{dentist_name}', vars.dentist_name)
    .replaceAll('{clinic_phone}', vars.clinic_phone)
}

// Normalize an Indian phone number to a wa.me-compatible E.164-ish form
// (digits only, prefixed with country code). We accept what's on the
// patient row as-is — most clinics enter 10-digit numbers, some include
// +91 already. wa.me strips the '+' anyway so we just collapse to
// digits with the 91 prefix.
function waNumber(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1)
  // Anything else: trust it as-is so a non-Indian number isn't dropped.
  return digits
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, name, clinic_name, phone, city')
    .eq('email', user.email)
    .maybeSingle()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const mode = body.mode as Mode
  const channel = body.channel as Channel
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const patientIds = Array.isArray(body.patient_ids) ? (body.patient_ids as string[]).filter(id => typeof id === 'string') : []

  if (!['individual', 'selected', 'all'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }
  if (!['email', 'whatsapp'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  if (channel === 'email' && !subject) {
    return NextResponse.json({ error: 'Subject is required for email' }, { status: 400 })
  }
  if (mode !== 'all' && patientIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one patient' }, { status: 400 })
  }

  // Resolve recipients. Always scoped to this dentist; opted-out
  // patients are silently filtered. For email we also drop rows
  // without an email; for whatsapp, rows without a phone.
  let query = supabase
    .from('patients')
    .select('id, name, phone, email, opt_out_communications')
    .eq('dentist_id', dentist.id)
    .or('opt_out_communications.is.null,opt_out_communications.eq.false')

  if (mode !== 'all') {
    query = query.in('id', patientIds)
  }

  const { data: patientsRaw, error: pErr } = await query
  if (pErr) {
    console.error('[communications/send] patient fetch failed', pErr)
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }
  const patients = (patientsRaw ?? []) as Patient[]

  // Channel-specific filtering after the opt-out gate.
  const reachable = channel === 'email'
    ? patients.filter(p => !!(p.email && p.email.includes('@')))
    : patients.filter(p => !!waNumber(p.phone))

  if (reachable.length === 0) {
    return NextResponse.json({
      sent: 0, failed: 0, total: 0,
      error: channel === 'email'
        ? 'None of the selected patients have an email address.'
        : 'None of the selected patients have a usable phone number.',
    }, { status: 200 })
  }

  const sharedVars = {
    clinic_name: dentist.clinic_name || 'our clinic',
    dentist_name: dentist.name || '',
    clinic_phone: dentist.phone || '',
  }

  if (channel === 'whatsapp') {
    // Build the click-list and return — the browser opens these in tabs.
    // The audit row stores the template + count; per-link delivery is
    // out of our hands until we have the Business API.
    const links = reachable.map(p => {
      const personal = personalize(message, {
        patient_name: p.name || 'there',
        ...sharedVars,
      })
      const num = waNumber(p.phone)!
      return {
        patient_id: p.id,
        patient_name: p.name || '',
        url: `https://wa.me/${num}?text=${encodeURIComponent(personal)}`,
      }
    })

    await supabase.from('communications_log').insert({
      dentist_id: dentist.id,
      channel: 'whatsapp',
      mode,
      subject: null,
      message,
      recipients_count: links.length,
      failed_count: 0,
      status: 'queued',
    })

    return NextResponse.json({
      sent: links.length, failed: 0, total: links.length,
      whatsapp_links: links,
    })
  }

  // Email path — throttled batches of 10 with a 1s gap. Each batch
  // is dispatched in parallel; the gap is between batches, not
  // between individual sends within a batch. Resend's per-second
  // throughput on the transactional API comfortably handles 10 in
  // flight, so this gives us a steady ~10/s without overrunning.
  let sent = 0
  let failed = 0
  for (let i = 0; i < reachable.length; i += EMAIL_BATCH_SIZE) {
    const batch = reachable.slice(i, i + EMAIL_BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(p => sendPatientMessage({
        to_email: p.email!,
        subject,
        message: personalize(message, {
          patient_name: p.name || 'there',
          ...sharedVars,
        }),
        clinic_name: sharedVars.clinic_name,
        dentist_name: sharedVars.dentist_name,
        clinic_phone: sharedVars.clinic_phone,
        city: dentist.city ?? undefined,
      })),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') sent++
      else {
        failed++
        console.error('[communications/send] email send rejected', r.reason)
      }
    }
    // Spacer between batches; skipped after the last batch.
    if (i + EMAIL_BATCH_SIZE < reachable.length) await sleep(EMAIL_BATCH_DELAY_MS)
  }

  await supabase.from('communications_log').insert({
    dentist_id: dentist.id,
    channel: 'email',
    mode,
    subject,
    message,
    recipients_count: sent,
    failed_count: failed,
    status: failed === 0 ? 'sent' : failed === reachable.length ? 'failed' : 'partial',
  })

  return NextResponse.json({ sent, failed, total: reachable.length })
}
