'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AutocompleteInput from '@/components/AutocompleteInput'

const COMPLAINT_CHIPS = [
  'Tooth Decay', 'Sensitivity', 'Pain in tooth', 'Missing tooth', 'Broken tooth',
  'Swollen gum', 'Bleeding gum', 'Root canal', 'Crooked teeth', 'Jaw pain',
]

const PROCEDURE_SUGGESTIONS = [
  'Root Canal Treatment', 'Root Planning', 'Root Fragment Removal',
  'Extraction', 'Surgical Extraction',
  'Dental Implant', 'Implant Consultation',
  'Scaling', 'Deep Scaling',
  'Composite Filling', 'GIC Filling',
  'Crown', 'PFM Crown', 'Zirconia Crown',
  'Teeth Whitening',
  'Braces Consultation', 'Orthodontic Treatment',
  'Denture', 'Partial Denture',
  'Sinus Lift', 'Bone Grafting',
  'Gum Treatment', 'Apicoectomy', 'Tooth Splinting',
]

const BUILTIN_MEDICATIONS = [
  'Amoxicillin 500mg', 'Amoxiclav 625mg',
  'Metronidazole 400mg', 'Metrogyl DG Gel',
  'Ibuprofen 400mg', 'Diclofenac 50mg', 'Paracetamol 500mg',
  'Pantoprazole 40mg',
  'Betadine Mouthwash', 'Chlorhexidine Mouthwash',
  'Sensodyne Toothpaste', 'Fluoride Gel', 'Lignocaine Gel',
  'Dexamethasone 0.5mg', 'Prednisolone 10mg',
]

type MedRow = { name: string; dosage: string; frequency: string; duration: string }
type ProcRow = { name: string; tooth_number: string; price: string }

type DbTemplate = {
  id: string
  name: string
  procedures: ProcRow[] | null
  medications: MedRow[] | null
  advice: string | null
  times_used: number | null
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: 13,
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
}
const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
  padding: '20px', marginBottom: 16,
}
const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12,
}

export default function NewEmrPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patient, setPatient] = useState<{ id: string; name: string; age: number | null; gender: string | null } | null>(null)
  const [dentistId, setDentistId] = useState('')

  const [templates, setTemplates] = useState<DbTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [customMedicines, setCustomMedicines] = useState<string[]>([])
  const [complaints, setComplaints] = useState<string[]>([])
  const [vitals, setVitals] = useState({ bp: '', pulse: '', spo2: '', weight_kg: '', height_cm: '' })
  const [diagnosis, setDiagnosis] = useState('')
  const [medications, setMedications] = useState<MedRow[]>([{ name: '', dosage: '', frequency: '', duration: '' }])
  const [procedures, setProcedures] = useState<ProcRow[]>([{ name: '', tooth_number: '', price: '' }])
  const [advice, setAdvice] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase
        .from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) { router.push('/for-dentists/login'); return }
      setDentistId(dentist.id)

      const [{ data: p }, { data: tpls }, { data: customMeds }] = await Promise.all([
        supabase.from('patients').select('id, name, age, gender')
          .eq('id', patientId).eq('dentist_id', dentist.id).single(),
        supabase.from('emr_templates').select('id, name, procedures, medications, advice, times_used')
          .eq('dentist_id', dentist.id).order('times_used', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
        supabase.from('custom_medicines').select('name')
          .eq('dentist_id', dentist.id).order('created_at', { ascending: false }),
      ])
      if (!p) { router.push('/for-dentists/dashboard/patients'); return }
      setPatient(p)
      setTemplates((tpls as DbTemplate[]) || [])
      setCustomMedicines(((customMeds ?? []) as Array<{ name: string }>).map(r => r.name).filter(Boolean))
      setLoading(false)
    }
    load()
  }, [patientId, router])

  function applyTemplate(t: DbTemplate) {
    setSelectedTemplateId(t.id)
    if (t.procedures && t.procedures.length > 0) {
      setProcedures(t.procedures.map(p => ({ name: p.name ?? '', tooth_number: p.tooth_number ?? '', price: p.price ?? '' })))
    }
    if (t.medications && t.medications.length > 0) {
      setMedications(t.medications.map(m => ({ name: m.name ?? '', dosage: m.dosage ?? '', frequency: m.frequency ?? '', duration: m.duration ?? '' })))
    }
    if (t.advice && !advice.trim()) setAdvice(t.advice)

    // Track usage (best-effort, non-blocking)
    const supabase = createClient()
    supabase.from('emr_templates')
      .update({ times_used: (t.times_used ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq('id', t.id)
      .then(() => {}, () => {})
  }

  function toggleComplaint(c: string) {
    setComplaints(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  function updateMed(i: number, patch: Partial<MedRow>) {
    setMedications(prev => prev.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  }
  function updateProc(i: number, patch: Partial<ProcRow>) {
    setProcedures(prev => prev.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  }

  // Merge built-in medications with this dentist's previously-saved custom ones.
  const medicationSuggestions = useMemo(
    () => [...BUILTIN_MEDICATIONS, ...customMedicines],
    [customMedicines],
  )

  async function save() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    // Columns assumed on emr_records:
    //   patient_id, dentist_id, template_used, chief_complaints (jsonb), vitals (jsonb),
    //   diagnosis, medications (jsonb), procedures (jsonb), advice,
    //   follow_up_date, follow_up_notes
    const selectedTemplateName = templates.find(t => t.id === selectedTemplateId)?.name ?? null
    const payload = {
      patient_id: patientId,
      dentist_id: dentistId,
      template_used: selectedTemplateName,
      chief_complaints: complaints,
      vitals: {
        bp: vitals.bp || null,
        pulse: vitals.pulse ? Number(vitals.pulse) : null,
        spo2: vitals.spo2 ? Number(vitals.spo2) : null,
        weight_kg: vitals.weight_kg ? Number(vitals.weight_kg) : null,
        height_cm: vitals.height_cm ? Number(vitals.height_cm) : null,
      },
      diagnosis: diagnosis || null,
      medications: medications.filter(m => m.name.trim()),
      procedures: procedures
        .filter(p => p.name.trim())
        .map(p => ({ name: p.name, tooth_number: p.tooth_number || null, price: p.price ? Number(p.price) : null })),
      advice: advice || null,
      follow_up_date: followUpDate || null,
      follow_up_notes: followUpNotes || null,
    }
    const { error: insertError } = await supabase.from('emr_records').insert(payload)
    setSaving(false)
    if (insertError) { setError(insertError.message); return }

    // Silently persist any medication names the dentist typed that aren't already
    // in our built-in list or their existing custom list. Errors are swallowed —
    // a failed upsert here must not block the EMR save flow.
    try {
      const known = new Set(medicationSuggestions.map(s => s.toLowerCase()))
      const seen = new Set<string>()
      const newMeds: string[] = []
      for (const m of payload.medications) {
        const name = (m.name || '').trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (known.has(key) || seen.has(key)) continue
        seen.add(key)
        newMeds.push(name)
      }
      if (newMeds.length > 0) {
        const rows = newMeds.map(name => ({ dentist_id: dentistId, name }))
        await supabase.from('custom_medicines').upsert(rows, { onConflict: 'dentist_id,name', ignoreDuplicates: true })
      }
    } catch { /* swallow */ }

    router.push(`/for-dentists/dashboard/patients/${patientId}`)
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading patient…</p>
    </div>
  }
  if (!patient) return null

  const totalProcedureCost = procedures.reduce((sum, p) => sum + (Number(p.price) || 0), 0)

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href={`/for-dentists/dashboard/patients/${patientId}`}
          style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>← {patient.name}</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>New EMR Record</h1>
        {(patient.age || patient.gender) && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {[patient.age && `${patient.age} yrs`, patient.gender].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {/* Templates */}
      <div style={cardStyle}>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Quick Templates</span>
          <Link href="/for-dentists/dashboard/emr-templates"
            style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
            Manage templates →
          </Link>
        </div>
        {templates.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            No templates yet. <Link href="/for-dentists/dashboard/emr-templates" style={{ color: 'var(--blue)', fontWeight: 600 }}>Create one</Link> to speed up future EMR entries.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {templates.map(t => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                  style={{
                    padding: '8px 16px', minHeight: 40,
                    background: selectedTemplateId === t.id ? 'var(--blue)' : 'var(--bg)',
                    color: selectedTemplateId === t.id ? '#fff' : 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}>
                  {t.name}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              Templates pre-fill procedures, medications, and advice (if blank). Review and adjust before saving.
            </p>
          </>
        )}
      </div>

      {/* Chief Complaints */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Chief Complaints</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {COMPLAINT_CHIPS.map(c => {
            const on = complaints.includes(c)
            return (
              <button key={c} type="button" onClick={() => toggleComplaint(c)}
                style={{
                  padding: '8px 14px', minHeight: 40,
                  background: on ? 'var(--blue)' : '#fff',
                  color: on ? '#fff' : 'var(--text)',
                  border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                  borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                {on ? '✓ ' : ''}{c}
              </button>
            )
          })}
        </div>
      </div>

      {/* Vitals */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Vitals</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>BP <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(mmHg)</span></label>
            <input value={vitals.bp} onChange={e => setVitals(v => ({ ...v, bp: e.target.value }))}
              placeholder="120/80" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Pulse <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(bpm)</span></label>
            <input type="number" inputMode="numeric" value={vitals.pulse}
              onChange={e => setVitals(v => ({ ...v, pulse: e.target.value }))} placeholder="72" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>SpO₂ <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(%)</span></label>
            <input type="number" inputMode="numeric" value={vitals.spo2}
              onChange={e => setVitals(v => ({ ...v, spo2: e.target.value }))} placeholder="98" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Weight <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(kg)</span></label>
            <input type="number" inputMode="decimal" value={vitals.weight_kg}
              onChange={e => setVitals(v => ({ ...v, weight_kg: e.target.value }))} placeholder="70" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Height <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(cm)</span></label>
            <input type="number" inputMode="numeric" value={vitals.height_cm}
              onChange={e => setVitals(v => ({ ...v, height_cm: e.target.value }))} placeholder="175" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Diagnosis */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Diagnosis</div>
        <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
          rows={3} placeholder="Clinical diagnosis based on examination, history, and findings…"
          style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      {/* Medications */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Medications</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Medicine', 'Dosage', 'Frequency', 'Duration', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {medications.map((m, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <AutocompleteInput
                      value={m.name}
                      onChange={v => updateMed(i, { name: v })}
                      suggestions={medicationSuggestions}
                      placeholder="Amoxicillin 500mg"
                      style={inputStyle}
                      ariaLabel="Medicine name"
                    />
                  </td>
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
          style={{ marginTop: 10, fontSize: 13, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>+ Add medication</button>
      </div>

      {/* Procedures */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Procedures</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Procedure', 'Tooth #', 'Price (₹)', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {procedures.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <AutocompleteInput
                      value={p.name}
                      onChange={v => updateProc(i, { name: v })}
                      suggestions={PROCEDURE_SUGGESTIONS}
                      placeholder="Root Canal Treatment"
                      style={inputStyle}
                      ariaLabel="Procedure name"
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}><input value={p.tooth_number} onChange={e => updateProc(i, { tooth_number: e.target.value })} placeholder="36" style={inputStyle} /></td>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
          <button type="button" onClick={() => setProcedures(prev => [...prev, { name: '', tooth_number: '', price: '' }])}
            style={{ fontSize: 13, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600 }}>+ Add procedure</button>
          <div style={{ fontSize: 14, background: 'var(--bg)', padding: '8px 14px', borderRadius: 8 }}>
            Total: <strong>₹{totalProcedureCost.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      </div>

      {/* Advice */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Advice</div>
        <textarea value={advice} onChange={e => setAdvice(e.target.value)}
          rows={3} placeholder="Post-procedure care, dietary advice, oral hygiene instructions…"
          style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      {/* Follow-up */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Follow-up</div>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }} className="emr-followup-grid">
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)}
              placeholder="What to do next visit" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Save bar */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
          Save failed: {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 24 }}>
        <Link href={`/for-dentists/dashboard/patients/${patientId}`}
          style={{ padding: '11px 22px', minHeight: 44, display: 'inline-flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          Cancel
        </Link>
        <button type="button" onClick={save} disabled={saving}
          style={{ padding: '11px 24px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
          {saving ? 'Saving…' : 'Save EMR Record'}
        </button>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .emr-followup-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
