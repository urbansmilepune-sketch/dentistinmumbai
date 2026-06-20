'use client'

// Photorealistic 32-tooth FDI dental chart — the "Tooth Chart" sub-tab on the
// patient detail page. Replaces the earlier flat-rectangle chart that wrote a
// single JSONB blob to `dental_charts`. This version:
//   1. Renders anatomically distinct SVG shapes per tooth class (incisor /
//      canine / premolar / molar) with radial-gradient fills + highlights so
//      each tooth reads as a 3D object on the dark canvas.
//   2. Supports 19 clinical conditions, each with its own colour + gradient.
//   3. Persists one row per (patient, tooth, condition) in
//      public.dental_chart_entries (see migration 20260620120000) instead of a
//      single JSONB row, so conditions are queryable/reportable.
//
// Upper teeth (11-28) are drawn crown-down / root-up; lower teeth (31-48) are
// flipped so the crown points up — the way an open mouth presents to the
// dentist. Each arch is one horizontal row split at the midline, with the
// patient's right (the viewer's left) leading, matching how a dentist charts
// while facing the patient.
//
// Persistence: the component is self-contained — it loads existing rows on
// mount (unless `existingEntries` is supplied) and on Save replaces the
// patient+dentist's rows wholesale (delete-then-insert) so the table always
// mirrors the on-screen state, even when a tooth's condition changes (a plain
// upsert keyed on (patient,tooth,condition) would orphan the previous
// condition's row). An optional `onSave` callback fires with the saved rows.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export type ConditionId =
  | 'healthy' | 'caries' | 'rct' | 'crown' | 'missing' | 'implant'
  | 'bridge_abutment' | 'bridge_pontic' | 'fracture' | 'sensitivity'
  | 'abscess' | 'impacted' | 'partially_erupted' | 'wear_attrition'
  | 'erosion' | 'fluorosis' | 'hypoplasia' | 'mobility' | 'recession'

type ConditionMeta = { label: string; color: string; border: string; emoji: string }

const CONDITIONS: Record<ConditionId, ConditionMeta> = {
  healthy:           { label: 'Healthy',            color: '#F5F0E8', border: '#C8B89A', emoji: '✓'  },
  caries:            { label: 'Caries / Decay',     color: '#8B4513', border: '#5C2E0A', emoji: '●'  },
  rct:               { label: 'Root Canal (RCT)',   color: '#E8D5B7', border: '#B8860B', emoji: 'RC' },
  crown:             { label: 'Crown',              color: '#FFD700', border: '#B8860B', emoji: 'C'  },
  missing:           { label: 'Missing / Extracted',color: '#E0E0E0', border: '#9E9E9E', emoji: 'X'  },
  implant:           { label: 'Implant',            color: '#B0C4DE', border: '#4682B4', emoji: 'I'  },
  bridge_abutment:   { label: 'Bridge Abutment',    color: '#DEB887', border: '#8B6914', emoji: 'BA' },
  bridge_pontic:     { label: 'Bridge Pontic',      color: '#D2B48C', border: '#8B6914', emoji: 'BP' },
  fracture:          { label: 'Fracture / Crack',   color: '#FF6B6B', border: '#CC0000', emoji: '⚡' },
  sensitivity:       { label: 'Sensitivity',        color: '#87CEEB', border: '#4169E1', emoji: 'S'  },
  abscess:           { label: 'Abscess',            color: '#FF4500', border: '#8B0000', emoji: 'A'  },
  impacted:          { label: 'Impacted',           color: '#DDA0DD', border: '#800080', emoji: 'IM' },
  partially_erupted: { label: 'Partially Erupted',  color: '#98FB98', border: '#228B22', emoji: 'PE' },
  wear_attrition:    { label: 'Wear / Attrition',   color: '#D2691E', border: '#8B4513', emoji: 'W'  },
  erosion:           { label: 'Erosion',            color: '#FFA500', border: '#CC7000', emoji: 'E'  },
  fluorosis:         { label: 'Fluorosis',          color: '#F0FFF0', border: '#90EE90', emoji: 'FL' },
  hypoplasia:        { label: 'Hypoplasia',         color: '#FFFACD', border: '#DAA520', emoji: 'H'  },
  mobility:          { label: 'Mobility',           color: '#FFB6C1', border: '#FF1493', emoji: 'M'  },
  recession:         { label: 'Gum Recession',      color: '#FA8072', border: '#DC143C', emoji: 'GR' },
}

const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[]
const SEVERITIES = ['mild', 'moderate', 'severe'] as const
type Severity = typeof SEVERITIES[number]
// Tooth surfaces — Mesial / Occlusal (Incisal) / Distal / Buccal / Lingual.
const SURFACES = ['M', 'O', 'D', 'B', 'L'] as const

// ---------------------------------------------------------------------------
// FDI layout — one row per arch, split at the midline. Patient's right leads
// (viewer's left), matching a dentist facing the patient.
// ---------------------------------------------------------------------------

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
const LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38]

type ToothClass = 'incisor' | 'canine' | 'premolar' | 'molar'
function toothClass(n: number): ToothClass {
  const pos = n % 10
  if (pos <= 2) return 'incisor'
  if (pos === 3) return 'canine'
  if (pos <= 5) return 'premolar'
  return 'molar'
}

// ---------------------------------------------------------------------------
// Colour helpers — derive a light "specular" stop for each gradient so the
// crown looks lit from the upper-left.
// ---------------------------------------------------------------------------

function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------------------
// Tooth shapes — paths drawn crown-down / root-up in a 28×56 viewBox. `fill`
// is the radial-gradient url, `stroke` the condition border, `highlight` the
// specular sheen. (Taken from the brief's anatomy, recentred to 28 wide.)
// ---------------------------------------------------------------------------

type ShapeProps = { fill: string; stroke: string; highlight: string }

function IncisorShape({ fill, stroke, highlight }: ShapeProps) {
  return (
    <g>
      <path d="M14,2 Q12,0 10,8 Q8,20 12,28 Q14,32 16,28 Q20,20 18,8 Q16,0 14,2 Z"
        fill={fill} stroke={stroke} strokeWidth="0.5" opacity="0.7" />
      <rect x="6" y="28" width="16" height="20" rx="3" fill={fill} stroke={stroke} strokeWidth="1" />
      <rect x="8" y="30" width="5" height="14" rx="2" fill={highlight} opacity="0.4" />
    </g>
  )
}

function CanineShape({ fill, stroke, highlight }: ShapeProps) {
  return (
    <g>
      <path d="M14,0 Q11,0 9,10 Q7,24 12,34 Q14,38 16,34 Q21,24 19,10 Q17,0 14,0 Z"
        fill={fill} stroke={stroke} strokeWidth="0.5" opacity="0.7" />
      <path d="M6,34 Q6,28 14,24 Q22,28 22,34 L22,48 Q22,52 18,52 L10,52 Q6,52 6,48 Z"
        fill={fill} stroke={stroke} strokeWidth="1" />
      <path d="M8,34 Q10,30 14,27" stroke={highlight} strokeWidth="2" fill="none" opacity="0.5" />
    </g>
  )
}

function PremolarShape({ fill, stroke, highlight }: ShapeProps) {
  return (
    <g>
      <path d="M10,0 Q8,0 7,12 Q6,24 10,32 Q12,36 14,32 Z" fill={fill} stroke={stroke} strokeWidth="0.5" opacity="0.7" />
      <path d="M18,0 Q20,0 21,12 Q22,24 18,32 Q16,36 14,32 Z" fill={fill} stroke={stroke} strokeWidth="0.5" opacity="0.7" />
      <rect x="5" y="30" width="18" height="22" rx="4" fill={fill} stroke={stroke} strokeWidth="1" />
      <path d="M6,34 Q9,30 13,32 Q14,33 15,32 Q19,30 22,34" stroke={stroke} strokeWidth="0.8" fill="none" />
      <ellipse cx="10" cy="38" rx="2.5" ry="4" fill={highlight} opacity="0.35" />
    </g>
  )
}

function MolarShape({ fill, stroke, highlight }: ShapeProps) {
  return (
    <g>
      <path d="M8,0 Q6,0 5,10 Q4,20 8,28 Q10,32 12,28 Z" fill={fill} stroke={stroke} strokeWidth="0.5" opacity="0.7" />
      <path d="M14,0 Q13,0 12,14 Q11,24 14,30 Q16,30 17,24 Q20,14 19,0 Z" fill={fill} stroke={stroke} strokeWidth="0.5" opacity="0.7" />
      <path d="M20,0 Q22,0 23,10 Q24,20 20,28 Q18,32 16,28 Z" fill={fill} stroke={stroke} strokeWidth="0.5" opacity="0.7" />
      <rect x="3" y="26" width="22" height="22" rx="5" fill={fill} stroke={stroke} strokeWidth="1" />
      <line x1="14" y1="27" x2="14" y2="47" stroke={stroke} strokeWidth="0.6" opacity="0.4" />
      <line x1="4" y1="37" x2="24" y2="37" stroke={stroke} strokeWidth="0.6" opacity="0.4" />
      <ellipse cx="9" cy="32" rx="3" ry="3.5" fill={highlight} opacity="0.3" />
      <ellipse cx="19" cy="32" rx="3" ry="3.5" fill={highlight} opacity="0.3" />
    </g>
  )
}

function shapeFor(cls: ToothClass): (p: ShapeProps) => React.ReactElement {
  switch (cls) {
    case 'incisor': return IncisorShape
    case 'canine': return CanineShape
    case 'premolar': return PremolarShape
    case 'molar': return MolarShape
  }
}

// ---------------------------------------------------------------------------
// Shared <defs> — one radial gradient per condition plus the implant screw
// pattern. Rendered once into a 0×0 SVG; tooth SVGs reference these by url(#…)
// (gradient/pattern refs resolve document-wide, not per-SVG).
// ---------------------------------------------------------------------------

function ChartDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {CONDITION_IDS.map(id => {
          const c = CONDITIONS[id]
          return (
            <radialGradient key={id} id={`tc-${id}-grad`} cx="35%" cy="30%">
              <stop offset="0%" stopColor={lighten(c.color, 0.5)} />
              <stop offset="45%" stopColor={c.color} />
              <stop offset="100%" stopColor={c.border} />
            </radialGradient>
          )
        })}
        {/* Screw-thread texture for implants — diagonal hatch tinted to the
            implant's steel-blue border. */}
        <pattern id="tc-implant-screw" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
          <rect width="6" height="4" fill={CONDITIONS.implant.color} />
          <line x1="0" y1="1" x2="6" y2="1" stroke={CONDITIONS.implant.border} strokeWidth="1.1" />
          <line x1="0" y1="3" x2="6" y2="3" stroke={CONDITIONS.implant.border} strokeWidth="0.7" opacity="0.6" />
        </pattern>
      </defs>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// One tooth
// ---------------------------------------------------------------------------

function ToothCell({
  number, condition, isUpper, selected, readonly, onClick,
}: {
  number: number
  condition: ConditionId
  isUpper: boolean
  selected: boolean
  readonly: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const cls = toothClass(number)
  const meta = CONDITIONS[condition]
  const isMissing = condition === 'missing'
  const isImplant = condition === 'implant'
  const Shape = shapeFor(cls)

  const fill = `url(#tc-${condition}-grad)`
  const stroke = meta.border
  const highlight = '#FFFFFF'

  return (
    <button
      type="button"
      onClick={readonly ? undefined : onClick}
      className="tc-tooth"
      data-selected={selected ? 'true' : undefined}
      title={`Tooth ${number} — ${meta.label}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: selected ? 'rgba(0,137,123,0.30)' : 'transparent',
        border: selected ? '1px solid #00897B' : '1px solid transparent',
        borderRadius: 8, padding: '4px 2px', cursor: readonly ? 'default' : 'pointer',
        transition: 'all 0.15s', font: 'inherit',
      }}
    >
      {isUpper && <span style={{ fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>{number}</span>}
      <svg width={28} height={56} viewBox="0 0 28 56" style={{ display: 'block', opacity: isMissing ? 0.4 : 1 }}>
        <g transform={isUpper ? undefined : 'translate(0,56) scale(1,-1)'}>
          <Shape fill={fill} stroke={stroke} highlight={highlight} />
          {/* Implant: overlay the screw-thread texture down the root. */}
          {isImplant && (
            <rect x="9" y="2" width="10" height="26" rx="3" fill="url(#tc-implant-screw)" opacity="0.85" stroke={stroke} strokeWidth="0.5" />
          )}
        </g>
        {/* Missing: faded shape with an X, never a gap. Drawn upright (not
            flipped) so the X reads the same on both arches. */}
        {isMissing && (
          <>
            <line x1="6" y1="18" x2="22" y2="44" stroke="#6B7280" strokeWidth="2.5" />
            <line x1="22" y1="18" x2="6" y2="44" stroke="#6B7280" strokeWidth="2.5" />
          </>
        )}
      </svg>
      {!isUpper && <span style={{ fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>{number}</span>}
      {condition !== 'healthy' && !isMissing && (
        <span style={{
          fontSize: 8, lineHeight: 1, fontWeight: 800, color: '#fff',
          background: meta.border, borderRadius: 4, padding: '1px 3px', minWidth: 12, textAlign: 'center',
        }}>{meta.emoji}</span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Arch row
// ---------------------------------------------------------------------------

function ArchRow({
  numbers, isUpper, getCondition, selectedTooth, readonly, onToothClick,
}: {
  numbers: number[]
  isUpper: boolean
  getCondition: (n: number) => ConditionId
  selectedTooth: number | null
  readonly: boolean
  onToothClick: (n: number, e: React.MouseEvent) => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 2 }}>
      {numbers.map((n, idx) => (
        <div key={n} style={{ display: 'flex', alignItems: 'flex-end' }}>
          <ToothCell
            number={n}
            condition={getCondition(n)}
            isUpper={isUpper}
            selected={selectedTooth === n}
            readonly={readonly}
            onClick={(e) => onToothClick(n, e)}
          />
          {idx === numbers.length / 2 - 1 && (
            <div style={{ width: 14, alignSelf: 'stretch', borderRight: '1px dashed rgba(255,255,255,0.25)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Types + props
// ---------------------------------------------------------------------------

export type ToothEntry = {
  tooth_number: number
  condition: ConditionId
  surfaces?: string[]
  notes?: string | null
  severity?: Severity | null
}

interface Props {
  patientId: string
  dentistId: string
  patientName?: string
  dentistName?: string
  // Optional seed — when supplied the component skips its own initial load.
  existingEntries?: ToothEntry[]
  // Optional callback fired with the persisted rows after a successful save.
  onSave?: (entries: ToothEntry[]) => void
  readonly?: boolean
}

type EntryMap = Record<number, ToothEntry>

function normaliseEntries(rows: ToothEntry[]): EntryMap {
  const map: EntryMap = {}
  for (const r of rows) {
    if (r.condition === 'healthy') continue
    // One condition per tooth in the UI — last write wins if the table holds
    // several rows for a tooth.
    map[r.tooth_number] = {
      tooth_number: r.tooth_number,
      condition: r.condition,
      surfaces: r.surfaces ?? [],
      notes: r.notes ?? null,
      severity: r.severity ?? null,
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ToothChart({
  patientId, dentistId, patientName, dentistName,
  existingEntries, onSave, readonly = false,
}: Props) {
  const [loading, setLoading] = useState(!existingEntries)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [entries, setEntries] = useState<EntryMap>(() => existingEntries ? normaliseEntries(existingEntries) : {})
  const [savedEntries, setSavedEntries] = useState<EntryMap>(() => existingEntries ? normaliseEntries(existingEntries) : {})
  // Floating condition picker, anchored near the clicked tooth.
  const [picker, setPicker] = useState<{ tooth: number; top: number; left: number } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (existingEntries) return
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data, error: loadErr } = await supabase
          .from('dental_chart_entries')
          .select('tooth_number, condition, surfaces, notes, severity')
          .eq('patient_id', patientId)
          .eq('dentist_id', dentistId)
          .order('tooth_number')
        if (cancelled) return
        if (loadErr) { setError(loadErr.message); return }
        const map = normaliseEntries((data ?? []) as ToothEntry[])
        setEntries(map)
        setSavedEntries(map)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (patientId && dentistId) load()
    else setLoading(false)
    return () => { cancelled = true }
  }, [patientId, dentistId, existingEntries])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const dirty = useMemo(
    () => JSON.stringify(entries) !== JSON.stringify(savedEntries),
    [entries, savedEntries],
  )

  function getCondition(n: number): ConditionId {
    return entries[n]?.condition ?? 'healthy'
  }

  function openPicker(n: number, e: React.MouseEvent) {
    if (readonly) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const PICKER_W = 340
    const PICKER_H = 360
    // Prefer below the tooth; flip above if it would clip the viewport bottom.
    const below = rect.bottom + PICKER_H + 12 < window.innerHeight
    const top = below ? rect.bottom + 8 : Math.max(8, rect.top - PICKER_H - 8)
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - PICKER_W / 2),
      window.innerWidth - PICKER_W - 8,
    )
    setPicker({ tooth: n, top, left })
  }

  function setCondition(n: number, condition: ConditionId) {
    setEntries(prev => {
      if (condition === 'healthy') {
        const next = { ...prev }
        delete next[n]
        return next
      }
      const existing = prev[n]
      return {
        ...prev,
        [n]: {
          tooth_number: n,
          condition,
          surfaces: existing?.surfaces ?? [],
          notes: existing?.notes ?? null,
          severity: existing?.severity ?? null,
        },
      }
    })
  }

  function patchEntry(n: number, patch: Partial<ToothEntry>) {
    setEntries(prev => {
      const existing = prev[n]
      if (!existing) return prev
      return { ...prev, [n]: { ...existing, ...patch } }
    })
  }

  function clearTooth(n: number) {
    setEntries(prev => {
      const next = { ...prev }
      delete next[n]
      return next
    })
    setPicker(null)
  }

  function flashToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  async function save() {
    setSaving(true)
    setError(null)
    const rows: ToothEntry[] = Object.values(entries).map(e => ({
      tooth_number: e.tooth_number,
      condition: e.condition,
      surfaces: e.surfaces ?? [],
      notes: e.notes?.trim() ? e.notes.trim() : null,
      severity: e.severity ?? null,
    }))
    try {
      const supabase = createClient()
      // Replace the patient+dentist's rows wholesale so the table mirrors the
      // current chart exactly (handles condition changes + clears without
      // orphaning rows).
      const { error: delErr } = await supabase
        .from('dental_chart_entries')
        .delete()
        .eq('patient_id', patientId)
        .eq('dentist_id', dentistId)
      if (delErr) { setError(delErr.message); return }

      if (rows.length > 0) {
        const insertRows = rows.map(r => ({
          patient_id: patientId,
          dentist_id: dentistId,
          tooth_number: r.tooth_number,
          condition: r.condition,
          surfaces: r.surfaces,
          notes: r.notes,
          severity: r.severity,
        }))
        const { error: insErr } = await supabase.from('dental_chart_entries').insert(insertRows)
        if (insErr) { setError(insErr.message); return }
      }
      setSavedEntries(entries)
      onSave?.(rows)
      flashToast('Chart saved')
    } catch (e: any) {
      setError(e?.message || 'Could not save chart.')
    } finally {
      setSaving(false)
    }
  }

  const recorded = useMemo(
    () => Object.values(entries).sort((a, b) => a.tooth_number - b.tooth_number),
    [entries],
  )

  // "3 caries, 1 RCT, 2 crowns" — ordered by the CONDITIONS declaration.
  const summaryText = useMemo(() => {
    const counts: Partial<Record<ConditionId, number>> = {}
    for (const e of recorded) counts[e.condition] = (counts[e.condition] ?? 0) + 1
    const parts = CONDITION_IDS
      .filter(id => id !== 'healthy' && counts[id])
      .map(id => `${counts[id]} ${CONDITIONS[id].label.split(' / ')[0].toLowerCase()}`)
    return parts.join(', ')
  }, [recorded])

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const drName = dentistName
    ? (/^dr\.?\s/i.test(dentistName) ? dentistName : `Dr. ${dentistName}`)
    : null

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading dental chart…</div>
  }

  return (
    <div className="tc-root">
      <ChartDefs />
      <style>{`
        .tc-tooth:hover { background: rgba(255,255,255,0.10) !important; border-color: rgba(255,255,255,0.6) !important; }
        .tc-tooth[data-selected="true"]:hover { background: rgba(0,137,123,0.4) !important; }
        @keyframes tc-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .tc-picker { animation: tc-fade 110ms ease-out; }
        @media print {
          body * { visibility: hidden; }
          .tc-print, .tc-print * { visibility: visible; }
          .tc-print { position: absolute; left: 0; top: 0; width: 100%; }
          .tc-noprint { display: none !important; }
          .tc-canvas { box-shadow: none !important; }
          @page { size: landscape; margin: 12mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="tc-noprint" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>🦷 Dental Chart (FDI)</h3>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => window.print()} style={toolBtn('var(--bg)', 'var(--text)')}>🖨 Print Chart</button>
        {!readonly && (
          <button type="button" onClick={save} disabled={saving || !dirty} style={toolBtn('var(--blue)', '#fff', saving || !dirty)}>
            {saving ? 'Saving…' : (dirty ? '💾 Save Chart' : '✓ Saved')}
          </button>
        )}
      </div>

      {error && (
        <div className="tc-noprint" style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Dark chart canvas */}
      <div className="tc-print">
        <div className="tc-canvas" style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #0d2137 100%)',
          borderRadius: 16, padding: 24, userSelect: 'none',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, color: 'rgba(255,255,255,0.92)', fontSize: 13 }}>
            <span><strong style={{ color: '#fff' }}>Patient:</strong> {patientName || '—'}</span>
            <span><strong style={{ color: '#fff' }}>Date:</strong> {today}</span>
            <span><strong style={{ color: '#fff' }}>Dentist:</strong> {drName || '—'}</span>
          </div>

          {/* Upper arch */}
          <div style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>UPPER JAW (MAXILLA)</div>
          <ArchRow numbers={[...UPPER_RIGHT, ...UPPER_LEFT]} isUpper getCondition={getCondition} selectedTooth={picker?.tooth ?? null} readonly={readonly} onToothClick={openPicker} />

          {/* Arch gap */}
          <div style={{ height: 18, margin: '6px 0', borderTop: '1px dashed rgba(255,255,255,0.18)', borderBottom: '1px dashed rgba(255,255,255,0.18)' }} />

          {/* Lower arch */}
          <ArchRow numbers={[...LOWER_RIGHT, ...LOWER_LEFT]} isUpper={false} getCondition={getCondition} selectedTooth={picker?.tooth ?? null} readonly={readonly} onToothClick={openPicker} />
          <div style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', fontWeight: 700, letterSpacing: 1, marginTop: 6 }}>LOWER JAW (MANDIBLE)</div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            {CONDITION_IDS.map(id => (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'rgba(255,255,255,0.78)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: CONDITIONS[id].color, border: `1.5px solid ${CONDITIONS[id].border}`, flexShrink: 0 }} />
                {CONDITIONS[id].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Summary panel */}
      <div style={{ marginTop: 16, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: recorded.length ? 12 : 0, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>Chart Summary</strong>
          {recorded.length > 0
            ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{summaryText}</span>
            : <span style={{ fontSize: 12, color: 'var(--muted)' }}>All teeth healthy — tap a tooth to record a condition.</span>}
        </div>
        {recorded.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Tooth', 'Condition', 'Severity', 'Surfaces', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recorded.map(e => {
                  const meta = CONDITIONS[e.condition]
                  return (
                    <tr key={e.tooth_number}>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>#{e.tooth_number}</td>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: meta.color, border: `1.5px solid ${meta.border}` }} />
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', textTransform: 'capitalize' }}>{e.severity || '—'}</td>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>{e.surfaces && e.surfaces.length ? e.surfaces.join(', ') : '—'}</td>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{e.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating condition picker */}
      {picker && !readonly && (() => {
        const n = picker.tooth
        const entry = entries[n]
        const current = entry?.condition ?? 'healthy'
        return (
          <>
            {/* outside-click catcher */}
            <div className="tc-noprint" onClick={() => setPicker(null)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            <div
              className="tc-picker tc-noprint"
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed', top: picker.top, left: picker.left, width: 340, zIndex: 201,
                background: '#fff', borderRadius: 14, boxShadow: '0 18px 44px rgba(0,0,0,0.28)',
                border: '1px solid var(--border)', padding: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong style={{ fontSize: 14 }}>Tooth #{n} · {toothClass(n)}</strong>
                <button type="button" onClick={() => setPicker(null)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>

              {/* 4-col condition grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
                {CONDITION_IDS.map(id => {
                  const c = CONDITIONS[id]
                  const active = current === id
                  return (
                    <button key={id} type="button" onClick={() => setCondition(n, id)} title={c.label}
                      style={{
                        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                        padding: '8px 2px', borderRadius: 9, cursor: 'pointer', minHeight: 50,
                        background: c.color, color: '#222',
                        border: active ? '2.5px solid #00897B' : `1.5px solid ${c.border}`,
                        fontWeight: 700, fontSize: 11,
                      }}>
                      {active && <span style={{ position: 'absolute', top: 2, right: 3, fontSize: 10, color: '#00897B', fontWeight: 900 }}>✓</span>}
                      <span style={{ fontSize: 12 }}>{c.emoji}</span>
                      <span style={{ fontSize: 8.5, lineHeight: 1.1, textAlign: 'center', color: '#333' }}>{c.label.split(' / ')[0]}</span>
                    </button>
                  )
                })}
              </div>

              {/* Severity + surfaces + notes — only meaningful once a condition is set */}
              {current !== 'healthy' && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 5, letterSpacing: 0.3 }}>SEVERITY</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {SEVERITIES.map(s => {
                        const on = entry?.severity === s
                        return (
                          <button key={s} type="button" onClick={() => patchEntry(n, { severity: on ? null : s })}
                            style={{ flex: 1, padding: '6px 4px', borderRadius: 7, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer', fontFamily: 'var(--font-body)', border: on ? '2px solid var(--blue)' : '1px solid var(--border)', background: on ? 'var(--blue-light)' : '#fff', color: on ? 'var(--blue)' : 'var(--text)' }}>
                            {s}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 5, letterSpacing: 0.3 }}>SURFACES</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {SURFACES.map(sf => {
                        const on = entry?.surfaces?.includes(sf) ?? false
                        return (
                          <button key={sf} type="button"
                            onClick={() => patchEntry(n, { surfaces: on ? (entry?.surfaces ?? []).filter(x => x !== sf) : [...(entry?.surfaces ?? []), sf] })}
                            style={{ width: 34, padding: '6px 0', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', border: on ? '2px solid var(--blue)' : '1px solid var(--border)', background: on ? 'var(--blue-light)' : '#fff', color: on ? 'var(--blue)' : 'var(--text)' }}>
                            {sf}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <textarea
                    value={entry?.notes ?? ''}
                    onChange={e => patchEntry(n, { notes: e.target.value })}
                    rows={2} placeholder="Notes (optional)"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--font-body)', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => clearTooth(n)} disabled={!entry}
                  style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: entry ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', border: 'none', background: '#FEE2E2', color: '#991B1B', opacity: entry ? 1 : 0.5 }}>
                  Clear (Healthy)
                </button>
                <button type="button" onClick={() => setPicker(null)}
                  style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', border: 'none', background: 'var(--blue)', color: '#fff' }}>
                  Done
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* Toast */}
      {toast && (
        <div className="tc-noprint" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 300 }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

function toolBtn(bg: string, color: string, disabled = false): React.CSSProperties {
  return {
    padding: '8px 14px', minHeight: 36, background: bg, color, border: 'none',
    borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1, fontFamily: 'var(--font-body)',
  }
}
