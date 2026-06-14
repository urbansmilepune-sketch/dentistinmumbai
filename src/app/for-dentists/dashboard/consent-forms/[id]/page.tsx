'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import jsPDF from 'jspdf'

interface ConsentForm {
  id: string
  form_type: string
  form_title: string | null
  form_text: string | null
  patient_name: string | null
  patient_phone: string | null
  status: string | null
  sent_at: string | null
  signed_at: string | null
  signed_by: string | null
  signature_method: string | null
  notes: string | null
  created_at: string
  appointment_id: string | null
}

const STATUS_META: Record<string, { label: string; bg: string; text: string; emoji: string }> = {
  pending: { label: 'Pending',  bg: '#FEF3C7', text: '#92400E', emoji: '⏳' },
  sent:    { label: 'Sent',     bg: '#DBEAFE', text: '#1D4ED8', emoji: '📤' },
  signed:  { label: 'Signed',   bg: '#DCFCE7', text: '#166534', emoji: '✅' },
  expired: { label: 'Expired',  bg: '#E5E7EB', text: '#374151', emoji: '❌' },
}

export default function ConsentFormDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<ConsentForm | null>(null)
  const [dentistMeta, setDentistMeta] = useState<any>(null)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const dentist = await resolveCurrentDentist<{
        id: string; name: string | null; clinic_name: string | null; phone: string | null; whatsapp: string | null
      }>(supabase, 'id, name, clinic_name, phone, whatsapp')
      if (!dentist) { router.push('/for-dentists/login'); return }
      setDentistMeta(dentist)

      const { data, error: fetchErr } = await supabase
        .from('consent_forms')
        .select('id, form_type, form_title, form_text, patient_name, patient_phone, status, sent_at, signed_at, signed_by, signature_method, notes, created_at, appointment_id')
        .eq('id', id)
        .eq('dentist_id', dentist.id)
        .maybeSingle()

      if (fetchErr || !data) {
        setError(fetchErr?.message || 'Consent form not found.')
        setLoading(false)
        return
      }
      setForm(data as ConsentForm)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function markAsSigned() {
    if (!form) return
    setMarking(true)
    setError(null)
    const supabase = createClient()
    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('consent_forms')
      .update({ status: 'signed', signed_at: now, signature_method: 'manual' })
      .eq('id', form.id)
    setMarking(false)
    if (updateErr) { setError(updateErr.message); return }
    setForm(prev => prev ? { ...prev, status: 'signed', signed_at: now, signature_method: 'manual' } : prev)
  }

  function downloadPdf() {
    if (!form) return
    const d = dentistMeta
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const PAGE_W = doc.internal.pageSize.getWidth()
    const PAGE_H = doc.internal.pageSize.getHeight()
    const MARGIN = 48
    const MAX_W = PAGE_W - MARGIN * 2
    let y = MARGIN

    // Clinic header
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0, 87, 168)
    doc.text(d?.clinic_name || d?.name || 'Clinic', MARGIN, y); y += 20
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(80, 80, 80)
    const subParts = [d?.name, d?.phone || d?.whatsapp].filter(Boolean).join(' · ')
    if (subParts) { doc.text(subParts, MARGIN, y); y += 14 }
    doc.setDrawColor(220, 220, 220); doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 20

    // Title
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 25, 35)
    const titleLines = doc.splitTextToSize(form.form_title || form.form_type, MAX_W) as string[]
    titleLines.forEach(l => { doc.text(l, MARGIN, y); y += 18 }); y += 4

    // Patient block
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(100, 116, 139)
    doc.text('PATIENT', MARGIN, y); y += 14
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 41, 59)
    const patLine = [form.patient_name, form.patient_phone ? `Phone: ${form.patient_phone}` : null].filter(Boolean).join('  ·  ')
    doc.text(patLine, MARGIN, y); y += 20

    // Content
    if (form.form_text) {
      const contentLines = doc.splitTextToSize(form.form_text, MAX_W) as string[]
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 50, 50)
      for (const line of contentLines) {
        if (y > PAGE_H - 100) { doc.addPage(); y = MARGIN }
        doc.text(line, MARGIN, y); y += 14
      }
      y += 10
    }

    // Status block
    if (y > PAGE_H - 120) { doc.addPage(); y = MARGIN }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(100, 116, 139)
    doc.text('STATUS', MARGIN, y); y += 14
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 41, 59)
    doc.text((form.status || 'pending').toUpperCase(), MARGIN, y); y += 14
    if (form.signed_at) {
      const sd = new Date(form.signed_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })
      doc.setTextColor(80, 80, 80); doc.setFontSize(10)
      doc.text(`Signed on ${sd}`, MARGIN, y); y += 14
    }

    // Footer
    const pageCount = (doc as any).getNumberOfPages?.() ?? 1
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150)
      doc.text(`Consent Form ID: ${form.id.slice(0, 8).toUpperCase()}`, PAGE_W / 2, PAGE_H - MARGIN / 2, { align: 'center' })
    }

    const safeName = (form.patient_name || 'patient').replace(/\s+/g, '-').toLowerCase()
    doc.save(`consent-${form.form_type}-${safeName}.pdf`)
  }

  function buildResendWaText() {
    if (!form || !dentistMeta) return ''
    const d = dentistMeta
    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    return [
      `*CONSENT FORM — ${form.form_title || form.form_type}*`,
      `_${d.clinic_name || 'Dental Clinic'}_`,
      '',
      `Patient: *${form.patient_name}*`,
      `Date: ${dateStr}`,
      '',
      form.form_text || '',
      '',
      `By replying *"I CONSENT"* to this message, you (${form.patient_name}) confirm you have read and understood the above and give your informed consent.`,
      '',
      `— Dr. ${d.name || 'Your Dentist'}`,
    ].join('\n').trim()
  }

  function handleResendWhatsApp() {
    if (!form?.patient_phone) return
    const digits = form.patient_phone.replace(/\D/g, '')
    const waNum = digits.length === 10 ? `91${digits}` : digits
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(buildResendWaText())}`, '_blank')
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading…</p>
    </div>
  }

  if (error || !form) {
    return (
      <div style={{ maxWidth: 600 }}>
        <Link href="/for-dentists/dashboard/consent-forms" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← Back to Consent Forms</Link>
        <div style={{ marginTop: 24, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '16px', borderRadius: 12, fontSize: 14 }}>
          {error || 'Consent form not found.'}
        </div>
      </div>
    )
  }

  const sm = STATUS_META[form.status || 'pending'] || STATUS_META.pending
  const createdDate = new Date(form.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const signedDate = form.signed_at ? new Date(form.signed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null
  const sentDate = form.sent_at ? new Date(form.sent_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link href="/for-dentists/dashboard/consent-forms" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← Consent Forms</Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--text)' }}>{form.form_title || form.form_type}</span>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Header card */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 6 }}>
              {form.form_title || form.form_type}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: sm.bg, color: sm.text }}>
                {sm.emoji} {sm.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Created {createdDate}</span>
            </div>
          </div>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {form.status !== 'signed' && (
              <button onClick={markAsSigned} disabled={marking}
                style={{ padding: '10px 18px', minHeight: 42, background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: marking ? 'not-allowed' : 'pointer', opacity: marking ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
                {marking ? '…' : '✓ Mark as Signed'}
              </button>
            )}
            {form.patient_phone && (
              <button onClick={handleResendWhatsApp}
                style={{ padding: '10px 18px', minHeight: 42, background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                💬 Resend WhatsApp
              </button>
            )}
            <button onClick={downloadPdf}
              style={{ padding: '10px 18px', minHeight: 42, background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              ⬇ Download PDF
            </button>
          </div>
        </div>

        {/* Patient + date metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>PATIENT</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{form.patient_name || '—'}</div>
            {form.patient_phone && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{form.patient_phone}</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>FORM TYPE</div>
            <div style={{ fontSize: 14 }}>{form.form_type}</div>
          </div>
          {sentDate && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>SENT</div>
              <div style={{ fontSize: 14 }}>{sentDate}</div>
            </div>
          )}
          {signedDate && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>SIGNED</div>
              <div style={{ fontSize: 14, color: '#166534', fontWeight: 700 }}>{signedDate}</div>
              {form.signature_method && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{form.signature_method}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Form content */}
      {form.form_text ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--muted)' }}>
            CONSENT FORM CONTENT
          </h2>
          <pre style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {form.form_text}
          </pre>
          {form.notes && (
            <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>NOTES</div>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{form.notes}</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No text content — this form was created with the in-person signature workflow.</p>
          <Link href={`/for-dentists/dashboard/patients/${form.appointment_id || ''}`}
            style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>
            View on patient page →
          </Link>
        </div>
      )}
    </div>
  )
}
