'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// FDI tooth numbering system
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]

const CONDITIONS = [
  { id: 'healthy', label: 'Healthy', color: '#00A878' },
  { id: 'caries', label: 'Caries', color: '#EF4444' },
  { id: 'filled', label: 'Filled', color: '#3B82F6' },
  { id: 'crown', label: 'Crown', color: '#F59E0B' },
  { id: 'missing', label: 'Missing', color: '#6B7280' },
  { id: 'rct', label: 'RCT Done', color: '#8B5CF6' },
  { id: 'implant', label: 'Implant', color: '#0057A8' },
  { id: 'bridge', label: 'Bridge', color: '#EC4899' },
  { id: 'extraction', label: 'For Extraction', color: '#DC2626' },
  { id: 'fractured', label: 'Fractured', color: '#F97316' },
]

interface ToothCondition {
  tooth: number
  condition: string
  notes?: string
}

interface Props {
  patientId: string
  dentistId: string
  readonly?: boolean
}

export default function DentalChart({ patientId, dentistId, readonly = false }: Props) {
  const [chart, setChart] = useState<Record<number, ToothCondition>>({})
  const [selectedCondition, setSelectedCondition] = useState('caries')
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [toothNote, setToothNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [chartId, setChartId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('dental_charts')
        .select('*')
        .eq('patient_id', patientId)
        .single()
      if (data) {
        setChartId(data.id)
        setChart(data.chart_data || {})
      }
    }
    load()
  }, [patientId])

  async function handleToothClick(tooth: number) {
    if (readonly) return
    if (selectedTooth === tooth) {
      setSelectedTooth(null)
      return
    }
    setSelectedTooth(tooth)
    setToothNote(chart[tooth]?.notes || '')
  }

  async function applyCondition() {
    if (!selectedTooth) return
    const newChart = {
      ...chart,
      [selectedTooth]: { tooth: selectedTooth, condition: selectedCondition, notes: toothNote },
    }
    setChart(newChart)
    setSelectedTooth(null)
    setToothNote('')
    await saveChart(newChart)
  }

  async function saveChart(chartData: Record<number, ToothCondition>) {
    setSaving(true)
    const supabase = createClient()
    if (chartId) {
      await supabase.from('dental_charts').update({ chart_data: chartData }).eq('id', chartId)
    } else {
      const { data } = await supabase.from('dental_charts').insert({
        patient_id: patientId, dentist_id: dentistId, chart_data: chartData,
      }).select('id').single()
      if (data) setChartId(data.id)
    }
    setSaving(false)
  }

  function getToothColor(tooth: number): string {
    const condition = chart[tooth]?.condition
    if (!condition) return '#F1F5F9'
    return CONDITIONS.find(c => c.id === condition)?.color || '#F1F5F9'
  }

  function ToothButton({ number }: { number: number }) {
    const condition = chart[number]?.condition
    const color = getToothColor(number)
    const isSelected = selectedTooth === number
    const isMissing = condition === 'missing'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div
          onClick={() => handleToothClick(number)}
          title={`Tooth ${number}${condition ? ` — ${condition}` : ''}`}
          style={{
            width: 32, height: 38,
            background: color,
            border: `2px solid ${isSelected ? '#0057A8' : color === '#F1F5F9' ? '#CBD5E1' : color}`,
            borderRadius: 6,
            cursor: readonly ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: color === '#F1F5F9' ? '#94A3B8' : '#fff',
            boxShadow: isSelected ? '0 0 0 3px rgba(0,87,168,0.3)' : 'none',
            transition: 'all 0.15s',
            opacity: isMissing ? 0.3 : 1,
            textDecoration: isMissing ? 'line-through' : 'none',
            position: 'relative',
          }}
        >
          {condition && condition !== 'healthy' && !isMissing && (
            <span style={{ fontSize: 14 }}>
              {condition === 'caries' ? '●' : condition === 'filled' ? '■' : condition === 'crown' ? '♦' : condition === 'rct' ? '◎' : condition === 'implant' ? '⬡' : condition === 'bridge' ? '━' : condition === 'extraction' ? '✕' : condition === 'fractured' ? '⚡' : '●'}
            </span>
          )}
        </div>
        <span style={{ fontSize: 9, color: 'var(--muted)' }}>{number}</span>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>🦷 Dental Chart (FDI)</h3>
        {saving && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Saving...</span>}
      </div>

      {/* Condition selector */}
      {!readonly && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {CONDITIONS.map(c => (
            <button key={c.id} onClick={() => setSelectedCondition(c.id)}
              style={{ padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer', border: '2px solid', background: selectedCondition === c.id ? c.color : '#fff', color: selectedCondition === c.id ? '#fff' : c.color, borderColor: c.color, transition: 'all 0.15s' }}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Tooth apply panel */}
      {selectedTooth && !readonly && (
        <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>Tooth {selectedTooth}</span>
          <input value={toothNote} onChange={e => setToothNote(e.target.value)} placeholder="Notes (optional)" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, flex: 1, minWidth: 150, fontFamily: 'var(--font-body)', outline: 'none' }} />
          <button onClick={applyCondition} style={{ padding: '7px 16px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Apply {selectedCondition}</button>
          <button onClick={() => setSelectedTooth(null)} style={{ padding: '7px 10px', background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
        </div>
      )}

      {/* Tooth chart */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', overflowX: 'auto' }}>
        {/* Upper jaw */}
        <div style={{ marginBottom: 4, textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>UPPER JAW</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
          {UPPER_RIGHT.map(n => <ToothButton key={n} number={n} />)}
          <div style={{ width: 12 }} />
          {UPPER_LEFT.map(n => <ToothButton key={n} number={n} />)}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '2px dashed #CBD5E1', margin: '8px 0', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '50%', top: -10, transform: 'translateX(-50%)', background: '#fff', padding: '0 8px', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>LEFT | RIGHT</span>
        </div>

        {/* Lower jaw */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
          {LOWER_RIGHT.reverse().map(n => <ToothButton key={n} number={n} />)}
          <div style={{ width: 12 }} />
          {LOWER_LEFT.reverse().map(n => <ToothButton key={n} number={n} />)}
        </div>
        <div style={{ marginTop: 4, textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>LOWER JAW</div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        {CONDITIONS.filter(c => c.id !== 'healthy').map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} />
            {c.label}
          </div>
        ))}
      </div>

      {/* Affected teeth summary */}
      {Object.keys(chart).length > 0 && (
        <div style={{ marginTop: 14, background: 'var(--bg)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Chart Summary</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.values(chart).map(t => {
              const condColor = CONDITIONS.find(c => c.id === t.condition)?.color || '#6B7280'
              return (
                <div key={t.tooth} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: condColor + '20', color: condColor, fontWeight: 500 }}>
                  #{t.tooth} {t.condition}{t.notes ? ` (${t.notes})` : ''}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
