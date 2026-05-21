'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// FDI quadrants. The grid below renders upper jaw in patient-facing order
// (right-to-left across the screen) and lower jaw mirrored — same orientation
// the existing DentalChart component already uses.
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const ALL_TEETH = [...UPPER, ...LOWER]

// 3 measurement sites per surface: mesial / mid / distal.
const SITE_LABELS = ['M', 'C', 'D'] as const

// AAP-style pocket-depth thresholds. 1-3 healthy, 4-5 moderate, ≥6 severe.
// The same thresholds drive both per-cell coloring and the worst-PD
// summary on the tooth thumbnails.
function depthColor(d: number): string {
  if (!Number.isFinite(d) || d <= 0) return 'transparent'
  if (d <= 3) return '#00A878'
  if (d <= 5) return '#F59E0B'
  return '#DC2626'
}
function depthBg(d: number): string {
  if (!Number.isFinite(d) || d <= 0) return '#F1F5F9'
  if (d <= 3) return '#DCFCE7'
  if (d <= 5) return '#FEF3C7'
  return '#FEE2E2'
}

interface ToothMeasurement {
  buccal: number[]
  lingual: number[]
  bleeding_buccal: boolean[]
  bleeding_lingual: boolean[]
  recession: number[]
  mobility: number
  furcation: number
}
type Measurements = Record<string, ToothMeasurement>

interface ChartRow {
  id: string
  chart_date: string
  created_at: string
  measurements: Measurements
  notes: string | null
}

function blankTooth(): ToothMeasurement {
  return {
    buccal: [0, 0, 0],
    lingual: [0, 0, 0],
    bleeding_buccal: [false, false, false],
    bleeding_lingual: [false, false, false],
    recession: [0, 0, 0],
    mobility: 0,
    furcation: 0,
  }
}

// Tolerant reader — older rows (or hand-edited JSONB) may have shorter
// arrays or missing keys. We pad/coerce so the UI never crashes on a
// half-typed payload.
function readTooth(raw: any): ToothMeasurement {
  const num3 = (a: any) => {
    const arr = Array.isArray(a) ? a : []
    return [0, 1, 2].map(i => Number(arr[i]) || 0)
  }
  const bool3 = (a: any) => {
    const arr = Array.isArray(a) ? a : []
    return [0, 1, 2].map(i => Boolean(arr[i]))
  }
  return {
    buccal: num3(raw?.buccal),
    lingual: num3(raw?.lingual),
    bleeding_buccal: bool3(raw?.bleeding_buccal),
    bleeding_lingual: bool3(raw?.bleeding_lingual),
    recession: num3(raw?.recession),
    mobility: Math.max(0, Math.min(3, Number(raw?.mobility) || 0)),
    furcation: Math.max(0, Math.min(3, Number(raw?.furcation) || 0)),
  }
}

function readMeasurements(raw: any): Measurements {
  if (!raw || typeof raw !== 'object') return {}
  const out: Measurements = {}
  for (const key of Object.keys(raw)) out[key] = readTooth(raw[key])
  return out
}

// Worst pocket-depth across every site for a tooth — drives the thumbnail
// color and feeds the "severe sites" tally in the summary header.
function worstPdForTooth(m: ToothMeasurement | undefined): number {
  if (!m) return 0
  return Math.max(0, ...m.buccal, ...m.lingual)
}

interface Props {
  patientId: string
  dentistId: string
}

export default function PerioChart({ patientId, dentistId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The current chart being edited. New session = blank; existing latest
  // row = its measurements pre-loaded so a follow-up visit doesn't start
  // from scratch.
  const [measurements, setMeasurements] = useState<Measurements>({})
  const [notes, setNotes] = useState('')
  const [chartDate, setChartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [latestId, setLatestId] = useState<string | null>(null)
  const [previousChart, setPreviousChart] = useState<ChartRow | null>(null)
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [compareEnabled, setCompareEnabled] = useState(false)
  // True when the dentist has touched a measurement and hasn't saved yet.
  // Save flow inserts a NEW row each time (never updates) so each visit
  // becomes a comparable snapshot.
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('perio_charts')
        .select('id, chart_date, created_at, measurements, notes')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(2)
      if (cancelled) return
      const rows = (data ?? []) as ChartRow[]
      const latest = rows[0]
      const prev = rows[1] ?? null
      if (latest) {
        setLatestId(latest.id)
        setMeasurements(readMeasurements(latest.measurements))
        setNotes(latest.notes || '')
        setChartDate(latest.chart_date || new Date().toISOString().slice(0, 10))
      }
      setPreviousChart(prev ? { ...prev, measurements: readMeasurements(prev.measurements) } : null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [patientId])

  function getTooth(num: number): ToothMeasurement {
    return measurements[String(num)] ?? blankTooth()
  }

  function setTooth(num: number, next: ToothMeasurement) {
    setMeasurements(prev => ({ ...prev, [String(num)]: next }))
    setDirty(true)
  }

  function patchTooth(num: number, patch: Partial<ToothMeasurement>) {
    setTooth(num, { ...getTooth(num), ...patch })
  }

  async function saveChart() {
    setSaveError(null)
    setSaving(true)
    const supabase = createClient()
    // Always INSERT a new row — never UPDATE. That's the contract that lets
    // the Compare tab read the previous row as a frozen baseline. If a
    // dentist saves twice in the same minute we'll have two near-duplicate
    // rows; that's a tradeoff we accept for history fidelity.
    const { data, error } = await supabase
      .from('perio_charts')
      .insert({
        patient_id: patientId,
        dentist_id: dentistId,
        chart_date: chartDate,
        measurements,
        notes: notes.trim() || null,
      })
      .select('id, chart_date, created_at, measurements, notes')
      .single()
    setSaving(false)
    if (error || !data) {
      setSaveError(error?.message || 'Save failed — no row was returned. You may not have permission to write to this patient.')
      return
    }
    // Bring the just-saved row in as latest, and demote the previous latest
    // (if any) into the comparison slot. previousChart we held in state is
    // already the right row to demote into; if it's null we leave it null.
    if (latestId) {
      // We need to re-fetch the previous row that was latest before this save.
      // Simplest correct path: pull the second-most-recent row from the DB.
      const { data: prev } = await supabase
        .from('perio_charts')
        .select('id, chart_date, created_at, measurements, notes')
        .eq('patient_id', patientId)
        .neq('id', data.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setPreviousChart(prev ? { ...prev, measurements: readMeasurements(prev.measurements) } : null)
    }
    setLatestId(data.id)
    setDirty(false)
  }

  // Print a clean self-contained periodontal report in a new window so the
  // surrounding dashboard chrome (nav, side menu, tabs) doesn't bleed into
  // the printed page. Uses a small inline stylesheet so the popup doesn't
  // depend on the parent app's CSS load.
  function printReport() {
    const win = window.open('', 'perio-report', 'width=900,height=1100')
    if (!win) return
    const dateLabel = new Date(chartDate).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    const rowsHtml = ALL_TEETH.map(t => {
      const m = measurements[String(t)]
      if (!m) return ''
      const b = m.buccal, l = m.lingual, r = m.recession
      const bb = m.bleeding_buccal, bl = m.bleeding_lingual
      const dot = (on: boolean) => on ? '<span style="color:#DC2626">●</span>' : '<span style="color:#CBD5E1">○</span>'
      const cell = (v: number) => `<td style="background:${depthBg(v)};color:${depthColor(v) === 'transparent' ? '#94A3B8' : depthColor(v)};font-weight:600">${v || '-'}</td>`
      return `<tr>
        <td style="font-weight:700">${t}</td>
        ${b.map(cell).join('')}
        <td>${bb.map(dot).join(' ')}</td>
        ${l.map(cell).join('')}
        <td>${bl.map(dot).join(' ')}</td>
        ${r.map(cell).join('')}
        <td>${m.mobility}</td>
        <td>${m.furcation}</td>
      </tr>`
    }).filter(Boolean).join('')

    win.document.write(`<!doctype html><html><head><title>Periodontal Report — ${dateLabel}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0F1923; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #64748B; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #E2E8F0; padding: 6px 8px; text-align: center; }
  thead { background: #F8FAFC; }
  .group { background: #F1F5F9; font-weight: 700; }
  .notes { margin-top: 18px; padding: 12px; background: #F8FAFC; border-left: 3px solid #0057A8; font-size: 13px; }
  @media print { @page { size: A4 landscape; margin: 14mm } }
</style></head><body>
  <h1>Periodontal Charting Report</h1>
  <div class="meta">Date: ${dateLabel}</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Tooth</th>
        <th colspan="4">Buccal — Pocket Depth (M / C / D) + BOP</th>
        <th colspan="4">Lingual — Pocket Depth (M / C / D) + BOP</th>
        <th colspan="3">Recession (M / C / D)</th>
        <th rowspan="2">Mob</th>
        <th rowspan="2">Furc</th>
      </tr>
      <tr>
        <th>M</th><th>C</th><th>D</th><th>BOP</th>
        <th>M</th><th>C</th><th>D</th><th>BOP</th>
        <th>M</th><th>C</th><th>D</th>
      </tr>
    </thead>
    <tbody>
      <tr class="group"><td colspan="14">Upper</td></tr>
      ${ALL_TEETH.slice(0, UPPER.length).map(t => {
        const m = measurements[String(t)]
        if (!m) return ''
        const dot = (on: boolean) => on ? '<span style="color:#DC2626">●</span>' : '<span style="color:#CBD5E1">○</span>'
        const cell = (v: number) => `<td style="background:${depthBg(v)};color:${depthColor(v) === 'transparent' ? '#94A3B8' : depthColor(v)};font-weight:600">${v || '-'}</td>`
        return `<tr><td style="font-weight:700">${t}</td>${m.buccal.map(cell).join('')}<td>${m.bleeding_buccal.map(dot).join(' ')}</td>${m.lingual.map(cell).join('')}<td>${m.bleeding_lingual.map(dot).join(' ')}</td>${m.recession.map(cell).join('')}<td>${m.mobility}</td><td>${m.furcation}</td></tr>`
      }).filter(Boolean).join('')}
      <tr class="group"><td colspan="14">Lower</td></tr>
      ${ALL_TEETH.slice(UPPER.length).map(t => {
        const m = measurements[String(t)]
        if (!m) return ''
        const dot = (on: boolean) => on ? '<span style="color:#DC2626">●</span>' : '<span style="color:#CBD5E1">○</span>'
        const cell = (v: number) => `<td style="background:${depthBg(v)};color:${depthColor(v) === 'transparent' ? '#94A3B8' : depthColor(v)};font-weight:600">${v || '-'}</td>`
        return `<tr><td style="font-weight:700">${t}</td>${m.buccal.map(cell).join('')}<td>${m.bleeding_buccal.map(dot).join(' ')}</td>${m.lingual.map(cell).join('')}<td>${m.bleeding_lingual.map(dot).join(' ')}</td>${m.recession.map(cell).join('')}<td>${m.mobility}</td><td>${m.furcation}</td></tr>`
      }).filter(Boolean).join('')}
    </tbody>
  </table>
  ${notes.trim() ? `<div class="notes"><strong>Clinical notes:</strong><br/>${notes.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</div>` : ''}
  <script>window.onload = () => { window.print(); }</script>
</body></html>`)
    win.document.close()
  }

  // Sum of every probed site and how many cross each severity threshold —
  // surfaces in the header tiles so the dentist sees the broad picture
  // before diving into per-tooth detail.
  const summary = useMemo(() => {
    let probed = 0
    let mod = 0
    let severe = 0
    let bleedingSites = 0
    for (const m of Object.values(measurements)) {
      for (const v of m.buccal.concat(m.lingual)) {
        if (v > 0) probed++
        if (v >= 4 && v <= 5) mod++
        if (v >= 6) severe++
      }
      for (const b of m.bleeding_buccal.concat(m.bleeding_lingual)) if (b) bleedingSites++
    }
    const bopPct = probed > 0 ? Math.round((bleedingSites / probed) * 100) : 0
    return { probed, mod, severe, bleedingSites, bopPct }
  }, [measurements])

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--muted)', fontSize: 14, textAlign: 'center' }}>Loading periodontal chart…</div>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>🩸 Periodontal Charting</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Pocket depth, BOP, recession, mobility, furcation. Saving creates a new dated snapshot for comparison.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Chart date
            <input type="date" value={chartDate} onChange={e => { setChartDate(e.target.value); setDirty(true) }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none' }} />
          </label>
          {previousChart && (
            <button onClick={() => setCompareEnabled(c => !c)}
              style={{ padding: '7px 12px', background: compareEnabled ? 'var(--blue)' : '#fff', color: compareEnabled ? '#fff' : 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {compareEnabled ? '✓ Comparing' : '↔ Compare'}
            </button>
          )}
          <button onClick={printReport}
            style={{ padding: '7px 12px', background: '#fff', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            🖨 Print Report
          </button>
          <button onClick={saveChart} disabled={saving || !dirty}
            title={!dirty ? 'No unsaved changes' : 'Save as new dated snapshot'}
            style={{ padding: '7px 14px', background: dirty ? 'var(--blue)' : 'var(--bg)', color: dirty ? '#fff' : 'var(--muted)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: (saving || !dirty) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
            {saving ? 'Saving…' : dirty ? '💾 Save Snapshot' : 'Saved'}
          </button>
        </div>
      </div>

      {saveError && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{saveError}</div>
      )}

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <SummaryTile label="Probed sites"    value={String(summary.probed)} />
        <SummaryTile label="Moderate · 4–5mm" value={String(summary.mod)}    accent="#F59E0B" />
        <SummaryTile label="Severe · ≥6mm"    value={String(summary.severe)} accent="#DC2626" />
        <SummaryTile label="BOP %"            value={`${summary.bopPct}%`}   accent="#EF4444" />
        <SummaryTile label="Last chart"       value={previousChart ? new Date(previousChart.chart_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
      </div>

      {/* Tooth grid — click to drill in. Color of each thumbnail tracks the
          worst pocket depth observed for that tooth, with bleeding dots
          overlayed at the bottom. */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16, overflowX: 'auto' }}>
        <ArchRow title="Upper" teeth={UPPER} measurements={measurements} previousChart={compareEnabled ? previousChart : null} selected={selectedTooth} onPick={setSelectedTooth} />
        <div style={{ borderTop: '2px dashed #CBD5E1', margin: '12px 0', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '50%', top: -10, transform: 'translateX(-50%)', background: '#fff', padding: '0 8px', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>LEFT | RIGHT</span>
        </div>
        <ArchRow title="Lower" teeth={LOWER} measurements={measurements} previousChart={compareEnabled ? previousChart : null} selected={selectedTooth} onPick={setSelectedTooth} />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
        <LegendChip color="#00A878" label="1–3 mm · healthy" />
        <LegendChip color="#F59E0B" label="4–5 mm · moderate" />
        <LegendChip color="#DC2626" label="≥6 mm · severe" />
        <LegendChip color="#DC2626" label="● BOP positive" dot />
      </div>

      {/* Detail editor for the selected tooth */}
      {selectedTooth != null && (
        <ToothEditor
          tooth={selectedTooth}
          current={getTooth(selectedTooth)}
          previous={previousChart?.measurements?.[String(selectedTooth)]}
          showCompare={compareEnabled && !!previousChart}
          onChange={patch => patchTooth(selectedTooth, patch)}
          onClose={() => setSelectedTooth(null)}
        />
      )}

      {/* Clinical notes — single freeform field saved on the chart row */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Clinical notes for this snapshot</label>
        <textarea value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }}
          rows={3} placeholder="Diagnosis, calculus deposits, plaque index, supragingival vs subgingival findings, post-op instructions…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Sub-components

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: accent || 'var(--text)' }}>{value}</div>
    </div>
  )
}

function LegendChip({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {dot
        ? <span style={{ color, fontSize: 14 }}>●</span>
        : <span style={{ width: 12, height: 12, borderRadius: 3, background: color }} />}
      {label}
    </span>
  )
}

function ArchRow({ title, teeth, measurements, previousChart, selected, onPick }: {
  title: string
  teeth: number[]
  measurements: Measurements
  previousChart: ChartRow | null
  selected: number | null
  onPick: (n: number) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{title} jaw</div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'nowrap' }}>
        {teeth.map(t => {
          const m = measurements[String(t)]
          const worst = worstPdForTooth(m)
          const prev = previousChart?.measurements?.[String(t)]
          const prevWorst = worstPdForTooth(prev)
          // Worst-site delta vs previous chart — drives the tiny arrow on
          // top of the thumbnail when Compare is on.
          const delta = previousChart ? worst - prevWorst : 0
          const hasBop = m ? (m.bleeding_buccal.some(Boolean) || m.bleeding_lingual.some(Boolean)) : false
          const isSelected = selected === t
          const bg = worst > 0 ? depthBg(worst) : '#F1F5F9'
          const border = worst > 0 ? depthColor(worst) : '#CBD5E1'
          return (
            <button key={t} type="button" onClick={() => onPick(t)}
              title={`Tooth ${t}${worst > 0 ? ` · worst PD ${worst}mm` : ''}${hasBop ? ' · BOP+' : ''}`}
              style={{
                position: 'relative',
                width: 38, minHeight: 50, padding: '4px 2px',
                background: bg,
                border: `2px solid ${isSelected ? '#0057A8' : border}`,
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                fontFamily: 'var(--font-body)',
                boxShadow: isSelected ? '0 0 0 3px rgba(0,87,168,0.25)' : 'none',
              }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{t}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: worst > 0 ? depthColor(worst) : '#94A3B8' }}>
                {worst > 0 ? `${worst}` : '—'}
              </span>
              {previousChart && delta !== 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 9, fontWeight: 700, color: delta > 0 ? '#DC2626' : '#00A878' }}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
              {hasBop && (
                <span style={{ position: 'absolute', bottom: 2, color: '#DC2626', fontSize: 10, lineHeight: 1 }}>●</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ToothEditor({ tooth, current, previous, showCompare, onChange, onClose }: {
  tooth: number
  current: ToothMeasurement
  previous: ToothMeasurement | undefined
  showCompare: boolean
  onChange: (patch: Partial<ToothMeasurement>) => void
  onClose: () => void
}) {
  function updateArr<K extends 'buccal' | 'lingual' | 'recession'>(field: K, idx: number, value: number) {
    const next = [...current[field]]
    next[idx] = Math.max(0, Math.min(15, value))
    onChange({ [field]: next } as Partial<ToothMeasurement>)
  }
  function toggleBop(field: 'bleeding_buccal' | 'bleeding_lingual', idx: number) {
    const next = [...current[field]]
    next[idx] = !next[idx]
    onChange({ [field]: next } as Partial<ToothMeasurement>)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--blue)', borderRadius: 14, padding: 16, marginTop: 16, boxShadow: '0 4px 12px rgba(0,87,168,0.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>Tooth {tooth}</h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>✕</button>
      </div>

      <SiteRow label="Buccal" sites={current.buccal} bop={current.bleeding_buccal} prevSites={previous?.buccal} showCompare={showCompare}
        onDepth={(i, v) => updateArr('buccal', i, v)}
        onToggleBop={(i) => toggleBop('bleeding_buccal', i)} />

      <SiteRow label="Lingual" sites={current.lingual} bop={current.bleeding_lingual} prevSites={previous?.lingual} showCompare={showCompare}
        onDepth={(i, v) => updateArr('lingual', i, v)}
        onToggleBop={(i) => toggleBop('bleeding_lingual', i)} />

      {/* Recession — no BOP toggles attached; using the same 3-site cadence
          for visual parity with the depth rows above. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
        <span style={{ width: 80, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Recession</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 9, color: 'var(--muted)' }}>{SITE_LABELS[i]}</span>
              <input type="number" min={0} max={15} value={current.recession[i] || 0}
                onChange={e => updateArr('recession', i, parseInt(e.target.value) || 0)}
                style={{ width: 48, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, textAlign: 'center', fontFamily: 'var(--font-body)', outline: 'none' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobility + Furcation scale buttons */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <ScaleRow label="Mobility (0–3)" value={current.mobility}
          onChange={v => onChange({ mobility: v })} />
        <ScaleRow label="Furcation (0–3)" value={current.furcation}
          onChange={v => onChange({ furcation: v })} />
      </div>
    </div>
  )
}

function SiteRow({ label, sites, bop, prevSites, showCompare, onDepth, onToggleBop }: {
  label: string
  sites: number[]
  bop: boolean[]
  prevSites?: number[]
  showCompare: boolean
  onDepth: (i: number, v: number) => void
  onToggleBop: (i: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span style={{ width: 80, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => {
          const v = sites[i] || 0
          const prev = prevSites?.[i] ?? null
          const delta = showCompare && prev != null ? v - prev : null
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 9, color: 'var(--muted)' }}>{SITE_LABELS[i]}</span>
              <input type="number" min={0} max={15} value={v}
                onChange={e => onDepth(i, parseInt(e.target.value) || 0)}
                style={{
                  width: 48, padding: '6px 8px', borderRadius: 6,
                  border: `1.5px solid ${depthColor(v) === 'transparent' ? 'var(--border)' : depthColor(v)}`,
                  background: depthBg(v),
                  fontSize: 13, fontWeight: 700, textAlign: 'center',
                  fontFamily: 'var(--font-body)', outline: 'none',
                  color: depthColor(v) === 'transparent' ? 'var(--muted)' : depthColor(v),
                }} />
              {delta != null && delta !== 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: delta > 0 ? '#DC2626' : '#00A878' }}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>BOP</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <button key={i} type="button" onClick={() => onToggleBop(i)}
            title={bop[i] ? 'Bleeding on probing — click to clear' : 'No bleeding — click to mark'}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: bop[i] ? '#DC2626' : '#fff',
              border: `1.5px solid ${bop[i] ? '#DC2626' : 'var(--border)'}`,
              color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
            {bop[i] ? '●' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

function ScaleRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2, 3].map(v => {
          const on = value === v
          // 0 stays neutral; 1/2/3 escalate green→yellow→red.
          const tint = v === 0 ? '#94A3B8' : v === 1 ? '#00A878' : v === 2 ? '#F59E0B' : '#DC2626'
          return (
            <button key={v} type="button" onClick={() => onChange(v)}
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: on ? tint : '#fff',
                color: on ? '#fff' : tint,
                border: `1.5px solid ${tint}`,
                fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>{v}</button>
          )
        })}
      </div>
    </div>
  )
}
