'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type EventType = 'appointment' | 'visit' | 'prescription' | 'emr' | 'invoice' | 'consent' | 'xray'

interface TimelineEvent {
  id: string
  type: EventType
  /** ISO datetime used for sorting */
  iso: string
  title: string
  summary: string
  data: any
}

const TYPE_META: Record<EventType, { icon: string; label: string; color: string; bg: string; border: string }> = {
  visit:        { icon: '📋', label: 'Visit Note',   color: '#1D4ED8', bg: '#DBEAFE', border: '#BFDBFE' },
  prescription: { icon: '💊', label: 'Prescription', color: '#5B21B6', bg: '#EDE9FE', border: '#DDD6FE' },
  emr:          { icon: '🦷', label: 'EMR',          color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  invoice:      { icon: '💰', label: 'Invoice',      color: '#166534', bg: '#DCFCE7', border: '#BBF7D0' },
  appointment:  { icon: '📅', label: 'Appointment',  color: '#C2410C', bg: '#FFEDD5', border: '#FED7AA' },
  consent:      { icon: '📝', label: 'Consent',      color: '#374151', bg: '#F3F4F6', border: '#E5E7EB' },
  xray:         { icon: '🩻', label: 'X-Ray',        color: '#0E7490', bg: '#CFFAFE', border: '#A5F3FC' },
}

function isoFrom(date: string | null | undefined, time?: string | null): string {
  if (!date) return new Date().toISOString()
  if (time) return `${date}T${time.length === 5 ? `${time}:00` : time}`
  return `${date}T00:00:00`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function TimelinePage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [patientName, setPatientName] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) { router.push('/for-dentists/login'); return }

      const { data: patient } = await supabase
        .from('patients').select('id, name, phone')
        .eq('id', patientId).eq('dentist_id', dentist.id).single()
      if (!patient) { router.push('/for-dentists/dashboard/patients'); return }
      setPatientName(patient.name)

      // Appointments are keyed by phone, not patient_id — pull them by the
      // patient's phone scoped to this dentist.
      const [
        { data: visits },
        { data: prescriptions },
        { data: emrs },
        { data: invoices },
        { data: appointments },
        { data: consents },
        { data: xrays },
      ] = await Promise.all([
        supabase.from('visits').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id),
        supabase.from('prescriptions').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id),
        supabase.from('emr_records').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id),
        supabase.from('invoices').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id),
        patient.phone
          ? supabase.from('appointments').select('*, treatments(name)').eq('patient_phone', patient.phone).eq('dentist_id', dentist.id)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('consent_forms').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id),
        // Patient image vault — both x-rays and clinical photos. The
        // legacy xray_images table was merged into patient_images by
        // 20260521170000_patient_images.sql.
        supabase.from('patient_images').select('*').eq('patient_id', patientId).eq('dentist_id', dentist.id),
      ])

      const merged: TimelineEvent[] = []

      ;(visits ?? []).forEach((v: any) => merged.push({
        id: `visit:${v.id}`, type: 'visit',
        iso: isoFrom(v.visit_date),
        title: 'Visit note',
        summary: [v.chief_complaint, v.treatment_done].filter(Boolean).join(' · ') || 'Visit recorded',
        data: v,
      }))

      ;(prescriptions ?? []).forEach((p: any) => {
        const medCount = Array.isArray(p.medicines) ? p.medicines.length : 0
        merged.push({
          id: `rx:${p.id}`, type: 'prescription',
          iso: p.created_at,
          title: p.template_used || 'Prescription',
          summary: `${medCount} medication${medCount !== 1 ? 's' : ''} prescribed`,
          data: p,
        })
      })

      ;(emrs ?? []).forEach((e: any) => {
        const procCount = Array.isArray(e.procedures) ? e.procedures.length : 0
        const medCount = Array.isArray(e.medications) ? e.medications.length : 0
        merged.push({
          id: `emr:${e.id}`, type: 'emr',
          iso: e.created_at,
          title: e.template_used ? `EMR — ${e.template_used}` : 'EMR record',
          summary: [
            procCount > 0 ? `${procCount} procedure${procCount !== 1 ? 's' : ''}` : null,
            medCount > 0 ? `${medCount} medication${medCount !== 1 ? 's' : ''}` : null,
            e.diagnosis ? 'diagnosis recorded' : null,
          ].filter(Boolean).join(' · ') || 'Encounter recorded',
          data: e,
        })
      })

      ;(invoices ?? []).forEach((i: any) => merged.push({
        id: `inv:${i.id}`, type: 'invoice',
        iso: isoFrom(i.invoice_date),
        title: `Invoice ${i.invoice_no}`,
        summary: `₹${Number(i.total || 0).toLocaleString('en-IN')} · ${i.payment_status}`,
        data: i,
      }))

      ;(appointments ?? []).forEach((a: any) => merged.push({
        id: `appt:${a.id}`, type: 'appointment',
        iso: isoFrom(a.appt_date, a.time_slot),
        title: a.treatments?.name || 'Appointment',
        summary: `${a.time_slot ?? ''} · ${a.status}`,
        data: a,
      }))

      ;(consents ?? []).forEach((c: any) => merged.push({
        id: `consent:${c.id}`, type: 'consent',
        iso: c.signed_at || c.created_at,
        title: `Consent — ${c.form_type}`,
        summary: c.patient_signature ? 'Signed' : 'Unsigned',
        data: c,
      }))

      ;(xrays ?? []).forEach((x: any) => merged.push({
        id: `xray:${x.id}`, type: 'xray',
        // patient_images.taken_date supersedes the legacy taken_at column.
        iso: isoFrom(x.taken_date || x.created_at),
        title: `${(x.image_type || 'image').toUpperCase()}${x.tooth_numbers ? ` · Tooth ${x.tooth_numbers}` : ''}`,
        summary: x.notes || 'Image uploaded',
        data: x,
      }))

      // Newest first
      merged.sort((a, b) => b.iso.localeCompare(a.iso))
      setEvents(merged)
      setLoading(false)
    }
    load()
  }, [patientId, router])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const counts = useMemo(() => {
    const c: Record<EventType, number> = { appointment: 0, visit: 0, prescription: 0, emr: 0, invoice: 0, consent: 0, xray: 0 }
    for (const e of events) c[e.type]++
    return c
  }, [events])

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading timeline…</p>
    </div>
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href={`/for-dentists/dashboard/patients/${patientId}`}
          style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← {patientName}</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>Treatment History</h1>
      </div>

      {/* Type counts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {(Object.keys(TYPE_META) as EventType[]).map(t => {
          const meta = TYPE_META[t]
          return (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontSize: 12, fontWeight: 600 }}>
              {meta.icon} {meta.label} <span style={{ opacity: 0.7 }}>· {counts[t]}</span>
            </span>
          )
        })}
      </div>

      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗂️</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Nothing on the timeline yet</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Visits, prescriptions, EMRs, invoices, appointments, consent forms, and X-rays will show up here as they're recorded.</p>
        </div>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
          {/* Vertical rail */}
          <div aria-hidden="true" style={{ position: 'absolute', top: 14, bottom: 14, left: 18, width: 2, background: 'var(--border)' }} />
          {events.map(ev => {
            const meta = TYPE_META[ev.type]
            const open = expanded.has(ev.id)
            return (
              <li key={ev.id} style={{ position: 'relative', paddingLeft: 48, marginBottom: 12 }}>
                {/* Bullet */}
                <div style={{ position: 'absolute', left: 0, top: 4, width: 38, height: 38, borderRadius: 12, background: meta.bg, border: `2px solid ${meta.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, zIndex: 1 }}>
                  {meta.icon}
                </div>
                <button onClick={() => toggle(ev.id)} aria-expanded={open}
                  style={{ width: '100%', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>{ev.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{meta.label}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(ev.iso)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{ev.summary}</div>
                </button>
                {open && (
                  <div style={{ marginTop: 8, background: 'var(--bg)', border: `1px solid ${meta.border}`, borderLeft: `3px solid ${meta.color}`, borderRadius: 10, padding: '14px 16px' }}>
                    <EventDetails type={ev.type} data={ev.data} iso={ev.iso} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function EventDetails({ type, data, iso }: { type: EventType; data: any; iso: string }) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => value === null || value === undefined || value === '' ? null : (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 6, lineHeight: 1.6 }}>
      <span style={{ color: 'var(--muted)', minWidth: 110 }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )

  if (type === 'visit') {
    return (
      <div>
        <Row label="Date" value={fmtDate(iso)} />
        <Row label="Chief complaint" value={data.chief_complaint} />
        <Row label="Findings" value={data.clinical_findings} />
        <Row label="Treatment done" value={data.treatment_done} />
        {Array.isArray(data.materials_used) && data.materials_used.length > 0 && (
          <Row label="Materials" value={data.materials_used.join(', ')} />
        )}
        <Row label="Next visit" value={data.next_appointment_recommended ? `${fmtDate(isoFrom(data.next_appointment_recommended))}${data.next_appointment_notes ? ' — ' + data.next_appointment_notes : ''}` : null} />
      </div>
    )
  }
  if (type === 'prescription') {
    const meds = Array.isArray(data.medicines) ? data.medicines : []
    return (
      <div>
        <Row label="Template" value={data.template_used} />
        <Row label="Instructions" value={data.instructions} />
        {meds.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead><tr style={{ background: '#fff' }}>
              {['Medicine', 'Dosage', 'Duration', 'Instructions'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{meds.map((m: any, i: number) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px', fontSize: 13, fontWeight: 500 }}>{m.name}</td>
                <td style={{ padding: '6px 10px', fontSize: 13 }}>{m.dosage}</td>
                <td style={{ padding: '6px 10px', fontSize: 13 }}>{m.duration}</td>
                <td style={{ padding: '6px 10px', fontSize: 13, color: 'var(--muted)' }}>{m.instructions}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    )
  }
  if (type === 'emr') {
    const procs = Array.isArray(data.procedures) ? data.procedures : []
    const meds = Array.isArray(data.medications) ? data.medications : []
    const complaints = Array.isArray(data.chief_complaints) ? data.chief_complaints : []
    const v = data.vitals || {}
    return (
      <div>
        <Row label="Template" value={data.template_used} />
        {complaints.length > 0 && <Row label="Complaints" value={complaints.join(', ')} />}
        {(v.bp || v.pulse || v.spo2) && (
          <Row label="Vitals" value={[v.bp ? `BP ${v.bp}` : null, v.pulse ? `Pulse ${v.pulse}` : null, v.spo2 ? `SpO₂ ${v.spo2}%` : null].filter(Boolean).join(' · ')} />
        )}
        <Row label="Diagnosis" value={data.diagnosis} />
        <Row label="Advice" value={data.advice} />
        <Row label="Follow-up" value={data.follow_up_date ? `${fmtDate(isoFrom(data.follow_up_date))}${data.follow_up_notes ? ' — ' + data.follow_up_notes : ''}` : null} />
        {procs.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Procedures</div>
            {procs.map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>
                {p.name}{p.tooth_number ? ` (Tooth ${p.tooth_number})` : ''}{p.price ? ` — ₹${Number(p.price).toLocaleString('en-IN')}` : ''}
              </div>
            ))}
          </div>
        )}
        {meds.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Medications</div>
            {meds.map((m: any, i: number) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>
                {m.name} · {m.dosage} · {m.frequency} · {m.duration}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (type === 'invoice') {
    const items = Array.isArray(data.items) ? data.items : []
    return (
      <div>
        <Row label="Invoice" value={data.invoice_no} />
        <Row label="Date" value={fmtDate(iso)} />
        <Row label="Status" value={data.payment_status} />
        <Row label="Subtotal" value={`₹${Number(data.subtotal || 0).toLocaleString('en-IN')}`} />
        {Number(data.discount) > 0 && <Row label="Discount" value={`-₹${Number(data.discount).toLocaleString('en-IN')}`} />}
        <Row label="Total" value={<strong>₹{Number(data.total || 0).toLocaleString('en-IN')}</strong>} />
        {items.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Items</div>
            {items.map((it: any, i: number) => (
              <div key={i} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', padding: '4px 0' }}>
                <span>{it.description}</span>
                <span>₹{Number(it.amount || 0).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (type === 'appointment') {
    return (
      <div>
        <Row label="Reference" value={data.reference_no} />
        <Row label="When" value={`${fmtDate(iso)}${data.time_slot ? ' · ' + data.time_slot : ''}`} />
        <Row label="Status" value={data.status} />
        <Row label="Treatment" value={data.treatments?.name} />
        <Row label="Notes" value={data.notes} />
      </div>
    )
  }
  if (type === 'consent') {
    const content = data.form_content || {}
    return (
      <div>
        <Row label="Form" value={content.title || data.form_type} />
        <Row label="Signed" value={data.signed_at ? fmtDateTime(data.signed_at) : 'Unsigned'} />
        {data.patient_signature && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Signature</div>
            <img src={data.patient_signature} alt="Signature" style={{ height: 80, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
          </div>
        )}
      </div>
    )
  }
  if (type === 'xray') {
    // patient_images replaces the legacy xray_images shape — read the new
    // column names (image_url, tooth_numbers) with a fallback to the old
    // ones in case the row pre-dates the rename.
    const url = data.image_url || data.url
    return (
      <div>
        <Row label="Type" value={data.image_type} />
        <Row label="Tooth" value={data.tooth_numbers || data.tooth_number} />
        <Row label="Date" value={fmtDate(iso)} />
        {data.notes && <Row label="Notes" value={data.notes} />}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 8 }}>
            <img src={url} alt="Patient image" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, border: '1px solid var(--border)' }} />
          </a>
        )}
      </div>
    )
  }
  return null
}
