'use client'

// Interactive FDI tooth chart — the V2 dental chart that powers the
// "dental-chart" tab on the patient detail page. Differs from the older
// src/components/DentalChart.tsx in three ways:
//   1. Shape per tooth class (molar / premolar / canine / incisor) instead
//      of uniform rectangles, so the chart visually reads as an arch.
//   2. Modal condition selector with notes + treatment date + per-tooth
//      change history, instead of an inline panel.
//   3. View / Edit toggle plus a dedicated Print view (window.print() with
//      a print-only stylesheet) so the dentist can hand the patient a hard
//      copy in one click.
//
// Storage: rows in public.dental_charts, one per (patient_id, dentist_id),
// payload in `tooth_data` JSONB. The legacy DentalChart writes to
// `chart_data` on the same row — both columns coexist (see migration
// 20260522150000_dental_charts.sql). On save we UPSERT so the unique
// (patient_id, dentist_id) constraint keeps the row count at one.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionId =
  | 'healthy' | 'decay' | 'rct' | 'crown' | 'missing'
  | 'implant' | 'bridge' | 'fracture' | 'sensitivity'

export type ToothCondition = {
  tooth_number: number
  condition: ConditionId
  notes?: string
  treatment_date?: string
  // Append-only audit trail — every Save snapshot pushes a HistoryEntry so
  // the dentist can see "this 36 was healthy on Jan 3, became decay on
  // Feb 12, RCT done on Mar 4". Stored inside the tooth's JSON so we don't
  // need a separate dental_chart_events table.
  history?: HistoryEntry[]
}

export type HistoryEntry = {
  condition: ConditionId
  notes?: string
  treatment_date?: string
  recorded_at: string
}

type ToothMap = Record<string, ToothCondition>

interface Props {
  patientId: string
  dentistId: string
  // When true the chart is rendered without the Edit / Save controls — used
  // for read-only contexts (e.g. embedding inside a printable summary).
  readonly?: boolean
}

// ---------------------------------------------------------------------------
// Constants — FDI numbering + condition palette + tooth-class shapes
// ---------------------------------------------------------------------------

// FDI numbering: 1=upper-right, 2=upper-left, 3=lower-left, 4=lower-right.
// Order matters — the arrays are rendered left-to-right as the dentist
// faces the patient. UPPER_RIGHT shows centre→back (11..18) so that 11 sits
// adjacent to 21 in the midline.
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
const LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38]

const CONDITIONS: Array<{ id: ConditionId; label: string; color: string; symbol: string; description: string }> = [
  { id: 'healthy',     label: 'Healthy',          color: '#FFFFFF', symbol: '',  description: 'No condition recorded' },
  { id: 'decay',       label: 'Decay / Cavity',   color: '#DC2626', symbol: '●', description: 'Caries present' },
  { id: 'rct',         label: 'Root Canal Done',  color: '#F59E0B', symbol: '◎', description: 'Endodontic treatment completed' },
  { id: 'crown',       label: 'Crown',            color: '#3B82F6', symbol: '♛', description: 'Crown fitted' },
  { id: 'missing',     label: 'Missing / Extracted', color: '#9CA3AF', symbol: '✕', description: 'Tooth absent' },
  { id: 'implant',     label: 'Implant',          color: '#10B981', symbol: '⬡', description: 'Dental implant placed' },
  { id: 'bridge',      label: 'Bridge',           color: '#8B5CF6', symbol: '━', description: 'Part of a bridge' },
  { id: 'fracture',    label: 'Fracture',         color: '#F97316', symbol: '⚡', description: 'Tooth fractured' },
  { id: 'sensitivity', label: 'Sensitivity',      color: '#BAE6FD', symbol: '~', description: 'Reported sensitivity' },
]

const CONDITION_BY_ID: Record<ConditionId, typeof CONDITIONS[number]> =
  Object.fromEntries(CONDITIONS.map(c => [c.id, c])) as any

// Tooth class by FDI second digit. Mirrors textbook anatomy: 1-2 incisors,
// 3 canine, 4-5 premolars, 6-8 molars. Used to pick width/shape so the
// rendered arch isn't a uniform grid.
type ToothClass = 'incisor' | 'canine' | 'premolar' | 'molar'
function toothClass(n: number): ToothClass {
  const pos = n % 10
  if (pos <= 2) return 'incisor'
  if (pos === 3) return 'canine'
  if (pos <= 5) return 'premolar'
  return 'molar'
}

// Width per class — molars are widest, incisors narrowest. Heights are
// uniform so the arch reads as a clean band.
const CLASS_WIDTH: Record<ToothClass, number> = {
  molar: 42, premolar: 34, canine: 30, incisor: 26,
}

// ---------------------------------------------------------------------------
// Tooth — SVG-based to support real shapes (canines need a pointed tip,
// molars get rounded corners). One <Tooth> renders one box; the parent
// <ToothChart> composes them into the four quadrants.
// ---------------------------------------------------------------------------

function Tooth({
  number, condition, onClick, isUpper, readonly,
}: {
  number: number
  condition: ToothCondition | undefined
  onClick: () => void
  isUpper: boolean
  readonly: boolean
}) {
  const cls = toothClass(number)
  const cId = (condition?.condition ?? 'healthy') as ConditionId
  const meta = CONDITION_BY_ID[cId] ?? CONDITION_BY_ID.healthy
  const isMissing = cId === 'missing'
  const isHealthy = cId === 'healthy'

  const w = CLASS_WIDTH[cls]
  const h = 56
  const fill = isHealthy ? '#FFFFFF' : meta.color
  const stroke = isHealthy ? '#94A3B8' : meta.color
  const symbolColor = isHealthy
    ? '#94A3B8'
    : (cId === 'sensitivity' ? '#075985' : '#FFFFFF')

  // Per-class shape path. SVG path is drawn within a w×h viewbox; canines
  // taper to a point at the occlusal edge (the chewing surface), molars +
  // premolars are rounded rectangles, incisors are sharper rectangles.
  // `isUpper` flips the tip direction for canines so the crown points down
  // on the upper arch and up on the lower arch — the way a real mouth
  // looks when you open it.
  const path = (() => {
    const r = 4 // corner radius
    if (cls === 'canine') {
      // Pointed tip — apex on the occlusal edge.
      if (isUpper) {
        return `M ${r},0 H ${w - r} Q ${w},0 ${w},${r} V ${h * 0.55} L ${w / 2},${h} L 0,${h * 0.55} V ${r} Q 0,0 ${r},0 Z`
      }
      return `M 0,${h - r} L ${w / 2},0 L ${w},${h - r} V ${h - r} Q ${w},${h} ${w - r},${h} H ${r} Q 0,${h} 0,${h - r} Z`
    }
    if (cls === 'molar') {
      // Slightly wider at the occlusal edge to suggest the cusp face.
      return `M ${r},0 H ${w - r} Q ${w},0 ${w},${r} V ${h - r} Q ${w},${h} ${w - r},${h} H ${r} Q 0,${h} 0,${h - r} V ${r} Q 0,0 ${r},0 Z`
    }
    // Premolar + incisor — same rounded rectangle, only widths differ.
    return `M ${r},0 H ${w - r} Q ${w},0 ${w},${r} V ${h - r} Q ${w},${h} ${w - r},${h} H ${r} Q 0,${h} 0,${h - r} V ${r} Q 0,0 ${r},0 Z`
  })()

  return (
    <div
      onClick={readonly ? undefined : onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: readonly ? 'default' : 'pointer', gap: 3,
      }}
      title={`Tooth ${number}${condition ? ` — ${meta.label}` : ''}${condition?.notes ? `\n${condition.notes}` : ''}`}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="tooth-svg" style={{ opacity: isMissing ? 0.45 : 1 }}>
        <path d={path} fill={fill} stroke={stroke} strokeWidth={isHealthy ? 1.5 : 2} />
        {/* Symbol overlay — kept inside the shape so screenshots/PDFs read clearly */}
        {meta.symbol && !isHealthy && (
          <text x={w / 2} y={h / 2 + (cls === 'canine' && isUpper ? -3 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={cls === 'molar' ? 18 : 16} fontWeight={700}
            fill={symbolColor} style={{ pointerEvents: 'none' }}>
            {meta.symbol}
          </text>
        )}
        {/* Missing teeth get an X across the whole shape — overrides the symbol */}
        {isMissing && (
          <>
            <line x1={4} y1={4} x2={w - 4} y2={h - 4} stroke="#374151" strokeWidth={2} />
            <line x1={w - 4} y1={4} x2={4} y2={h - 4} stroke="#374151" strokeWidth={2} />
          </>
        )}
      </svg>
      <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{number}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ToothChart({ patientId, dentistId, readonly = false }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartId, setChartId] = useState<string | null>(null)
  const [tooth, setTooth] = useState<ToothMap>({})
  // Snapshot of saved state — Save button greys out until tooth diverges
  // from this, so a fresh dirty save is required before the dentist can
  // close the page assuming everything stuck.
  const [savedTooth, setSavedTooth] = useState<ToothMap>({})
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(!readonly)
  const [activeTooth, setActiveTooth] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('dental_charts')
          .select('id, tooth_data, updated_at')
          .eq('patient_id', patientId)
          .eq('dentist_id', dentistId)
          .maybeSingle()
        if (data) {
          setChartId(data.id)
          const td = (data.tooth_data ?? {}) as ToothMap
          setTooth(td)
          setSavedTooth(td)
          setUpdatedAt(data.updated_at ?? null)
        }
      } finally {
        setLoading(false)
      }
    }
    if (patientId && dentistId) load()
  }, [patientId, dentistId])

  const dirty = useMemo(() => JSON.stringify(tooth) !== JSON.stringify(savedTooth), [tooth, savedTooth])

  function openTooth(n: number) {
    if (!editMode) return
    setActiveTooth(n)
  }

  function applyCondition(n: number, condition: ConditionId, notes: string, treatmentDate: string) {
    setTooth(prev => {
      const existing = prev[String(n)]
      const newEntry: HistoryEntry = {
        condition,
        notes: notes || undefined,
        treatment_date: treatmentDate || undefined,
        recorded_at: new Date().toISOString(),
      }
      // Only push to history if the snapshot meaningfully changes.
      const lastInHistory = existing?.history?.[existing.history.length - 1]
      const sameAsLast = lastInHistory
        && lastInHistory.condition === condition
        && (lastInHistory.notes || undefined) === (notes || undefined)
        && (lastInHistory.treatment_date || undefined) === (treatmentDate || undefined)
      const history = sameAsLast
        ? existing!.history!
        : [...(existing?.history ?? []), newEntry]
      return {
        ...prev,
        [String(n)]: {
          tooth_number: n, condition,
          notes: notes || undefined,
          treatment_date: treatmentDate || undefined,
          history,
        },
      }
    })
    setActiveTooth(null)
  }

  function clearTooth(n: number) {
    setTooth(prev => {
      const next = { ...prev }
      delete next[String(n)]
      return next
    })
    setActiveTooth(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    // UPSERT against the (patient_id, dentist_id) unique constraint so we
    // don't have to branch on "did the row exist". onConflict targets the
    // composite key added by the migration.
    const { data, error: upErr } = await supabase
      .from('dental_charts')
      .upsert(
        { patient_id: patientId, dentist_id: dentistId, tooth_data: tooth },
        { onConflict: 'patient_id,dentist_id' }
      )
      .select('id, updated_at')
      .single()
    setSaving(false)
    if (upErr || !data) {
      setError(upErr?.message || 'Could not save chart.')
      return
    }
    setChartId(data.id)
    setSavedTooth(tooth)
    setUpdatedAt(data.updated_at ?? null)
  }

  function print() {
    // The print-only stylesheet (injected below) hides the page chrome and
    // expands the chart panel to full width before window.print() fires.
    window.print()
  }

  // Flat list of history entries across every tooth, newest first — feeds
  // the slide-out history panel.
  const flatHistory = useMemo(() => {
    const rows: Array<{ tooth: number; entry: HistoryEntry }> = []
    for (const t of Object.values(tooth)) {
      for (const e of (t.history ?? [])) rows.push({ tooth: t.tooth_number, entry: e })
    }
    return rows.sort((a, b) => b.entry.recorded_at.localeCompare(a.entry.recorded_at))
  }, [tooth])

  const recordedCount = Object.keys(tooth).length

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading dental chart…</div>
  }

  return (
    <div className="tooth-chart-root">
      {/* Print-only stylesheet. Scoped via @media print so it has zero
          effect on the live dashboard layout. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .tooth-chart-root, .tooth-chart-root * { visibility: visible; }
          .tooth-chart-root { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .tooth-chart-noprint { display: none !important; }
          .tooth-svg { page-break-inside: avoid; }
        }
        @keyframes toothchart-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .tooth-chart-modal { animation: toothchart-fade-in 120ms ease-out; }
      `}</style>

      {/* Top bar — view/edit toggle, save, print, history */}
      <div className="tooth-chart-noprint" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>🦷 Dental Chart (FDI)</h3>
        {updatedAt && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Updated {new Date(updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!readonly && (
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
            {[{ k: false, l: 'View' }, { k: true, l: 'Edit' }].map(opt => (
              <button key={String(opt.k)} onClick={() => setEditMode(opt.k)}
                style={{
                  padding: '6px 14px', border: 'none', borderRadius: 6,
                  background: editMode === opt.k ? '#fff' : 'transparent',
                  color: editMode === opt.k ? 'var(--blue)' : 'var(--muted)',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  boxShadow: editMode === opt.k ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}>
                {opt.l}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setHistoryOpen(true)} disabled={flatHistory.length === 0}
          style={btn('var(--bg)', 'var(--text)', flatHistory.length === 0)}>
          🕒 History ({flatHistory.length})
        </button>
        <button onClick={print} style={btn('var(--bg)', 'var(--text)')}>
          🖨 Print
        </button>
        {!readonly && editMode && (
          <button onClick={save} disabled={saving || !dirty}
            style={btn('var(--blue)', '#fff', saving || !dirty)}>
            {saving ? 'Saving…' : (dirty ? '💾 Save Chart' : '✓ Saved')}
          </button>
        )}
      </div>

      {error && (
        <div className="tooth-chart-noprint" style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Chart canvas */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 16px', overflowX: 'auto' }}>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>UPPER ARCH</div>
        <ArchRow numbers={[...UPPER_RIGHT, ...UPPER_LEFT]} isUpper tooth={tooth} onClick={openTooth} readonly={!editMode || readonly} midlineAfter={UPPER_RIGHT.length} />

        <div style={{ borderTop: '2px dashed #CBD5E1', margin: '14px 0 12px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '50%', top: -10, transform: 'translateX(-50%)', background: '#fff', padding: '0 10px', fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1 }}>
            PATIENT&apos;S LEFT ◀ ▶ PATIENT&apos;S RIGHT
          </span>
        </div>

        <ArchRow numbers={[...LOWER_RIGHT, ...LOWER_LEFT]} isUpper={false} tooth={tooth} onClick={openTooth} readonly={!editMode || readonly} midlineAfter={LOWER_RIGHT.length} />
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 8 }}>LOWER ARCH</div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14, padding: '10px 14px', background: 'var(--bg)', borderRadius: 10 }}>
        {CONDITIONS.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 16, height: 16, borderRadius: 3,
              background: c.id === 'healthy' ? '#FFFFFF' : c.color,
              border: c.id === 'healthy' ? '1.5px solid #94A3B8' : `1.5px solid ${c.color}`,
              color: c.id === 'sensitivity' ? '#075985' : '#fff', fontSize: 10, fontWeight: 700,
            }}>{c.symbol}</span>
            {c.label}
          </div>
        ))}
      </div>

      {/* Affected teeth summary */}
      {recordedCount > 0 && (
        <div style={{ marginTop: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Recorded conditions ({recordedCount})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.values(tooth)
              .sort((a, b) => a.tooth_number - b.tooth_number)
              .map(t => {
                const meta = CONDITION_BY_ID[t.condition] ?? CONDITION_BY_ID.healthy
                return (
                  <button key={t.tooth_number}
                    onClick={() => editMode && setActiveTooth(t.tooth_number)}
                    disabled={!editMode}
                    style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 12,
                      background: meta.color + '22', color: meta.color, fontWeight: 600,
                      border: `1px solid ${meta.color}66`, cursor: editMode ? 'pointer' : 'default',
                      fontFamily: 'var(--font-body)',
                    }}
                    title={t.notes || ''}>
                    #{t.tooth_number} {meta.label}{t.notes ? ` · ${t.notes}` : ''}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Modal condition picker */}
      {activeTooth !== null && (
        <ConditionModal
          toothNumber={activeTooth}
          current={tooth[String(activeTooth)]}
          onCancel={() => setActiveTooth(null)}
          onClear={() => clearTooth(activeTooth)}
          onApply={(condition, notes, date) => applyCondition(activeTooth, condition, notes, date)}
        />
      )}

      {/* History drawer */}
      {historyOpen && (
        <HistoryDrawer rows={flatHistory} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ArchRow({
  numbers, isUpper, tooth, onClick, readonly, midlineAfter,
}: {
  numbers: number[]
  isUpper: boolean
  tooth: ToothMap
  onClick: (n: number) => void
  readonly: boolean
  midlineAfter: number
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'flex-end' }}>
      {numbers.map((n, idx) => (
        <div key={n} style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Tooth number={n} condition={tooth[String(n)]} onClick={() => onClick(n)} isUpper={isUpper} readonly={readonly} />
          {idx === midlineAfter - 1 && <div style={{ width: 14 }} />}
        </div>
      ))}
    </div>
  )
}

function ConditionModal({
  toothNumber, current, onApply, onCancel, onClear,
}: {
  toothNumber: number
  current: ToothCondition | undefined
  onApply: (condition: ConditionId, notes: string, treatmentDate: string) => void
  onCancel: () => void
  onClear: () => void
}) {
  const [condition, setCondition] = useState<ConditionId>(current?.condition ?? 'decay')
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [treatmentDate, setTreatmentDate] = useState(current?.treatment_date ?? '')
  const cls = toothClass(toothNumber)

  return (
    <div onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div className="tooth-chart-modal" onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, maxWidth: 520, width: '100%',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}>
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: 'var(--blue-light)',
              color: 'var(--blue)', fontWeight: 800, fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{toothNumber}</div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Tooth {toothNumber}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{cls.charAt(0).toUpperCase() + cls.slice(1)}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8, letterSpacing: 0.4 }}>CONDITION</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 18 }}>
            {CONDITIONS.map(c => {
              const active = condition === c.id
              return (
                <button key={c.id} onClick={() => setCondition(c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px', minHeight: 44,
                    borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${active ? c.color : 'var(--border)'}`,
                    background: active ? c.color + (c.id === 'healthy' ? '' : '11') : '#fff',
                    fontFamily: 'var(--font-body)', textAlign: 'left',
                  }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                    background: c.id === 'healthy' ? '#fff' : c.color,
                    border: c.id === 'healthy' ? '1.5px solid #94A3B8' : 'none',
                    color: c.id === 'sensitivity' ? '#075985' : '#fff',
                    fontSize: 12, fontWeight: 700,
                  }}>{c.symbol}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{c.label}</div>
                  </div>
                </button>
              )
            })}
          </div>

          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, letterSpacing: 0.4 }}>NOTES <span style={{ fontWeight: 500 }}>(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="e.g. distal caries, plan for composite filling"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)', fontSize: 13,
              fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
              resize: 'vertical', marginBottom: 14,
            }} />

          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, letterSpacing: 0.4 }}>TREATMENT DATE <span style={{ fontWeight: 500 }}>(optional)</span></label>
          <input type="date" value={treatmentDate} onChange={e => setTreatmentDate(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)', fontSize: 13,
              fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
            }} />
        </div>

        <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          {current ? (
            <button onClick={onClear}
              style={{ padding: '9px 14px', minHeight: 40, background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Clear condition
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel}
              style={{ padding: '9px 18px', minHeight: 40, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Cancel
            </button>
            <button onClick={() => onApply(condition, notes, treatmentDate)}
              style={{ padding: '9px 20px', minHeight: 40, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryDrawer({
  rows, onClose,
}: {
  rows: Array<{ tooth: number; entry: HistoryEntry }>
  onClose: () => void
}) {
  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', zIndex: 100,
        display: 'flex', justifyContent: 'flex-end',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', width: 'min(440px, 100%)', height: '100vh',
          overflowY: 'auto', boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
        }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>🕒 Chart History</h3>
          <button onClick={onClose} aria-label="Close history"
            style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No history recorded yet. Conditions get added here automatically as you save chart changes.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: '8px 0', margin: 0 }}>
            {rows.map((r, idx) => {
              const meta = CONDITION_BY_ID[r.entry.condition] ?? CONDITION_BY_ID.healthy
              return (
                <li key={idx} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: 8,
                    background: meta.color === '#FFFFFF' ? 'var(--bg)' : meta.color,
                    border: meta.color === '#FFFFFF' ? '1.5px solid #94A3B8' : 'none',
                    color: meta.id === 'sensitivity' ? '#075985' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                  }}>{meta.symbol || '·'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Tooth #{r.tooth}</span>
                      <span style={{ fontSize: 12, color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Recorded {new Date(r.entry.recorded_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {r.entry.treatment_date && ` · Treatment date: ${new Date(r.entry.treatment_date).toLocaleDateString('en-IN')}`}
                    </div>
                    {r.entry.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, fontStyle: 'italic' }}>"{r.entry.notes}"</div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function btn(bg: string, color: string, disabled = false): React.CSSProperties {
  return {
    padding: '8px 14px', minHeight: 36, background: bg, color, border: 'none',
    borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1, fontFamily: 'var(--font-body)',
  }
}
