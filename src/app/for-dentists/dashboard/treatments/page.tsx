'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Treatment {
  id: string
  name: string
  slug: string
  icon: string
}

interface DentistTreatment {
  id: string
  treatment_id: string
  fee_from: number | null
  fee_to: number | null
  duration_mins: number | null
  treatments: Treatment
}

export default function TreatmentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [allTreatments, setAllTreatments] = useState<Treatment[]>([])
  const [dentistTreatments, setDentistTreatments] = useState<DentistTreatment[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ fee_from: '', fee_to: '', duration_mins: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }

      const { data: dentist } = await supabase.from('dentists').select('id').eq('email', user.email).single()
      if (!dentist) return

      setDentistId(dentist.id)

      const [{ data: all }, { data: mine }] = await Promise.all([
        supabase.from('treatments').select('id, name, slug, icon').order('name'),
        supabase.from('dentist_treatments').select('id, treatment_id, fee_from, fee_to, duration_mins, treatments(id, name, slug, icon)').eq('dentist_id', dentist.id),
      ])

      setAllTreatments(all || [])
      setDentistTreatments((mine || []) as unknown as DentistTreatment[])
      setLoading(false)
    }
    load()
  }, [])

  const myTreatmentIds = dentistTreatments.map(dt => dt.treatment_id)

  async function addTreatment(treatment: Treatment) {
    setAdding(treatment.id)
    const supabase = createClient()
    const { data } = await supabase
      .from('dentist_treatments')
      .insert({ dentist_id: dentistId, treatment_id: treatment.id, fee_from: null, fee_to: null })
      .select('id, treatment_id, fee_from, fee_to, duration_mins, treatments(id, name, slug, icon)')
      .single()
    if (data) setDentistTreatments(prev => [...prev, data as DentistTreatment])
    setAdding(null)
  }

  async function removeTreatment(dtId: string) {
    setRemoving(dtId)
    const supabase = createClient()
    await supabase.from('dentist_treatments').delete().eq('id', dtId)
    setDentistTreatments(prev => prev.filter(dt => dt.id !== dtId))
    setRemoving(null)
  }

  async function saveFees(dtId: string) {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('dentist_treatments').update({
      fee_from: editForm.fee_from ? parseInt(editForm.fee_from) : null,
      fee_to: editForm.fee_to ? parseInt(editForm.fee_to) : null,
      duration_mins: editForm.duration_mins ? parseInt(editForm.duration_mins) : null,
    }).eq('id', dtId)
    setDentistTreatments(prev => prev.map(dt => dt.id === dtId ? {
      ...dt,
      fee_from: editForm.fee_from ? parseInt(editForm.fee_from) : null,
      fee_to: editForm.fee_to ? parseInt(editForm.fee_to) : null,
      duration_mins: editForm.duration_mins ? parseInt(editForm.duration_mins) : null,
    } : dt))
    setSaving(false); setEditingId(null)
  }

  function startEdit(dt: DentistTreatment) {
    setEditingId(dt.id)
    setEditForm({ fee_from: dt.fee_from?.toString() || '', fee_to: dt.fee_to?.toString() || '', duration_mins: dt.duration_mins?.toString() || '' })
  }

  const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Treatments & Fees</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Add your treatments and set fee ranges. Patients search by treatment — more treatments = more visibility.</p>
      </div>

      {/* Your treatments */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Your Treatments</h3>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{dentistTreatments.length} added</span>
        </div>

        {dentistTreatments.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🦷</div>
            <p>No treatments added yet. Add from the list below.</p>
          </div>
        ) : (
          dentistTreatments.map(dt => (
            <div key={dt.id} style={{ borderBottom: '1px solid var(--border)', padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{dt.treatments?.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{dt.treatments?.name}</span>

                {editingId === dt.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 90 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Fee from (₹)</div>
                      <input type="number" value={editForm.fee_from} onChange={e => setEditForm(f => ({ ...f, fee_from: e.target.value }))} placeholder="e.g. 5000" style={inputStyle} />
                    </div>
                    <div style={{ width: 90 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Fee to (₹)</div>
                      <input type="number" value={editForm.fee_to} onChange={e => setEditForm(f => ({ ...f, fee_to: e.target.value }))} placeholder="e.g. 15000" style={inputStyle} />
                    </div>
                    <div style={{ width: 80 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Duration (min)</div>
                      <input type="number" value={editForm.duration_mins} onChange={e => setEditForm(f => ({ ...f, duration_mins: e.target.value }))} placeholder="60" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => saveFees(dt.id)} disabled={saving} style={{ padding: '7px 14px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{saving ? '...' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '7px 10px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: dt.fee_from ? 'var(--blue)' : 'var(--muted)', fontWeight: dt.fee_from ? 600 : 400 }}>
                      {dt.fee_from && dt.fee_to ? `₹${dt.fee_from}–₹${dt.fee_to}` : dt.fee_from ? `From ₹${dt.fee_from}` : 'No fee set'}
                    </span>
                    <button onClick={() => startEdit(dt)} style={{ padding: '5px 10px', background: 'var(--bg)', color: 'var(--blue)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Edit fees</button>
                    <button onClick={() => removeTreatment(dt.id)} disabled={removing === dt.id} style={{ padding: '5px 10px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      {removing === dt.id ? '...' : 'Remove'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add treatments */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Add Treatments</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Click + to add to your profile</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, background: 'var(--border)' }}>
          {allTreatments.filter(t => !myTreatmentIds.includes(t.id)).map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fff', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{t.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</span>
              </div>
              <button
                onClick={() => addTreatment(t)} disabled={adding === t.id}
                style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--blue)', color: '#fff', border: 'none', cursor: adding === t.id ? 'not-allowed' : 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >{adding === t.id ? '…' : '+'}</button>
            </div>
          ))}
          {allTreatments.filter(t => !myTreatmentIds.includes(t.id)).length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', gridColumn: '1/-1', background: '#fff' }}>
              ✅ All available treatments added!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
