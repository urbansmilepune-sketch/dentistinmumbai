'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'

type TabKey = 'send' | 'all'
type StatusFilter = 'all' | 'pending' | 'sent' | 'signed'

type Lang = 'en' | 'mr' | 'both'

interface Template {
  id: string
  form_type: string
  form_title: string
  form_content: string
  is_system: boolean
  is_active?: boolean
  language?: Lang | null
  template_group?: string | null
}

interface PatientOpt {
  id: string
  name: string | null
  phone: string | null
}

interface ConsentRow {
  id: string
  form_type: string
  form_title: string | null
  patient_name: string | null
  patient_phone: string | null
  status: string | null
  sent_at: string | null
  signed_at: string | null
  created_at: string
}

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending',    bg: '#FEF3C7', text: '#92400E' },
  sent:    { label: 'Sent',       bg: '#DBEAFE', text: '#1D4ED8' },
  signed:  { label: 'Signed',     bg: '#DCFCE7', text: '#166534' },
  expired: { label: 'Expired',    bg: '#E5E7EB', text: '#374151' },
}

const TYPE_LABEL: Record<string, string> = {
  extraction:   'Tooth Extraction',
  rct:          'Root Canal (RCT)',
  implant:      'Dental Implant',
  orthodontic:  'Orthodontic',
  surgery:      'Oral Surgery',
  anaesthesia:  'Local Anaesthesia',
}

function typeLabel(t: string) {
  return TYPE_LABEL[t] || t.charAt(0).toUpperCase() + t.slice(1)
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px', minHeight: 48,
  borderRadius: 8, border: '1.5px solid var(--border)',
  fontSize: 14, fontFamily: 'var(--font-body)',
  outline: 'none', boxSizing: 'border-box', background: '#fff',
}

const primaryBtn: React.CSSProperties = {
  padding: '11px 22px', minHeight: 44,
  background: 'var(--blue)', color: '#fff',
  border: 'none', borderRadius: 10,
  fontWeight: 700, fontSize: 14, cursor: 'pointer',
  fontFamily: 'var(--font-body)',
}

export default function ConsentFormsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabKey>(
    (searchParams.get('tab') as TabKey) || 'send'
  )
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [dentistMeta, setDentistMeta] = useState<any>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [forms, setForms] = useState<ConsentRow[]>([])

  // Send tab state
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<PatientOpt[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientOpt | null>(null)
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [selectedType, setSelectedType] = useState('')
  // The dropdown is keyed by a "group key": `grp:<template_group>` for system
  // templates (so the en + mr versions collapse into one entry) and
  // `cst:<id>` for the dentist's own custom templates.
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState<Lang>('en')
  const [formContent, setFormContent] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  // All tab state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const dentist = await resolveCurrentDentist<{
        id: string; name: string | null; clinic_name: string | null
        phone: string | null; whatsapp: string | null
      }>(supabase, 'id, name, clinic_name, phone, whatsapp')
      if (!dentist) { router.push('/for-dentists/login'); return }
      setDentistId(dentist.id)
      setDentistMeta(dentist)

      const [{ data: tpls }, { data: cf }] = await Promise.all([
        supabase.from('consent_templates')
          .select('id, form_type, form_title, form_content, is_system, is_active, language, template_group')
          .order('is_system', { ascending: false })
          .order('form_title'),
        supabase.from('consent_forms')
          .select('id, form_type, form_title, patient_name, patient_phone, status, sent_at, signed_at, created_at')
          .eq('dentist_id', dentist.id)
          .not('form_text', 'is', null)
          .order('created_at', { ascending: false }),
      ])
      setTemplates((tpls ?? []) as Template[])
      setForms((cf ?? []) as ConsentRow[])
      setLoading(false)
    }
    load()
  }, [router])

  const searchPatients = useCallback(async (q: string) => {
    if (!q.trim() || !dentistId) { setPatientResults([]); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('patients')
      .select('id, name, phone')
      .eq('dentist_id', dentistId)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(6)
    setPatientResults((data ?? []) as PatientOpt[])
  }, [dentistId])

  useEffect(() => {
    const t = setTimeout(() => searchPatients(patientQuery), 250)
    return () => clearTimeout(t)
  }, [patientQuery, searchPatients])

  // Templates that belong to the selected dropdown entry. For a system group
  // that's the en + mr (or bilingual) rows; for a custom it's the single row.
  function versionsForKey(key: string): Template[] {
    if (key.startsWith('grp:')) {
      const g = key.slice(4)
      return templates.filter(t => t.is_system && t.is_active !== false && (t.template_group || t.form_type) === g)
    }
    if (key.startsWith('cst:')) {
      const id = key.slice(4)
      return templates.filter(t => t.id === id)
    }
    return []
  }

  // Which language toggles to offer for a selection: EN when an en/both row
  // exists, मराठी when an mr row exists, Both only when there are genuinely
  // separate en + mr versions.
  function availableLangs(versions: Template[]): Lang[] {
    const hasEn = versions.some(t => t.language === 'en' || t.language === 'both' || !t.language)
    const hasMr = versions.some(t => t.language === 'mr')
    const langs: Lang[] = []
    if (hasEn) langs.push('en')
    if (hasMr) langs.push('mr')
    if (hasEn && hasMr) langs.push('both')
    return langs
  }

  // Resolve the content for a language (mirrors the spec's getContent).
  function contentForLang(lang: Lang, versions: Template[]): string {
    if (lang === 'both') {
      const en = versions.find(t => t.language === 'en' || t.language === 'both' || !t.language)
      const mr = versions.find(t => t.language === 'mr')
      if (en && mr) return en.form_content + '\n\n' + '━'.repeat(40) + '\n\n' + mr.form_content
      return en?.form_content || mr?.form_content || ''
    }
    const t = versions.find(x => x.language === lang || x.language === 'both' || (lang === 'en' && !x.language))
    return t?.form_content || ''
  }

  // The version whose title/form_type best represents a language choice.
  function primaryVersion(lang: Lang, versions: Template[]): Template | undefined {
    if (lang === 'mr') return versions.find(t => t.language === 'mr') || versions[0]
    return versions.find(t => t.language === 'en' || t.language === 'both' || !t.language) || versions[0]
  }

  function applySelection(versions: Template[], lang: Lang) {
    const pv = primaryVersion(lang, versions)
    setSelectedType(pv?.form_type || '')
    setFormTitle(pv?.form_title || '')
    setFormContent(contentForLang(lang, versions))
  }

  function handleSelectGroup(key: string) {
    setSelectedGroupKey(key)
    if (!key) {
      setSelectedType(''); setFormTitle(''); setFormContent('')
      return
    }
    const versions = versionsForKey(key)
    const langs = availableLangs(versions)
    const lang: Lang = langs.includes('en') ? 'en' : (langs[0] || 'en')
    setSelectedLanguage(lang)
    applySelection(versions, lang)
  }

  function handleSelectLanguage(lang: Lang) {
    setSelectedLanguage(lang)
    applySelection(versionsForKey(selectedGroupKey), lang)
  }

  function getPatientName() {
    return selectedPatient ? (selectedPatient.name || '') : manualName
  }
  function getPatientPhone() {
    return selectedPatient ? (selectedPatient.phone || '') : manualPhone
  }

  function buildWhatsAppText() {
    const name = getPatientName()
    const d = dentistMeta
    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    return [
      `*CONSENT FORM — ${formTitle}*`,
      `_${d?.clinic_name || 'Dental Clinic'}_`,
      '',
      `Patient: *${name}*`,
      `Date: ${dateStr}`,
      '',
      formContent,
      '',
      `By replying *"I CONSENT"* to this message, you (${name}) confirm you have read and understood the above and give your informed consent.`,
      '',
      `— Dr. ${d?.name || 'Your Dentist'}`,
      d?.clinic_name ? d.clinic_name : '',
      (d?.phone || d?.whatsapp) ? `📞 ${d.phone || d.whatsapp}` : '',
    ].filter(l => l !== undefined && !(l === '' && false)).join('\n').trim()
  }

  async function saveConsentRecord(status: 'sent' | 'signed' | 'pending') {
    const name = getPatientName().trim()
    const phone = getPatientPhone().trim()
    if (!name) { setSendError('Patient name is required.'); return null }
    if (!selectedType) { setSendError('Select a consent form type.'); return null }
    if (!formContent.trim()) { setSendError('Form content cannot be empty.'); return null }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('consent_forms')
      .insert({
        dentist_id: dentistId,
        patient_id: selectedPatient?.id ?? null,
        form_type: selectedType,
        form_title: formTitle,
        form_text: formContent,
        form_content: { __v: 2, text: formContent },  // keep jsonb col valid
        patient_name: name,
        patient_phone: phone || null,
        status,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        signed_at: status === 'signed' ? new Date().toISOString() : null,
        signature_method: status === 'signed' ? 'manual' : 'manual',
      })
      .select('id, form_type, form_title, patient_name, patient_phone, status, sent_at, signed_at, created_at')
      .single()
    if (error) { setSendError(error.message); return null }
    return data as ConsentRow
  }

  async function handleSendWhatsApp() {
    setSendError(null); setSendSuccess(null); setSending(true)
    const phone = getPatientPhone().trim()
    if (!phone) { setSendError('Patient phone number is required to send via WhatsApp.'); setSending(false); return }
    const record = await saveConsentRecord('sent')
    if (!record) { setSending(false); return }
    setForms(prev => [record, ...prev])
    const waText = buildWhatsAppText()
    const digits = phone.replace(/\D/g, '')
    const waNum = digits.length === 10 ? `91${digits}` : digits
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(waText)}`, '_blank')
    setSendSuccess(`Consent form sent via WhatsApp to ${getPatientName()}.`)
    resetSendForm()
    setSending(false)
  }

  async function handleManualSigned() {
    setSendError(null); setSendSuccess(null); setSending(true)
    const record = await saveConsentRecord('signed')
    if (!record) { setSending(false); return }
    setForms(prev => [record, ...prev])
    setSendSuccess(`Consent form recorded as manually signed for ${getPatientName()}.`)
    resetSendForm()
    setSending(false)
  }

  async function handleSavePending() {
    setSendError(null); setSendSuccess(null); setSending(true)
    const record = await saveConsentRecord('pending')
    if (!record) { setSending(false); return }
    setForms(prev => [record, ...prev])
    setSendSuccess(`Consent form saved as pending for ${getPatientName()}.`)
    resetSendForm()
    setSending(false)
  }

  function resetSendForm() {
    setSelectedPatient(null)
    setPatientQuery('')
    setManualName('')
    setManualPhone('')
    setSelectedType('')
    setSelectedGroupKey('')
    setSelectedLanguage('en')
    setFormContent('')
    setFormTitle('')
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this consent form?')) return
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('consent_forms').delete().eq('id', id)
    setForms(prev => prev.filter(f => f.id !== id))
    setDeleting(null)
  }

  // Send dropdown: collapse system templates into one entry per template_group
  // (en + mr share an entry), then list custom templates individually.
  const activeSystem = templates.filter(t => t.is_system && t.is_active !== false)
  const customTemplates = templates.filter(t => !t.is_system && t.is_active !== false)
  const systemGroups = Array.from(
    new Set(activeSystem.map(t => t.template_group || t.form_type))
  ).map(g => {
    const versions = activeSystem.filter(t => (t.template_group || t.form_type) === g)
    const primary = versions.find(t => t.language === 'en' || t.language === 'both' || !t.language) || versions[0]
    return { key: `grp:${g}`, label: primary?.form_title || g }
  })

  // Language toggles available for the current selection.
  const langOptions = selectedGroupKey ? availableLangs(versionsForKey(selectedGroupKey)) : []
  const LANG_LABEL: Record<Lang, string> = { en: 'English', mr: 'मराठी', both: 'Both / दोन्ही' }

  const filteredForms = statusFilter === 'all'
    ? forms
    : forms.filter(f => f.status === statusFilter)

  const statusCounts: Record<StatusFilter, number> = {
    all: forms.length,
    pending: forms.filter(f => f.status === 'pending').length,
    sent: forms.filter(f => f.status === 'sent').length,
    signed: forms.filter(f => f.status === 'signed').length,
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading consent forms…</p>
    </div>
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Consent Forms</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Send, track and manage patient consent forms</p>
        </div>
        <Link href="/for-dentists/dashboard/consent-forms/templates"
          style={{ padding: '10px 18px', minHeight: 44, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontWeight: 600, fontSize: 13, color: 'var(--text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          📋 Manage Templates
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {([
          { key: 'send' as TabKey, label: '➕ Send Consent' },
          { key: 'all'  as TabKey, label: `📋 All Forms (${forms.length})` },
        ]).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px', border: 'none', background: 'none',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              color: activeTab === t.key ? 'var(--blue)' : 'var(--muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -2,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Send Consent ─── */}
      {activeTab === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* Left: form */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, margin: 0 }}>Patient</h2>

            {/* Patient search */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Search existing patient</label>
              <input value={patientQuery} onChange={e => { setPatientQuery(e.target.value); setSelectedPatient(null) }}
                placeholder="Name or phone…" style={inp} />
              {patientResults.length > 0 && !selectedPatient && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden' }}>
                  {patientResults.map(p => (
                    <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientQuery(p.name || ''); setPatientResults([]) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      {p.phone && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{p.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {selectedPatient && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: '#166534' }}>✓ {selectedPatient.name} {selectedPatient.phone ? `· ${selectedPatient.phone}` : ''}</span>
                  <button onClick={() => { setSelectedPatient(null); setPatientQuery('') }}
                    style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                </div>
              )}
            </div>

            {/* Manual entry fallback */}
            {!selectedPatient && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Or enter name *</label>
                  <input value={manualName} onChange={e => setManualName(e.target.value)}
                    placeholder="Patient name" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
                  <input value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                    placeholder="10-digit number" style={inp} />
                </div>
              </div>
            )}

            {/* Form type */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Consent form type *</label>
              <select value={selectedGroupKey} onChange={e => handleSelectGroup(e.target.value)} style={{ ...inp }}>
                <option value="">— Select form type</option>
                {systemGroups.length > 0 && (
                  <optgroup label="System Templates">
                    {systemGroups.map(g => (
                      <option key={g.key} value={g.key}>{g.label}</option>
                    ))}
                  </optgroup>
                )}
                {customTemplates.length > 0 && (
                  <optgroup label="My Templates">
                    {customTemplates.map(t => (
                      <option key={t.id} value={`cst:${t.id}`}>{t.form_title}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Language toggle — shown once a form type is picked. Switching a
                tab re-renders the preview instantly. */}
            {selectedGroupKey && langOptions.length > 0 && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Language / भाषा</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {langOptions.map(l => {
                    const active = selectedLanguage === l
                    return (
                      <button key={l} type="button" onClick={() => handleSelectLanguage(l)}
                        style={{
                          padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                          background: active ? '#0A2558' : '#fff',
                          color: active ? '#fff' : '#64748B',
                          fontWeight: active ? 700 : 500,
                          border: active ? '1px solid #0A2558' : '1px solid #CBD5E1',
                        }}>
                        {LANG_LABEL[l]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            {sendError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
                {sendError}
              </div>
            )}
            {sendSuccess && (
              <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
                {sendSuccess}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={handleSendWhatsApp} disabled={sending}
                style={{ ...primaryBtn, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sending ? 0.6 : 1, cursor: sending ? 'not-allowed' : 'pointer' }}>
                💬 Send via WhatsApp
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleManualSigned} disabled={sending}
                  style={{ ...primaryBtn, flex: 1, background: '#DBEAFE', color: '#1D4ED8', opacity: sending ? 0.6 : 1, cursor: sending ? 'not-allowed' : 'pointer' }}>
                  ✓ Mark Manually Signed
                </button>
                <button onClick={handleSavePending} disabled={sending}
                  style={{ ...primaryBtn, flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', opacity: sending ? 0.6 : 1, cursor: sending ? 'not-allowed' : 'pointer' }}>
                  Save as Pending
                </button>
              </div>
            </div>
          </div>

          {/* Right: preview / editor */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, margin: 0 }}>
                {formTitle || 'Form Preview / Edit'}
              </h2>
              {selectedType && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--blue-light)', color: 'var(--blue)', fontWeight: 600 }}>
                  {typeLabel(selectedType)}
                </span>
              )}
            </div>
            {selectedType ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                  Edit the form text below before sending — changes apply to this send only.
                </p>
                <textarea value={formContent} onChange={e => setFormContent(e.target.value)}
                  rows={16}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }} />
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', color: 'var(--muted)', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <p style={{ fontSize: 14 }}>Select a consent form type to preview and edit the content</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: All Forms ─── */}
      {activeTab === 'all' && (
        <div>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {(['all', 'pending', 'sent', 'signed'] as StatusFilter[]).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                style={{
                  padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                  fontFamily: 'var(--font-body)', cursor: 'pointer', border: '1.5px solid',
                  background: statusFilter === s ? 'var(--blue)' : '#fff',
                  color: statusFilter === s ? '#fff' : 'var(--text)',
                  borderColor: statusFilter === s ? 'var(--blue)' : 'var(--border)',
                }}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({statusCounts[s]})
              </button>
            ))}
          </div>

          {filteredForms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No consent forms yet</h3>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Use the "Send Consent" tab to create and send your first consent form.</p>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {['Patient', 'Form Type', 'Date', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredForms.map(f => {
                    const sm = STATUS_META[f.status || 'pending'] || STATUS_META.pending
                    const dateStr = (f.sent_at || f.created_at)
                      ? new Date(f.sent_at || f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'
                    return (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{f.patient_name || '—'}</div>
                          {f.patient_phone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.patient_phone}</div>}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13 }}>
                          {f.form_title || typeLabel(f.form_type)}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: sm.bg, color: sm.text }}>
                            {sm.label}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Link href={`/for-dentists/dashboard/consent-forms/${f.id}`}
                              style={{ padding: '6px 12px', background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                              View
                            </Link>
                            <button onClick={() => handleDelete(f.id)} disabled={deleting === f.id}
                              style={{ padding: '6px 10px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: deleting === f.id ? 0.5 : 1 }}>
                              {deleting === f.id ? '…' : '✕'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .consent-send-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
