'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type MedRow = { name: string; dosage: string; frequency: string; duration: string }
type ProcRow = { name: string; tooth_number: string; price: string }

type Template = {
  id: string
  dentist_id: string
  name: string
  procedures: ProcRow[] | null
  medications: MedRow[] | null
  advice: string | null
  times_used: number | null
  last_used_at: string | null
  created_at: string
}

type SectionKey = 'procedures' | 'medications' | 'advice'

// The emr_templates table stores procedures / medications / advice bundled
// inside a single sections_json column (and the column is NOT NULL). The
// rest of this page works with the unpacked shape because the UI renders
// each section separately; these helpers translate at the supabase
// boundary so the rest of the code stays clean.
type SectionsJson = { procedures?: ProcRow[] | null; medications?: MedRow[] | null; advice?: string | null }

function unpackTemplateRow(row: any): Template {
  const s: SectionsJson = (row?.sections_json ?? {}) as SectionsJson
  return {
    id: row.id,
    dentist_id: row.dentist_id,
    name: row.name,
    procedures: Array.isArray(s.procedures) ? s.procedures : null,
    medications: Array.isArray(s.medications) ? s.medications : null,
    advice: typeof s.advice === 'string' ? s.advice : null,
    times_used: row.times_used ?? 0,
    last_used_at: row.last_used_at ?? null,
    created_at: row.created_at,
  }
}

function packSections(payload: Pick<Template, 'procedures' | 'medications' | 'advice'>): SectionsJson {
  return {
    procedures: payload.procedures ?? [],
    medications: payload.medications ?? [],
    advice: payload.advice ?? null,
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: 13,
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
}

function hasSection(t: Template, key: SectionKey): boolean {
  if (key === 'procedures') return Array.isArray(t.procedures) && t.procedures.some(p => p?.name?.trim())
  if (key === 'medications') return Array.isArray(t.medications) && t.medications.some(m => m?.name?.trim())
  return !!t.advice && t.advice.trim().length > 0
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EmrTemplatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeSections, setActiveSections] = useState<Set<SectionKey>>(new Set())
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) { router.push('/for-dentists/login'); return }
      setDentistId(dentist.id)
      const { data, error: e } = await supabase
        .from('emr_templates')
        .select('id, dentist_id, name, sections_json, times_used, last_used_at, created_at')
        .eq('dentist_id', dentist.id)
        .order('created_at', { ascending: false })
      if (e) setError(e.message)
      setTemplates((data ?? []).map(unpackTemplateRow))
      setLoading(false)
    }
    load()
  }, [router])

  const filtered = useMemo(() => {
    if (activeSections.size === 0) return templates
    return templates.filter(t => Array.from(activeSections).some(s => hasSection(t, s)))
  }, [templates, activeSections])

  function toggleSection(s: SectionKey) {
    setActiveSections(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  async function handleSave(payload: Pick<Template, 'name' | 'procedures' | 'medications' | 'advice'>, id: string | null) {
    setError(null)
    const supabase = createClient()
    const sections_json = packSections(payload)
    if (id) {
      const { data, error: e } = await supabase
        .from('emr_templates')
        .update({ name: payload.name, sections_json })
        .eq('id', id)
        .select('id, dentist_id, name, sections_json, times_used, last_used_at, created_at')
        .single()
      if (e) { setError(e.message); return }
      const next = unpackTemplateRow(data)
      setTemplates(prev => prev.map(t => t.id === id ? next : t))
    } else {
      const { data, error: e } = await supabase
        .from('emr_templates')
        .insert({
          dentist_id: dentistId,
          name: payload.name,
          sections_json,
          times_used: 0,
        })
        .select('id, dentist_id, name, sections_json, times_used, last_used_at, created_at')
        .single()
      if (e) { setError(e.message); return }
      setTemplates(prev => [unpackTemplateRow(data), ...prev])
    }
    setEditing(null)
    setCreating(false)
  }

  async function handleDelete(id: string) {
    setError(null)
    const supabase = createClient()
    const { error: e } = await supabase.from('emr_templates').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setTemplates(prev => prev.filter(t => t.id !== id))
    setConfirmDelete(null)
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading templates…</p>
    </div>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>EMR Templates</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Reusable EMR shortcuts. Apply them when creating a new EMR record.
          </p>
        </div>
        <button type="button" onClick={() => setCreating(true)}
          style={{ padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          + Create Template
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }} className="emr-tpl-layout">
        {/* Filter sidebar */}
        <aside style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', position: 'sticky', top: 0 }} className="emr-tpl-sidebar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>
              Filter by section
            </h3>
            {activeSections.size > 0 && (
              <button type="button" onClick={() => setActiveSections(new Set())}
                style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Clear
              </button>
            )}
          </div>
          {(['procedures', 'medications', 'advice'] as SectionKey[]).map(s => {
            const count = templates.filter(t => hasSection(t, s)).length
            const on = activeSections.has(s)
            return (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', cursor: 'pointer', borderRadius: 6 }}>
                <input type="checkbox" checked={on} onChange={() => toggleSection(s)}
                  style={{ accentColor: 'var(--blue)', width: 16, height: 16 }} />
                <span style={{ flex: 1, fontSize: 14, textTransform: 'capitalize' }}>{s}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>({count})</span>
              </label>
            )
          })}
        </aside>

        {/* List */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '48px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                {templates.length === 0 ? 'No templates yet' : 'No templates match this filter'}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                {templates.length === 0 ? 'Create your first template to speed up EMR entry.' : 'Try clearing the filter or creating a new template.'}
              </p>
              {templates.length === 0 && (
                <button type="button" onClick={() => setCreating(true)}
                  style={{ padding: '10px 20px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  + Create your first template
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(t => {
                const procCount = (t.procedures || []).filter(p => p?.name?.trim()).length
                const medCount = (t.medications || []).filter(m => m?.name?.trim()).length
                return (
                  <div key={t.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                          {t.name}
                        </h3>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {procCount > 0 && <span style={{ fontSize: 11, padding: '2px 10px', background: 'var(--blue-light)', color: 'var(--blue-dark)', borderRadius: 20, fontWeight: 600 }}>{procCount} procedure{procCount !== 1 ? 's' : ''}</span>}
                          {medCount > 0 && <span style={{ fontSize: 11, padding: '2px 10px', background: '#EDE9FE', color: '#5B21B6', borderRadius: 20, fontWeight: 600 }}>{medCount} medication{medCount !== 1 ? 's' : ''}</span>}
                          {t.advice && <span style={{ fontSize: 11, padding: '2px 10px', background: '#FEF3C7', color: '#92400E', borderRadius: 20, fontWeight: 600 }}>Advice</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                          <span>Created {fmtDate(t.created_at)}</span>
                          <span>Used {t.times_used ?? 0} time{(t.times_used ?? 0) !== 1 ? 's' : ''}</span>
                          <span>Last used {fmtDate(t.last_used_at)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setEditing(t)}
                          style={{ padding: '8px 14px', minHeight: 40, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          Edit
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(t)}
                          style={{ padding: '8px 14px', minHeight: 40, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <TemplateModal
          initial={editing}
          onCancel={() => { setEditing(null); setCreating(false) }}
          onSave={(payload) => handleSave(payload, editing?.id ?? null)}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          name={confirmDelete.name}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete.id)}
        />
      )}

      <style>{`
        @media (max-width: 768px) {
          .emr-tpl-layout { grid-template-columns: 1fr !important; }
          .emr-tpl-sidebar { position: static !important; }
        }
      `}</style>
    </div>
  )
}

function TemplateModal({ initial, onCancel, onSave }: {
  initial: Template | null
  onCancel: () => void
  onSave: (payload: { name: string; procedures: ProcRow[]; medications: MedRow[]; advice: string | null }) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [procedures, setProcedures] = useState<ProcRow[]>(
    (initial?.procedures && initial.procedures.length > 0) ? initial.procedures : [{ name: '', tooth_number: '', price: '' }]
  )
  const [medications, setMedications] = useState<MedRow[]>(
    (initial?.medications && initial.medications.length > 0) ? initial.medications : [{ name: '', dosage: '', frequency: '', duration: '' }]
  )
  const [advice, setAdvice] = useState(initial?.advice ?? '')
  const [saving, setSaving] = useState(false)

  function updateProc(i: number, patch: Partial<ProcRow>) {
    setProcedures(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function updateMed(i: number, patch: Partial<MedRow>) {
    setMedications(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  async function submit() {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name: name.trim(),
      procedures: procedures.filter(p => p.name.trim()),
      medications: medications.filter(m => m.name.trim()),
      advice: advice.trim() ? advice : null,
    })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>
            {initial ? 'Edit Template' : 'New Template'}
          </h2>
          <button type="button" onClick={onCancel}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Root canal — molar, Post-extraction kit"
              style={inputStyle} autoFocus />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Procedures</label>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead><tr style={{ background: 'var(--bg)' }}>
                  {['Procedure', 'Tooth #', 'Price (₹)', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {procedures.map((p, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}><input value={p.name} onChange={e => updateProc(i, { name: e.target.value })} placeholder="Root canal treatment" style={inputStyle} /></td>
                      <td style={{ padding: '6px 8px' }}><input value={p.tooth_number} onChange={e => updateProc(i, { tooth_number: e.target.value })} placeholder="(blank for any)" style={inputStyle} /></td>
                      <td style={{ padding: '6px 8px' }}><input type="number" inputMode="numeric" value={p.price} onChange={e => updateProc(i, { price: e.target.value })} placeholder="5000" style={inputStyle} /></td>
                      <td style={{ padding: '6px 8px' }}>
                        {procedures.length > 1 && (
                          <button type="button" onClick={() => setProcedures(prev => prev.filter((_, idx) => idx !== i))}
                            style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, minHeight: 36 }}>✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setProcedures(prev => [...prev, { name: '', tooth_number: '', price: '' }])}
              style={{ marginTop: 8, fontSize: 13, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>+ Add procedure</button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Medications</label>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr style={{ background: 'var(--bg)' }}>
                  {['Medicine', 'Dosage', 'Frequency', 'Duration', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {medications.map((m, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}><input value={m.name} onChange={e => updateMed(i, { name: e.target.value })} placeholder="Amoxicillin 500mg" style={inputStyle} /></td>
                      <td style={{ padding: '6px 8px' }}><input value={m.dosage} onChange={e => updateMed(i, { dosage: e.target.value })} placeholder="500mg" style={inputStyle} /></td>
                      <td style={{ padding: '6px 8px' }}><input value={m.frequency} onChange={e => updateMed(i, { frequency: e.target.value })} placeholder="1-0-1" style={inputStyle} /></td>
                      <td style={{ padding: '6px 8px' }}><input value={m.duration} onChange={e => updateMed(i, { duration: e.target.value })} placeholder="5 days" style={inputStyle} /></td>
                      <td style={{ padding: '6px 8px' }}>
                        {medications.length > 1 && (
                          <button type="button" onClick={() => setMedications(prev => prev.filter((_, idx) => idx !== i))}
                            style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, minHeight: 36 }}>✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setMedications(prev => [...prev, { name: '', dosage: '', frequency: '', duration: '' }])}
              style={{ marginTop: 8, fontSize: 13, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>+ Add medication</button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Advice</label>
            <textarea value={advice} onChange={e => setAdvice(e.target.value)} rows={3}
              placeholder="Default post-procedure advice for this template…"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '10px 18px', minHeight: 44, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving || !name.trim()}
            style={{ padding: '10px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer', opacity: (saving || !name.trim()) ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
            {saving ? 'Saving…' : (initial ? 'Save changes' : 'Create template')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, padding: 24 }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Delete template?</h3>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
          “{name}” will be removed permanently. EMR records that previously used it are unaffected.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '10px 18px', minHeight: 44, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            style={{ padding: '10px 22px', minHeight: 44, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
