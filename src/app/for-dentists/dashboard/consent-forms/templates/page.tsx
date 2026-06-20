'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'

type Lang = 'en' | 'mr' | 'hi' | 'gu' | 'te' | 'ta' | 'both'

interface Template {
  id: string
  dentist_id: string | null
  form_type: string
  form_title: string
  form_content: string
  is_system: boolean
  is_default: boolean
  is_active?: boolean
  language?: Lang | null
  template_group?: string | null
  created_at: string
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px', minHeight: 48,
  borderRadius: 8, border: '1.5px solid var(--border)',
  fontSize: 14, fontFamily: 'var(--font-body)',
  outline: 'none', boxSizing: 'border-box', background: '#fff',
}

// form_type is an internal identifier — slugify whatever the dentist types so
// it stays lowercase and URL/key-safe ("Teeth Whitening" → "teeth-whitening").
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Friendly headings for the system template groups; falls back to the raw
// template_group with underscores spaced out.
const GROUP_LABELS: Record<string, string> = {
  extraction: 'Extraction Consent',
  rct: 'Root Canal',
  implant: 'Dental Implant',
  orthodontic: 'Orthodontic',
  surgery: 'Oral Surgery',
  anaesthesia: 'Local Anaesthesia',
  basal_implant: 'Basal Implant',
}
function groupLabel(g: string): string {
  return (GROUP_LABELS[g] || g.replace(/_/g, ' ')).toUpperCase()
}

// Colour-coded language pill — one distinct colour per language.
const LANG_BADGE: Record<Lang, { text: string; color: string }> = {
  en:   { text: 'EN',          color: '#1565C0' }, // blue
  mr:   { text: 'मराठी',       color: '#E65100' }, // orange
  hi:   { text: 'हिंदी',        color: '#2E7D32' }, // green
  gu:   { text: 'ગુજરાતી',     color: '#6A1B9A' }, // purple
  te:   { text: 'తెలుగు',      color: '#00897B' }, // teal
  ta:   { text: 'தமிழ்',       color: '#C62828' }, // red
  both: { text: 'EN + मराठी',  color: '#0A2558' }, // navy
}
function LangBadge({ language }: { language?: Lang | null }) {
  const m = LANG_BADGE[language || 'en']
  return (
    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: m.color, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {m.text}
    </span>
  )
}

// Stable ordering of versions within a group: en, mr, hi, gu, te, ta, both.
const LANG_ORDER: Record<Lang, number> = { en: 0, mr: 1, hi: 2, gu: 3, te: 4, ta: 5, both: 6 }

type ModalMode = 'edit' | 'create' | null

export default function ConsentTemplatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [selected, setSelected] = useState<Template | null>(null)
  const [modal, setModal] = useState<ModalMode>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [editForm, setEditForm] = useState<{
    form_type: string
    form_title: string
    form_content: string
    is_active: boolean
    language: Lang
  }>({
    form_type: '',
    form_title: '',
    form_content: '',
    is_active: true,
    language: 'en',
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const dentist = await resolveCurrentDentist<{ id: string }>(supabase, 'id')
      if (!dentist) { router.push('/for-dentists/login'); return }
      setDentistId(dentist.id)

      const { data } = await supabase
        .from('consent_templates')
        .select('id, dentist_id, form_type, form_title, form_content, is_system, is_default, is_active, language, template_group, created_at')
        .order('is_system', { ascending: false })
        .order('form_title')
      // Hide soft-deleted custom templates (is_active = false). System rows
      // default to active.
      const tpls = ((data ?? []) as Template[]).filter(t => t.is_active !== false)
      setTemplates(tpls)
      if (tpls.length > 0) setSelected(tpls[0])
      setLoading(false)
    }
    load()
  }, [router])

  function openEdit(tpl: Template) {
    setEditForm({
      form_type: tpl.form_type,
      form_title: tpl.form_title,
      form_content: tpl.form_content,
      is_active: tpl.is_active ?? true,
      language: tpl.language ?? 'en',
    })
    setModal('edit')
    setError(null)
  }

  function openCreate() {
    setEditForm({ form_type: '', form_title: '', form_content: '', is_active: true, language: 'en' })
    setModal('create')
    setError(null)
  }

  const SELECT_COLS = 'id, dentist_id, form_type, form_title, form_content, is_system, is_default, is_active, language, template_group, created_at'

  async function handleSave() {
    setError(null)
    const formType = slugify(editForm.form_type)
    if (!editForm.form_title.trim()) { setError('Template name is required.'); return }
    if (!formType) { setError('Form type is required.'); return }
    if (!editForm.form_content.trim()) { setError('Content is required.'); return }
    setSaving(true)

    const supabase = createClient()

    if (modal === 'edit' && selected) {
      if (selected.is_system) {
        // System template: save as a dentist-specific copy (new row). The
        // shared system row is never mutated.
        const { data, error: insertErr } = await supabase
          .from('consent_templates')
          .insert({
            dentist_id: dentistId,
            form_type: formType,
            form_title: editForm.form_title,
            form_content: editForm.form_content,
            is_system: false,
            is_default: false,
            is_active: editForm.is_active,
            language: editForm.language,
          })
          .select(SELECT_COLS)
          .single()
        setSaving(false)
        if (insertErr) { setError(insertErr.message); return }
        const newTpl = data as Template
        setTemplates(prev => [newTpl, ...prev])
        setSelected(newTpl)
        setSuccess('Custom copy saved')
      } else {
        // Own template: update in place
        const { error: updateErr } = await supabase
          .from('consent_templates')
          .update({
            form_title: editForm.form_title,
            form_content: editForm.form_content,
            form_type: formType,
            is_active: editForm.is_active,
            language: editForm.language,
          })
          .eq('id', selected.id)
        setSaving(false)
        if (updateErr) { setError(updateErr.message); return }
        const updated: Template = { ...selected, ...editForm, form_type: formType }
        setTemplates(prev => prev.map(t => t.id === selected.id ? updated : t))
        setSelected(updated)
        setSuccess('Template saved')
      }
    } else if (modal === 'create') {
      const { data, error: insertErr } = await supabase
        .from('consent_templates')
        .insert({
          dentist_id: dentistId,
          form_type: formType,
          form_title: editForm.form_title,
          form_content: editForm.form_content,
          is_system: false,
          is_default: false,
          is_active: editForm.is_active,
          language: editForm.language,
        })
        .select(SELECT_COLS)
        .single()
      setSaving(false)
      if (insertErr) { setError(insertErr.message); return }
      const newTpl = data as Template
      setTemplates(prev => [...prev, newTpl])
      setSelected(newTpl)
      setSuccess('Template saved')
    }

    setModal(null)
    setTimeout(() => setSuccess(null), 4000)
  }

  async function handleDelete(tpl: Template) {
    if (tpl.is_system) return // system templates are permanent
    if (!confirm('Delete this template? This cannot be undone.')) return
    setDeleting(tpl.id)
    const supabase = createClient()
    // Soft delete — flip is_active off rather than removing the row.
    const { error: delErr } = await supabase
      .from('consent_templates')
      .update({ is_active: false })
      .eq('id', tpl.id)
    setDeleting(null)
    if (delErr) { setError(delErr.message); return }
    const remaining = templates.filter(t => t.id !== tpl.id)
    setTemplates(remaining)
    if (selected?.id === tpl.id) setSelected(remaining[0] ?? null)
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading templates…</p>
    </div>
  }

  const systemTpls = templates.filter(t => t.is_system)
  const customTpls = templates.filter(t => !t.is_system)

  // System templates grouped by template_group so the en + mr versions show
  // as a pair under one heading.
  const systemGroups = Array.from(new Set(systemTpls.map(t => t.template_group || t.form_type)))
    .map(g => ({
      g,
      items: systemTpls
        .filter(t => (t.template_group || t.form_type) === g)
        .sort((a, b) => LANG_ORDER[a.language || 'en'] - LANG_ORDER[b.language || 'en']),
    }))

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/for-dentists/dashboard/consent-forms" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← Consent Forms</Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: 0 }}>Consent Templates</h1>
        </div>
        <button onClick={openCreate}
          style={{ padding: '10px 20px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          + Create Custom Template
        </button>
      </div>

      {success && (
        <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', padding: '10px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          ✓ {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left: template list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {systemGroups.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '8px 12px 4px', letterSpacing: '0.05em' }}>
                SYSTEM TEMPLATES
              </div>
              {systemGroups.map(({ g, items }) => (
                <div key={g} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', padding: '6px 12px 2px', letterSpacing: '0.04em' }}>
                    {groupLabel(g)}
                  </div>
                  {items.map(t => (
                    <button key={t.id} onClick={() => setSelected(t)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none',
                        borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)',
                        background: selected?.id === t.id ? 'var(--blue-light)' : 'transparent',
                        color: selected?.id === t.id ? 'var(--blue)' : 'var(--text)',
                        fontWeight: selected?.id === t.id ? 700 : 400,
                      }}>
                      <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LangBadge language={t.language} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.form_title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '12px 12px 4px', letterSpacing: '0.05em' }}>
            MY CUSTOM TEMPLATES
          </div>
          {customTpls.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 12px 8px', lineHeight: 1.5 }}>
              No custom templates yet. Click <strong>+ Create Custom Template</strong> to add your first.
            </p>
          ) : (
            customTpls.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setSelected(t)}
                  style={{
                    flex: 1, textAlign: 'left', padding: '10px 12px', border: 'none',
                    borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)',
                    background: selected?.id === t.id ? 'var(--blue-light)' : 'transparent',
                    color: selected?.id === t.id ? 'var(--blue)' : 'var(--text)',
                    fontWeight: selected?.id === t.id ? 700 : 400,
                  }}>
                  <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {t.form_title}
                    <LangBadge language={t.language} />
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: '#CCFBF1', color: '#0F766E', fontWeight: 700 }}>Custom</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.form_type}</div>
                </button>
                <button onClick={() => handleDelete(t)} disabled={deleting === t.id}
                  title="Delete template"
                  style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14, opacity: deleting === t.id ? 0.4 : 1 }}>
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Right: preview panel */}
        {selected ? (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, margin: 0 }}>{selected.form_title}</h2>
                  <LangBadge language={selected.language} />
                  {selected.is_system ? (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>System</span>
                  ) : (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#CCFBF1', color: '#0F766E', fontWeight: 600 }}>Custom</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Type: {selected.form_type}</p>
              </div>
              <button onClick={() => openEdit(selected)}
                style={{ padding: '10px 18px', minHeight: 42, background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid #BFDBFE', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {selected.is_system ? '✏ Customise' : '✏ Edit'}
              </button>
            </div>

            {selected.is_system && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400E' }}>
                This is a system template. Clicking "Customise" will save a copy for your clinic that you can modify freely.
              </div>
            )}

            <pre style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0, padding: '16px', background: 'var(--bg)', borderRadius: 10 }}>
              {selected.form_content}
            </pre>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>Select a template to preview it</p>
          </div>
        )}
      </div>

      {/* Edit / Create Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>
                {modal === 'create' ? 'Create Custom Template' : selected?.is_system ? 'Customise System Template' : 'Edit Template'}
              </h2>
              <button onClick={() => setModal(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
                  {error}
                </div>
              )}
              {modal === 'edit' && selected?.is_system && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 14px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 }}>
                  Editing a system template creates your own custom copy. The original system template is preserved.
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Template Name *</label>
                <input value={editForm.form_title} onChange={e => setEditForm(f => ({ ...f, form_title: e.target.value }))}
                  placeholder="e.g. Teeth Whitening Consent" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Language</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([['en', 'English'], ['mr', 'मराठी'], ['hi', 'हिंदी'], ['gu', 'ગુજરાતી'], ['te', 'తెలుగు'], ['ta', 'தமிழ்'], ['both', 'Both (EN + MR)']] as [Lang, string][]).map(([val, label]) => {
                    const active = editForm.language === val
                    return (
                      <button key={val} type="button" onClick={() => setEditForm(f => ({ ...f, language: val }))}
                        style={{
                          padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
                          background: active ? '#0A2558' : '#fff',
                          color: active ? '#fff' : '#64748B',
                          fontWeight: active ? 700 : 500,
                          border: active ? '1px solid #0A2558' : '1px solid #CBD5E1',
                        }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Form Type *</label>
                <input value={editForm.form_type} onChange={e => setEditForm(f => ({ ...f, form_type: e.target.value }))}
                  placeholder="e.g. whitening" style={inp} />
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 2px 0' }}>Used internally to identify the template.</p>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Consent Form Content *</label>
                <textarea value={editForm.form_content} onChange={e => setEditForm(f => ({ ...f, form_content: e.target.value }))}
                  rows={15}
                  placeholder={'Type your full consent form text here...\n\nYou can include:\n• Procedure description\n• Risks and benefits\n• Patient acknowledgements\n• Post-care instructions'}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }} />
              </div>
              <button type="button" onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <span style={{
                  width: 42, height: 24, borderRadius: 20, padding: 2, flexShrink: 0, transition: 'background 0.15s',
                  background: editForm.is_active ? 'var(--blue)' : 'var(--border)', display: 'inline-flex',
                  justifyContent: editForm.is_active ? 'flex-end' : 'flex-start', alignItems: 'center',
                }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Active{editForm.is_active ? '' : ' (hidden from send list)'}</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setModal(null)} disabled={saving}
                style={{ padding: '12px 20px', minHeight: 48, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '12px 24px', minHeight: 48, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
                {saving ? 'Saving…' : modal === 'create' ? 'Create Template' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
