'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const COMPLAINT_CHIPS = [
  'Tooth Decay', 'Sensitivity', 'Pain in tooth', 'Missing tooth', 'Broken tooth',
  'Swollen gum', 'Bleeding gum', 'Root canal', 'Crooked teeth', 'Jaw pain',
]

type MedRow = { name: string; dosage: string; frequency: string; duration: string }
type ProcRow = { name: string; tooth_number: string; price: string }

// Illustrative defaults — dentists should review medication dosing and procedure pricing
// for each clinic before relying on them.
const TEMPLATES: Record<string, { procedures: ProcRow[]; medications: MedRow[] }> = {
  'Full mouth implant': {
    procedures: [
      { name: 'Surgical implant placement', tooth_number: '', price: '25000' },
      { name: 'Bone grafting',              tooth_number: '', price: '15000' },
      { name: 'Abutment + crown',           tooth_number: '', price: '20000' },
    ],
    medications: [
      { name: 'Amoxicillin 500mg',         dosage: '500mg', frequency: '1-0-1',       duration: '7 days'  },
      { name: 'Ibuprofen 400mg',           dosage: '400mg', frequency: '1-1-1',       duration: '5 days'  },
      { name: 'Chlorhexidine mouthwash',   dosage: '10ml',  frequency: 'Twice daily', duration: '14 days' },
    ],
  },
  'RCT': {
    procedures: [
      { name: 'Root canal treatment',  tooth_number: '', price: '5000' },
      { name: 'Composite restoration', tooth_number: '', price: '1500' },
    ],
    medications: [
      { name: 'Amoxicillin 500mg',   dosage: '500mg', frequency: '1-0-1', duration: '5 days' },
      { name: 'Ibuprofen 400mg',     dosage: '400mg', frequency: '1-1-1', duration: '3 days' },
      { name: 'Metronidazole 400mg', dosage: '400mg', frequency: '1-0-1', duration: '5 days' },
    ],
  },
  'Wisdom tooth': {
    procedures: [
      { name: 'Surgical extraction (third molar)', tooth_number: '', price: '4500' },
    ],
    medications: [
      { name: 'Amoxicillin 500mg', dosage: '500mg', frequency: '1-0-1',       duration: '5 days' },
      { name: 'Ibuprofen 400mg',   dosage: '400mg', frequency: '1-1-1',       duration: '3 days' },
      { name: 'Betadine mouthwash', dosage: '10ml', frequency: 'Twice daily', duration: '5 days' },
    ],
  },
  'Implant': {
    procedures: [
      { name: 'Surgical implant placement', tooth_number: '', price: '25000' },
      { name: 'Abutment + crown',           tooth_number: '', price: '20000' },
    ],
    medications: [
      { name: 'Amoxicillin 500mg',       dosage: '500mg', frequency: '1-0-1',       duration: '7 days'  },
      { name: 'Ibuprofen 400mg',         dosage: '400mg', frequency: '1-1-1',       duration: '5 days'  },
      { name: 'Chlorhexidine mouthwash', dosage: '10ml',  frequency: 'Twice daily', duration: '14 days' },
    ],
  },
  'Perio': {
    procedures: [
      { name: 'Scaling and root planing (full mouth)', tooth_number: '', price: '3500' },
    ],
    medications: [
      { name: 'Amoxicillin 500mg',       dosage: '500mg', frequency: '1-0-1',       duration: '5 days'  },
      { name: 'Metronidazole 400mg',     dosage: '400mg', frequency: '1-0-1',       duration: '5 days'  },
      { name: 'Chlorhexidine mouthwash', dosage: '10ml',  frequency: 'Twice daily', duration: '14 days' },
    ],
  },
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

  const [template, setTemplate] = useState<string>('')
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

      const { data: p } = await supabase
        .from('patients').select('id, name, age, gender')
        .eq('id', patientId).eq('dentist_id', dentist.id).single()
      if (!p) { router.push('/for-dentists/dashboard/patients'); return }
      setPatient(p)
      setLoading(false)
    }
    load()
  }, [patientId, router])

  function applyTemplate(name: string) {
    const t = TEMPLATES[name]
    if (!t) return
    setTemplate(name)
    setProcedures(t.procedures.map(p => ({ ...p })))
    setMedications(t.medications.map(m => ({ ...m })))
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

  async function save() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    // Columns assumed on emr_records:
    //   patient_id, dentist_id, template_used, chief_complaints (jsonb), vitals (jsonb),
    //   diagnosis, medications (jsonb), procedures (jsonb), advice,
    //   follow_up_date, follow_up_notes
    const payload = {
      patient_id: patientId,
      dentist_id: dentistId,
      template_used: template || null,
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
        <div style={sectionTitle}>Quick Templates</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.keys(TEMPLATES).map(t => (
            <button key={t} type="button" onClick={() => applyTemplate(t)}
              style={{
                padding: '8px 16px', minHeight: 40,
                background: template === t ? 'var(--blue)' : 'var(--bg)',
                color: template === t ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>
              {t}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          Templates pre-fill procedures and medications. Review and adjust before saving.
        </p>
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
                  <td style={{ padding: '6px 8px' }}><input value={p.name} onChange={e => updateProc(i, { name: e.target.value })} placeholder="Root canal treatment" style={inputStyle} /></td>
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
