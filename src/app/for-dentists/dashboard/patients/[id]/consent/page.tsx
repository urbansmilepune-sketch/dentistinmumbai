'use client'

import { useEffect, useRef, useState } from 'react'
import { jsPDF } from 'jspdf' // v4: named export (see src/lib/invoicePdf.ts)
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad'
import { getCityBySlug } from '@/config/cities'

type FormType = 'implant' | 'extraction' | 'rct' | 'whitening'

interface Section { heading: string; body: string }
interface FormTemplate { title: string; sections: Section[]; declaration: string }

// Templates are illustrative starting points. Have qualified legal counsel
// review the wording before relying on these in practice.
const TEMPLATES: Record<FormType, FormTemplate> = {
  implant: {
    title: 'Informed Consent for Dental Implant Surgery',
    sections: [
      { heading: 'Procedure',
        body: 'I understand that the proposed treatment involves the surgical placement of one or more titanium dental implants in my jawbone to support a crown, bridge, or denture. The procedure may include local anaesthesia, soft-tissue incisions, drilling of the jawbone, and placement of implant fixtures. Depending on bone availability, the procedure may also involve bone grafting and/or sinus lift surgery, either before or during implant placement.' },
      { heading: 'Risks and complications',
        body: 'I have been informed that dental implant surgery carries risks including, but not limited to: post-operative pain, swelling, bruising and discomfort; infection of the surgical site; bleeding; injury to adjacent teeth, restorations, or nerves resulting in temporary or permanent numbness of the lip, chin, gums, cheek, or tongue; sinus complications when placing implants in the upper jaw; failure of the implant to integrate with the bone, requiring removal; and the possibility of additional procedures to address complications.' },
      { heading: 'Alternatives',
        body: 'I understand that alternatives to dental implants have been explained to me, including fixed dental bridges, removable partial dentures, complete dentures, and choosing not to replace the missing tooth or teeth. I have had the opportunity to ask questions about these alternatives and have chosen implant treatment.' },
      { heading: 'Costs and aftercare',
        body: 'The cost estimate has been discussed and agreed upon separately. I understand that the estimate covers planned treatment only; additional procedures arising from complications or revised clinical findings may incur further charges. I commit to following all post-operative instructions, attending all scheduled follow-up visits, and maintaining oral hygiene as advised.' },
    ],
    declaration: 'I have read and understood the information above. All my questions have been answered to my satisfaction. I voluntarily consent to the proposed implant treatment.',
  },
  extraction: {
    title: 'Informed Consent for Tooth Extraction',
    sections: [
      { heading: 'Procedure',
        body: 'I understand that the proposed treatment involves the surgical removal of one or more teeth under local anaesthesia. Depending on the position and condition of the tooth, the procedure may be a simple extraction or a surgical extraction involving incisions in the gum, removal of bone, and/or sectioning of the tooth.' },
      { heading: 'Risks and complications',
        body: 'I have been informed of the risks including, but not limited to: post-operative pain, swelling and bruising; prolonged bleeding; dry socket (alveolar osteitis); infection; damage to adjacent teeth, fillings, or crowns; fracture of the jaw (rare); injury to nerves causing temporary or permanent numbness of the lip, chin, gums, or tongue; sinus communication (for upper back teeth); and the possibility that a small piece of root may be left in place if its removal carries greater risk than benefit.' },
      { heading: 'Alternatives',
        body: 'Alternatives to extraction have been discussed including root canal treatment, periodontal treatment, crowning, or leaving the tooth in place with regular monitoring. I have chosen extraction after considering these options.' },
      { heading: 'Aftercare',
        body: 'I understand the importance of following all post-operative instructions including pressure on gauze, dietary restrictions, avoiding rinsing or spitting for 24 hours, refraining from smoking, and taking prescribed medications. I will contact the clinic immediately if I notice excessive bleeding, severe pain unrelieved by medication, swelling that worsens after 48 hours, or fever.' },
    ],
    declaration: 'I have read and understood the information above. All my questions have been answered. I voluntarily consent to the extraction of the tooth/teeth as discussed.',
  },
  rct: {
    title: 'Informed Consent for Root Canal Treatment',
    sections: [
      { heading: 'Procedure',
        body: 'I understand that root canal treatment (endodontic therapy) involves removing the infected or damaged pulp tissue from inside the tooth, cleaning and shaping the root canal system, and filling the canals with an inert material. The tooth will then typically require a crown or a permanent filling to restore strength and function. Treatment may be completed over one or more visits.' },
      { heading: 'Risks and complications',
        body: 'I have been informed of potential risks including, but not limited to: persistent or recurring infection requiring re-treatment or surgery; instrument separation within the root canal; perforation of the root or floor of the tooth; post-treatment pain, swelling or discomfort; tooth discolouration; flare-up reactions; vertical root fracture necessitating extraction; and the small possibility that the treatment may not be successful and the tooth may need to be extracted.' },
      { heading: 'Alternatives',
        body: 'Alternatives to root canal treatment have been explained including extraction of the tooth (with or without subsequent replacement by an implant, bridge, or denture), and choosing not to treat the tooth at this time. I understand that an untreated infected tooth can lead to serious infection.' },
      { heading: 'Post-treatment care',
        body: 'I understand the treated tooth will be more brittle than a healthy tooth and is at risk of fracture until restored with a crown. I agree to complete the recommended permanent restoration within the timeframe advised by my dentist and to attend any follow-up reviews.' },
    ],
    declaration: 'I have read and understood the information above. All my questions have been answered. I voluntarily consent to root canal treatment of the tooth/teeth as discussed.',
  },
  whitening: {
    title: 'Informed Consent for Teeth Whitening',
    sections: [
      { heading: 'Procedure',
        body: 'I understand that teeth whitening (bleaching) uses peroxide-based agents to lighten the colour of natural teeth. Treatment may be performed in-office, at home with custom trays, or in combination. Existing crowns, veneers, fillings, and bonded restorations will not change colour and may need to be replaced after whitening to match the new shade if they are visible.' },
      { heading: 'Risks and side effects',
        body: 'I have been informed of common side effects including: tooth sensitivity to hot/cold/sweet, typically temporary; gum irritation if the bleaching agent contacts the soft tissues; uneven whitening due to existing stains, restorations, or developmental marks; and occasional sore throat or mild nausea if any solution is swallowed. I understand the final shade is not guaranteed and varies between patients.' },
      { heading: 'Alternatives and outcomes',
        body: 'Alternatives have been discussed including veneers, bonding, or no treatment. I understand whitening is not permanent — staining habits such as tea, coffee, red wine, and tobacco will cause the shade to relapse over time, and periodic touch-ups may be required. Whitening will not lighten teeth beyond their natural maximum brightness.' },
      { heading: 'Suitability',
        body: 'I confirm I am not pregnant or breastfeeding, am not allergic to peroxide-based products, and have informed the clinic of any tooth sensitivity, gum disease, exposed roots, cracks, or untreated decay that may affect treatment.' },
    ],
    declaration: 'I have read and understood the information above. All my questions have been answered. I voluntarily consent to teeth whitening as discussed.',
  },
}

const TYPE_LABEL: Record<FormType, string> = {
  implant: 'Implant Consent',
  extraction: 'Extraction Consent',
  rct: 'RCT Consent',
  whitening: 'Whitening Consent',
}

const TYPE_ICON: Record<FormType, string> = {
  implant: '🦷', extraction: '🪥', rct: '🩺', whitening: '✨',
}

type FormRow = {
  id: string
  form_type: string
  form_content: any
  patient_signature: string | null
  signed_at: string | null
  created_at: string
}

type Patient = { id: string; name: string; phone: string | null; age: number | null; gender: string | null }
type Dentist = { id: string; name: string | null; clinic_name: string | null; phone: string | null; whatsapp: string | null; city: string | null; areas: { name: string | null } | null }

export default function ConsentFormsPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [dentist, setDentist] = useState<Dentist | null>(null)
  const [forms, setForms] = useState<FormRow[]>([])

  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeType, setActiveType] = useState<FormType | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const sigRef = useRef<SignaturePadHandle>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentistRow } = await supabase
        .from('dentists')
        .select('id, name, clinic_name, phone, whatsapp, city, areas(name)')
        .eq('email', user.email)
        .single()
      if (!dentistRow) { router.push('/for-dentists/login'); return }
      setDentist(dentistRow as unknown as Dentist)

      const [{ data: p }, { data: fl }] = await Promise.all([
        supabase.from('patients').select('id, name, phone, age, gender')
          .eq('id', patientId).eq('dentist_id', dentistRow.id).single(),
        supabase.from('consent_forms').select('id, form_type, form_content, patient_signature, signed_at, created_at')
          .eq('patient_id', patientId).eq('dentist_id', dentistRow.id)
          .order('created_at', { ascending: false }),
      ])
      if (!p) { router.push('/for-dentists/dashboard/patients'); return }
      setPatient(p as Patient)
      setForms(((fl ?? []) as unknown) as FormRow[])
      setLoading(false)
    }
    load()
  }, [patientId, router])

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    function onDoc(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pickerOpen])

  function startForm(type: FormType) {
    setPickerOpen(false)
    setActiveType(type)
    setHasSignature(false)
    setError(null)
  }
  function cancelForm() {
    setActiveType(null)
    setHasSignature(false)
    setError(null)
  }

  async function saveAndDownload() {
    if (!activeType || !patient || !dentist) return
    const signature = sigRef.current?.toDataURL()
    if (!signature) { setError('Patient signature is required.'); return }
    setSaving(true)
    setError(null)

    const template = TEMPLATES[activeType]
    const signedAt = new Date().toISOString()
    const formContent = {
      title: template.title,
      sections: template.sections,
      declaration: template.declaration,
      patient_name_at_signing: patient.name,
    }

    const supabase = createClient()
    const { data, error: insertErr } = await supabase
      .from('consent_forms')
      .insert({
        dentist_id: dentist.id,
        patient_id: patient.id,
        form_type: activeType,
        form_content: formContent,
        patient_signature: signature,
        signed_at: signedAt,
      })
      .select('id, form_type, form_content, patient_signature, signed_at, created_at')
      .single()

    if (insertErr || !data) {
      setSaving(false)
      setError(insertErr?.message || 'Could not save consent form.')
      return
    }

    setForms(prev => [data as unknown as FormRow, ...prev])
    downloadPdf({ form: data as unknown as FormRow, template, signature, signedAt })
    setSaving(false)
    cancelForm()
  }

  function downloadPdf({ form, template, signature, signedAt }: {
    form: FormRow
    template: FormTemplate
    signature: string
    signedAt: string
  }) {
    if (!patient || !dentist) return
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const PAGE_W = doc.internal.pageSize.getWidth()
    const PAGE_H = doc.internal.pageSize.getHeight()
    const MARGIN = 48
    const MAX_W = PAGE_W - MARGIN * 2

    let cursorY = MARGIN

    // Clinic header
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0, 87, 168)
    doc.text(dentist.clinic_name || dentist.name || 'Clinic', MARGIN, cursorY)
    cursorY += 18
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(80, 80, 80)
    const subParts: string[] = []
    if (dentist.name && dentist.clinic_name) subParts.push(dentist.name)
    if (dentist.areas?.name) subParts.push(`${dentist.areas.name}, ${getCityBySlug(dentist.city).cityName}`)
    if (dentist.phone || dentist.whatsapp) subParts.push(`Phone: ${dentist.phone || dentist.whatsapp}`)
    doc.text(subParts.join(' · '), MARGIN, cursorY)
    cursorY += 16

    doc.setDrawColor(220, 220, 220); doc.line(MARGIN, cursorY, PAGE_W - MARGIN, cursorY)
    cursorY += 22

    // Title
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 25, 35)
    const titleLines = doc.splitTextToSize(template.title, MAX_W) as string[]
    titleLines.forEach(line => { doc.text(line, MARGIN, cursorY); cursorY += 18 })
    cursorY += 6

    // Patient block
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(100, 116, 139)
    doc.text('PATIENT', MARGIN, cursorY); cursorY += 14
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 41, 59)
    const patientLine = [patient.name, patient.age ? `${patient.age} yrs` : null, patient.gender, patient.phone ? `Phone: ${patient.phone}` : null].filter(Boolean).join('  ·  ')
    doc.text(patientLine, MARGIN, cursorY); cursorY += 20

    // Sections
    for (const section of template.sections) {
      if (cursorY > PAGE_H - 180) { doc.addPage(); cursorY = MARGIN }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 87, 168)
      doc.text(section.heading, MARGIN, cursorY); cursorY += 14
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 50, 50)
      const bodyLines = doc.splitTextToSize(section.body, MAX_W) as string[]
      for (const line of bodyLines) {
        if (cursorY > PAGE_H - 90) { doc.addPage(); cursorY = MARGIN }
        doc.text(line, MARGIN, cursorY); cursorY += 14
      }
      cursorY += 8
    }

    // Declaration
    if (cursorY > PAGE_H - 180) { doc.addPage(); cursorY = MARGIN }
    doc.setFillColor(245, 247, 252); doc.rect(MARGIN, cursorY - 12, MAX_W, 4, 'F')
    cursorY += 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 25, 35)
    doc.text('Patient declaration', MARGIN, cursorY); cursorY += 14
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 50, 50)
    const declLines = doc.splitTextToSize(template.declaration, MAX_W) as string[]
    declLines.forEach(line => { doc.text(line, MARGIN, cursorY); cursorY += 14 })
    cursorY += 14

    // Signature block — guarantee enough room on the page
    if (cursorY > PAGE_H - 180) { doc.addPage(); cursorY = MARGIN }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(100, 116, 139)
    doc.text('SIGNED BY PATIENT', MARGIN, cursorY); cursorY += 16
    try {
      // jspdf supports data URLs directly; draw at a comfortable fixed size.
      doc.addImage(signature, 'PNG', MARGIN, cursorY, 220, 80)
    } catch (err) {
      console.error('Failed to embed signature image', err)
    }
    cursorY += 92
    doc.setDrawColor(180, 180, 180); doc.line(MARGIN, cursorY, MARGIN + 220, cursorY)
    cursorY += 14
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text(patient.name, MARGIN, cursorY); cursorY += 14
    doc.setTextColor(100, 116, 139)
    const formattedDate = new Date(signedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })
    doc.text(`Signed on ${formattedDate}`, MARGIN, cursorY)

    // Footer (every page)
    const pageCount = (doc as any).getNumberOfPages?.() ?? 1
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150)
      doc.text(`Powered by ${getCityBySlug(dentist.city).domain} · Form ID: ${form.id.slice(0, 8)}`, PAGE_W / 2, PAGE_H - MARGIN / 2, { align: 'center' })
    }

    doc.save(`consent-${activeType}-${patient.name.replace(/\s+/g, '-').toLowerCase()}.pdf`)
  }

  function downloadExisting(form: FormRow) {
    const type = form.form_type as FormType
    const template = (TEMPLATES[type] as FormTemplate | undefined) ?? {
      title: form.form_content?.title ?? 'Consent Form',
      sections: form.form_content?.sections ?? [],
      declaration: form.form_content?.declaration ?? '',
    }
    if (!form.patient_signature || !form.signed_at) return
    downloadPdf({ form, template, signature: form.patient_signature, signedAt: form.signed_at })
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading consent forms…</p>
    </div>
  }
  if (!patient) return null

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href={`/for-dentists/dashboard/patients/${patientId}`}
          style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← {patient.name}</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>Consent Forms</h1>
      </div>

      {/* Active form OR list+picker */}
      {activeType ? (
        <ActiveForm
          type={activeType}
          template={TEMPLATES[activeType]}
          sigRef={sigRef}
          hasSignature={hasSignature}
          onSignatureChange={setHasSignature}
          onCancel={cancelForm}
          onSave={saveAndDownload}
          saving={saving}
          error={error}
        />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, position: 'relative' }} ref={pickerRef}>
            <button onClick={() => setPickerOpen(v => !v)}
              style={{ padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              + New Consent Form ▾
            </button>
            {pickerOpen && (
              <div role="menu"
                style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 240, zIndex: 50 }}>
                {(Object.keys(TYPE_LABEL) as FormType[]).map(t => (
                  <button key={t} onClick={() => startForm(t)} role="menuitem"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', minHeight: 48, background: 'none', border: 'none', borderRadius: 8, textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 18 }}>{TYPE_ICON[t]}</span>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {forms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No consent forms yet</h3>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Pick a procedure above to start a new signed consent form.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {forms.map(f => {
                const label = TYPE_LABEL[f.form_type as FormType] || f.form_type
                const icon = TYPE_ICON[f.form_type as FormType] || '📝'
                const date = f.signed_at ? new Date(f.signed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
                return (
                  <div key={f.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{icon}</div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{label}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Signed on {date}</div>
                    </div>
                    <button onClick={() => downloadExisting(f)}
                      style={{ padding: '8px 14px', minHeight: 40, background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      ⬇ Download PDF
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ActiveForm({
  type, template, sigRef, hasSignature, onSignatureChange, onCancel, onSave, saving, error,
}: {
  type: FormType
  template: FormTemplate
  sigRef: React.RefObject<SignaturePadHandle | null>
  hasSignature: boolean
  onSignatureChange: (v: boolean) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  error: string | null
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 22 }}>{TYPE_ICON[type]}</span>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{template.title}</h2>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
        Read each section with the patient before they sign. Template content — review with your legal advisor before relying on it.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
        {template.sections.map(s => (
          <div key={s.heading}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--blue)', marginBottom: 4 }}>{s.heading}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{s.body}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.6 }}>
          {template.declaration}
        </p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Patient signature</label>
        <SignaturePad ref={sigRef} onChange={onSignatureChange} />
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '11px 20px', minHeight: 44, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving || !hasSignature}
          style={{ padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: (saving || !hasSignature) ? 'not-allowed' : 'pointer', opacity: (saving || !hasSignature) ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
          {saving ? 'Saving…' : '✓ Save & Download PDF'}
        </button>
      </div>
    </div>
  )
}
