'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const totalMins = 6 * 60 + i * 30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const label = `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return { label, value }
})

const DEFAULT_HOURS = {
  mon: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  tue: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  wed: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  thu: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  fri: { is_open: true, open_time: '09:00', close_time: '19:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  sat: { is_open: true, open_time: '09:00', close_time: '14:00', has_break: false, break_start: '13:00', break_end: '14:00' },
  sun: { is_open: false, open_time: '09:00', close_time: '14:00', has_break: false, break_start: '13:00', break_end: '14:00' },
}

export default function WorkingHoursPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dentistId, setDentistId] = useState('')
  const [hours, setHours] = useState<Record<string, any>>(DEFAULT_HOURS)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }

      const { data: dentist } = await supabase
        .from('dentists')
        .select('id, working_hours')
        .eq('email', user.email)
        .single()

      if (dentist) {
        setDentistId(dentist.id)
        if (dentist.working_hours) setHours(dentist.working_hours)
      }
      setLoading(false)
    }
    load()
  }, [])

  function updateDay(day: string, field: string, value: any) {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setSaveError(null)
    const supabase = createClient()
    // .select() makes RLS denials observable. Without it, a denied write
    // returns no error AND no rows; the old code happily reported "Saved!"
    // while the DB was unchanged. With select, zero returned rows means
    // the write didn't land.
    const { data, error } = await supabase
      .from('dentists')
      .update({ working_hours: hours })
      .eq('id', dentistId)
      .select('id')
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    if (!data || data.length === 0) {
      setSaveError('Save failed — no row was updated. Check that you are signed in as the dentist whose hours you are editing.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function applyToAll(sourceDay: string) {
    const source = hours[sourceDay]
    const updated = { ...hours }
    DAYS.forEach(({ key }) => {
      if (key !== sourceDay) {
        updated[key] = { ...source, is_open: updated[key].is_open }
      }
    })
    setHours(updated)
  }

  const selectStyle = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
    fontSize: 13, fontFamily: 'var(--font-body)', background: '#fff',
    outline: 'none', cursor: 'pointer',
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Working Hours</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Set your clinic hours. Patients see Open Now / Closed status live.</p>
        </div>
        <button
          onClick={handleSave} disabled={saving}
          style={{ padding: '11px 24px', background: saved ? '#00A878' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.3s' }}
        >{saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Hours'}</button>
      </div>

      {saveError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700 }}>✕</button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
        {DAYS.map(({ key, label }, i) => (
          <div key={key} style={{ padding: '16px 20px', borderBottom: i < DAYS.length - 1 ? '1px solid var(--border)' : 'none', background: hours[key]?.is_open ? '#fff' : 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Day toggle */}
              <div style={{ width: 110, display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, flexShrink: 0 }}>
                  <input type="checkbox" checked={hours[key]?.is_open || false} onChange={e => updateDay(key, 'is_open', e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span onClick={() => updateDay(key, 'is_open', !hours[key]?.is_open)} style={{ position: 'absolute', inset: 0, background: hours[key]?.is_open ? 'var(--blue)' : '#CBD5E1', borderRadius: 22, cursor: 'pointer', transition: '0.3s' }}>
                    <span style={{ position: 'absolute', height: 16, width: 16, left: hours[key]?.is_open ? 20 : 3, bottom: 3, background: '#fff', borderRadius: '50%', transition: '0.3s' }} />
                  </span>
                </label>
                <span style={{ fontSize: 14, fontWeight: 600, color: hours[key]?.is_open ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
              </div>

              {hours[key]?.is_open ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select value={hours[key]?.open_time || '09:00'} onChange={e => updateDay(key, 'open_time', e.target.value)} style={selectStyle}>
                      {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>to</span>
                    <select value={hours[key]?.close_time || '19:00'} onChange={e => updateDay(key, 'close_time', e.target.value)} style={selectStyle}>
                      {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Lunch break toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={hours[key]?.has_break || false} onChange={e => updateDay(key, 'has_break', e.target.checked)} style={{ accentColor: 'var(--blue)', width: 14, height: 14 }} />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lunch break</span>
                  </div>

                  {hours[key]?.has_break && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select value={hours[key]?.break_start || '13:00'} onChange={e => updateDay(key, 'break_start', e.target.value)} style={{ ...selectStyle, fontSize: 12 }}>
                        {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>–</span>
                      <select value={hours[key]?.break_end || '14:00'} onChange={e => updateDay(key, 'break_end', e.target.value)} style={{ ...selectStyle, fontSize: 12 }}>
                        {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  )}

                  <button onClick={() => applyToAll(key)} style={{ fontSize: 11, color: 'var(--blue)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', padding: '4px 8px', borderRadius: 6, background: 'var(--blue-light)' }}>
                    Apply to all
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 500 }}>Closed</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Preview */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Preview — How patients see your hours</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DAYS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontWeight: 600, color: hours[key]?.is_open ? 'var(--text)' : '#EF4444' }}>
                {hours[key]?.is_open
                  ? `${hours[key].open_time} – ${hours[key].close_time}${hours[key].has_break ? ` (Break ${hours[key].break_start}–${hours[key].break_end})` : ''}`
                  : 'Closed'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

