'use client'

// Revenue + operational reports for the practice. Distinct from
// /dashboard/analytics which focuses on patient-funnel engagement
// (profile views, WhatsApp clicks, call clicks). This page is for the
// clinic owner who wants daily / monthly P&L numbers, retention, and
// appointment-flow metrics.
//
// Data flow: a single useEffect fetches appointments + invoices + patients
// for the selected range; every section's tiles and charts derive from
// those three lists via useMemo. Changing the range refetches; the chart
// components don't re-render on tile re-derivations because they read the
// same memoized arrays.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, Legend,
} from 'recharts'

type RangeKey = 'today' | 'week' | 'month' | 'last_month' | 'custom'

const IST_TZ = 'Asia/Kolkata'

// en-CA returns YYYY-MM-DD which is the appt_date / invoice_date shape.
function istIso(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return istIso(shifted)
}

function rangeBounds(key: RangeKey, custom: { from: string; to: string }): { from: string; to: string; label: string } {
  const today = istIso(new Date())
  if (key === 'today') return { from: today, to: today, label: 'Today' }
  if (key === 'week') {
    // ISO week: Monday → Sunday. Convert today's IST date to a UTC Date
    // anchored at noon so the weekday calc isn't day-shifted by TZ.
    const [y, m, d] = today.split('-').map(Number)
    const anchor = new Date(Date.UTC(y, m - 1, d, 12))
    const dow = anchor.getUTCDay() || 7 // Sun=0 → 7
    const from = addDaysIso(today, -(dow - 1))
    const to = addDaysIso(from, 6)
    return { from, to, label: 'This Week' }
  }
  if (key === 'month') {
    const [y, m] = today.split('-').map(Number)
    const from = `${y}-${String(m).padStart(2, '0')}-01`
    // Last day of this month: day 0 of next month is the last day of this one.
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    return { from, to, label: 'This Month' }
  }
  if (key === 'last_month') {
    const [y, m] = today.split('-').map(Number)
    const lmY = m === 1 ? y - 1 : y
    const lm  = m === 1 ? 12   : m - 1
    const last = new Date(Date.UTC(lmY, lm, 0)).getUTCDate()
    return {
      from: `${lmY}-${String(lm).padStart(2, '0')}-01`,
      to:   `${lmY}-${String(lm).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      label: 'Last Month',
    }
  }
  return { from: custom.from, to: custom.to, label: 'Custom Range' }
}

interface Appt {
  id: string; appt_date: string; time_slot: string | null; status: string
  patient_id: string | null; patient_name: string | null
  treatment_id: string | null
  treatments: { name: string | null } | null
  created_at: string
}
interface Invoice {
  id: string; invoice_no: string | null; invoice_date: string; total: number | null
  payment_status: string | null; payment_method: string | null
  items: any[] | null
  patient_id: string | null
  created_at: string
}
interface Patient {
  id: string; name: string | null; phone: string | null
  created_at: string
}

const PALETTE = ['#0057A8', '#00A878', '#F59E0B', '#DC2626', '#7C3AED', '#0E7490', '#EC4899', '#84CC16', '#F97316']

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_COLORS: Record<string, string> = {
  pending:   '#F59E0B',
  confirmed: '#0057A8',
  completed: '#00A878',
  cancelled: '#DC2626',
  no_show:   '#6B7280',
}

function fmtINR(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

// CSV helper — JSON.stringify each cell so commas/quotes/newlines inside
// values can't corrupt the column layout.
function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) { alert('Nothing to export.'); return }
  const headers = Object.keys(rows[0])
  const escape = (v: any) => {
    if (v == null) return ''
    const s = String(v)
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const router = useRouter()
  const [dentistId, setDentistId] = useState('')
  const [dentistName, setDentistName] = useState('')
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<RangeKey>('month')
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => {
    const today = istIso(new Date())
    return { from: addDaysIso(today, -30), to: today }
  })
  const [appointments, setAppointments] = useState<Appt[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  // Patients table is queried unfiltered because retention math has to
  // know about patients who registered before the selected range but
  // came back during it.
  const [allPatientsByPhone, setAllPatientsByPhone] = useState<Map<string, string>>(new Map())

  const bounds = useMemo(() => rangeBounds(range, custom), [range, custom])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase
        .from('dentists').select('id, name, clinic_name').eq('email', user.email).maybeSingle()
      if (!dentist) { setLoading(false); return }
      setDentistId(dentist.id)
      setDentistName((dentist as any).clinic_name || dentist.name || '')

      const [{ data: appts }, { data: invs }, { data: pts }, { data: allPts }] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, appt_date, time_slot, status, patient_id, patient_name, treatment_id, treatments(name), created_at, patient_phone')
          .eq('dentist_id', dentist.id)
          .gte('appt_date', bounds.from)
          .lte('appt_date', bounds.to),
        supabase
          .from('invoices')
          .select('id, invoice_no, invoice_date, total, payment_status, payment_method, items, patient_id, created_at')
          .eq('dentist_id', dentist.id)
          .gte('invoice_date', bounds.from)
          .lte('invoice_date', bounds.to),
        supabase
          .from('patients')
          .select('id, name, phone, created_at')
          .eq('dentist_id', dentist.id)
          .gte('created_at', `${bounds.from}T00:00:00Z`)
          .lte('created_at', `${bounds.to}T23:59:59Z`),
        // All patients of this dentist — needed for retention. Slim columns.
        supabase
          .from('patients')
          .select('id, phone')
          .eq('dentist_id', dentist.id),
      ])
      setAppointments((appts ?? []) as unknown as Appt[])
      setInvoices((invs ?? []) as Invoice[])
      setPatients((pts ?? []) as Patient[])
      const m = new Map<string, string>()
      for (const p of (allPts ?? []) as Array<{ id: string; phone: string | null }>) {
        if (p.phone) m.set(p.phone.replace(/\D/g, ''), p.id)
      }
      setAllPatientsByPhone(m)
      setLoading(false)
    }
    load()
  }, [bounds.from, bounds.to, router])

  // ---- Derived metrics --------------------------------------------------

  const todayIso = useMemo(() => istIso(new Date()), [])

  // Daily summary — always today, even if a wider range is selected.
  // Pulled from the same fetched array; when range is today/week/month the
  // wider range still includes today, so we filter here.
  const daily = useMemo(() => {
    const todaysAppts = appointments.filter(a => a.appt_date === todayIso)
    const todaysInvs  = invoices.filter(i => i.invoice_date === todayIso)
    const todaysNewPatients = patients.filter(p => p.created_at.slice(0, 10) === todayIso)
    const todayRevenue = todaysInvs.filter(i => i.payment_status === 'paid')
      .reduce((s, i) => s + Number(i.total || 0), 0)
    const pendingPayments = invoices.filter(i => i.payment_status === 'pending' || i.payment_status === 'overdue')
      .reduce((s, i) => s + Number(i.total || 0), 0)
    return {
      apptCount: todaysAppts.length,
      revenue: todayRevenue,
      newPatients: todaysNewPatients.length,
      pendingPayments,
    }
  }, [appointments, invoices, patients, todayIso])

  // Revenue by week (within the selected range) — buckets by ISO week start.
  const revenueByWeek = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const inv of invoices) {
      if (inv.payment_status !== 'paid') continue
      // Group by Monday of the week containing invoice_date.
      const [y, m, d] = inv.invoice_date.split('-').map(Number)
      const anchor = new Date(Date.UTC(y, m - 1, d, 12))
      const dow = anchor.getUTCDay() || 7
      const monday = istIso(new Date(Date.UTC(y, m - 1, d - (dow - 1), 12)))
      buckets.set(monday, (buckets.get(monday) ?? 0) + Number(inv.total || 0))
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, revenue]) => ({
        week: new Date(weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        revenue,
      }))
  }, [invoices])

  // Treatment mix — count of completed/confirmed/pending appointments per
  // treatment name. cancelled/no_show excluded.
  const treatmentMix = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of appointments) {
      if (a.status === 'cancelled' || a.status === 'no_show') continue
      const name = a.treatments?.name || 'General consultation'
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [appointments])

  // Top treatments by REVENUE (separate from mix-by-count). Invoice items
  // are JSONB arrays where each entry has treatment_name + amount; some
  // legacy rows use `description` instead. We accept either.
  const topTreatmentsByRevenue = useMemo(() => {
    const sums = new Map<string, number>()
    for (const inv of invoices) {
      if (!Array.isArray(inv.items)) continue
      for (const item of inv.items as any[]) {
        const name = item?.treatment_name || item?.description || 'Other'
        const amount = Number(item?.amount ?? (Number(item?.quantity || 1) * Number(item?.unit_price || 0))) || 0
        sums.set(name, (sums.get(name) ?? 0) + amount)
      }
    }
    return Array.from(sums.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
  }, [invoices])

  // New vs returning split for appointments. "Returning" = this patient
  // has an appointment row dated BEFORE the appointment we're scoring.
  // We approximate using patient_id when present, else patient_phone.
  // Cheap O(n) pass after sorting by created_at.
  const newVsReturning = useMemo(() => {
    const seen = new Set<string>()
    let newCount = 0, returningCount = 0
    const sorted = [...appointments].sort((a, b) => a.appt_date.localeCompare(b.appt_date))
    for (const a of sorted) {
      const key = a.patient_id || (a as any).patient_phone || ''
      if (!key) { newCount++; continue }
      if (seen.has(key)) returningCount++
      else { newCount++; seen.add(key) }
    }
    return [
      { name: 'New', value: newCount },
      { name: 'Returning', value: returningCount },
    ]
  }, [appointments])

  // Average revenue per patient — paid invoices total / distinct patients
  // billed. Avoids dividing by a tiny denominator.
  const avgRevenuePerPatient = useMemo(() => {
    const paidByPatient = new Map<string, number>()
    for (const inv of invoices) {
      if (inv.payment_status !== 'paid') continue
      const key = inv.patient_id || 'unknown'
      paidByPatient.set(key, (paidByPatient.get(key) ?? 0) + Number(inv.total || 0))
    }
    if (paidByPatient.size === 0) return 0
    const total = Array.from(paidByPatient.values()).reduce((a, b) => a + b, 0)
    return total / paidByPatient.size
  }, [invoices])

  // Retention: patients in the full roster who have ≥2 appointments
  // ever, in this range. Distinct from "returning" above which counts
  // appointments not patients.
  const retention = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of appointments) {
      const k = a.patient_id || (a as any).patient_phone || ''
      if (!k) continue
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const totalDistinct = counts.size
    const returning = Array.from(counts.values()).filter(n => n >= 2).length
    const pct = totalDistinct > 0 ? Math.round((returning / totalDistinct) * 100) : 0
    return { totalDistinct, returning, pct }
  }, [appointments])

  // Patients overdue for recall — no appointment in the last 6 months.
  // Reads from the slim allPatientsByPhone roster + the entire appointments
  // table's most-recent visit per patient. The "last appointment ever"
  // lookup uses appointments fetched within the current range, plus a
  // separate cap; the simpler heuristic is "no row in the current range
  // for the patient". Good enough for a recall hit-list when range = "This
  // Month" or wider.
  const overdueForRecall = useMemo(() => {
    const seen = new Set<string>()
    for (const a of appointments) {
      const k = a.patient_id || ''
      if (k) seen.add(k)
    }
    let count = 0
    for (const pid of allPatientsByPhone.values()) {
      if (!seen.has(pid)) count++
    }
    return count
  }, [appointments, allPatientsByPhone])

  // Appointment status rates.
  const apptStats = useMemo(() => {
    const total = appointments.length
    const counts: Record<string, number> = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 }
    for (const a of appointments) {
      if (counts[a.status] != null) counts[a.status]++
    }
    const completion = total > 0 ? Math.round((counts.completed / total) * 100) : 0
    const cancellation = total > 0 ? Math.round((counts.cancelled / total) * 100) : 0
    const noShow = total > 0 ? Math.round((counts.no_show / total) * 100) : 0
    return { total, counts, completion, cancellation, noShow }
  }, [appointments])

  // Peak hours — appointments by start hour. Cancelled / no-show excluded
  // so the histogram reflects actual chairtime demand.
  const peakHours = useMemo(() => {
    const buckets = Array.from({ length: 14 }, (_, i) => ({ hour: `${9 + i}:00`, count: 0 }))
    for (const a of appointments) {
      if (a.status === 'cancelled' || a.status === 'no_show') continue
      if (!a.time_slot) continue
      const h = parseInt(a.time_slot.split(':')[0], 10)
      if (h >= 9 && h < 23) buckets[h - 9].count++
    }
    return buckets
  }, [appointments])

  // Busiest day-of-week.
  const dayOfWeek = useMemo(() => {
    const arr = DOW_LABELS.map(d => ({ day: d, count: 0 }))
    for (const a of appointments) {
      if (a.status === 'cancelled' || a.status === 'no_show') continue
      const [y, m, d] = a.appt_date.split('-').map(Number)
      const anchor = new Date(Date.UTC(y, m - 1, d, 12))
      arr[anchor.getUTCDay()].count++
    }
    return arr
  }, [appointments])

  // Financial summary.
  const finance = useMemo(() => {
    let gross = 0, paid = 0, outstanding = 0
    const method: Record<string, number> = { Cash: 0, UPI: 0, Card: 0, Online: 0, Other: 0 }
    for (const inv of invoices) {
      const total = Number(inv.total || 0)
      gross += total
      if (inv.payment_status === 'paid') {
        paid += total
        const m = inv.payment_method && method[inv.payment_method] != null ? inv.payment_method : 'Other'
        method[m] += total
      } else if (inv.payment_status === 'pending' || inv.payment_status === 'overdue') {
        outstanding += total
      }
    }
    const collectedPct = gross > 0 ? Math.round((paid / gross) * 100) : 0
    return { gross, paid, outstanding, collectedPct, method }
  }, [invoices])

  const paymentMethodPie = useMemo(() => {
    return Object.entries(finance.method)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
  }, [finance.method])

  // ---- Export helpers ----------------------------------------------------
  function exportDailyCsv() {
    downloadCsv(`daily-${todayIso}.csv`, [{
      date: todayIso,
      appointments: daily.apptCount,
      revenue: daily.revenue,
      new_patients: daily.newPatients,
      pending_payments: daily.pendingPayments,
    }])
  }
  function exportRevenueCsv() {
    downloadCsv(`revenue-${bounds.from}_to_${bounds.to}.csv`,
      revenueByWeek.map(r => ({ week_starting: r.week, revenue: r.revenue })))
  }
  function exportTreatmentsCsv() {
    downloadCsv(`treatments-${bounds.from}_to_${bounds.to}.csv`,
      topTreatmentsByRevenue.map(t => ({ treatment: t.name, revenue: t.revenue })))
  }
  function exportApptCsv() {
    downloadCsv(`appointments-${bounds.from}_to_${bounds.to}.csv`,
      appointments.map(a => ({
        date: a.appt_date, time: a.time_slot, status: a.status,
        patient: a.patient_name, treatment: a.treatments?.name || '',
      })))
  }
  function exportFinanceCsv() {
    downloadCsv(`invoices-${bounds.from}_to_${bounds.to}.csv`,
      invoices.map(i => ({
        invoice_no: i.invoice_no, date: i.invoice_date,
        total: i.total, status: i.payment_status, method: i.payment_method || '',
      })))
  }

  // PDF summary — opens a print-ready popup. Cleaner than fighting the
  // sidebar/chart layout's CSS for print media, and gives the dentist a
  // PDF via the OS print-to-PDF flow consistently across browsers.
  function downloadPdfSummary() {
    const w = window.open('', 'report-summary', 'width=900,height=1100')
    if (!w) return
    const html = `<!doctype html><html><head><title>Practice Report — ${bounds.label}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#0F1923}
  h1{font-size:20px;margin:0 0 4px}
  h2{font-size:14px;margin:18px 0 8px;color:#475569;text-transform:uppercase;letter-spacing:.05em}
  .meta{color:#64748B;font-size:13px;margin-bottom:18px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
  .tile{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px}
  .tile .l{font-size:11px;color:#64748B;text-transform:uppercase}
  .tile .v{font-size:18px;font-weight:700;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #E2E8F0;padding:6px 8px;text-align:left}
  thead{background:#F8FAFC}
  @media print{@page{size:A4;margin:14mm}}
</style></head><body>
  <h1>Practice Report — ${bounds.label}</h1>
  <div class="meta">${dentistName} · ${bounds.from} to ${bounds.to}</div>

  <h2>Daily Snapshot · ${todayIso}</h2>
  <div class="grid">
    <div class="tile"><div class="l">Appointments</div><div class="v">${daily.apptCount}</div></div>
    <div class="tile"><div class="l">Revenue</div><div class="v">${fmtINR(daily.revenue)}</div></div>
    <div class="tile"><div class="l">New patients</div><div class="v">${daily.newPatients}</div></div>
    <div class="tile"><div class="l">Pending payments</div><div class="v">${fmtINR(daily.pendingPayments)}</div></div>
  </div>

  <h2>Financial Summary</h2>
  <div class="grid">
    <div class="tile"><div class="l">Gross billed</div><div class="v">${fmtINR(finance.gross)}</div></div>
    <div class="tile"><div class="l">Collected</div><div class="v">${fmtINR(finance.paid)}</div></div>
    <div class="tile"><div class="l">Outstanding</div><div class="v">${fmtINR(finance.outstanding)}</div></div>
    <div class="tile"><div class="l">Collected %</div><div class="v">${finance.collectedPct}%</div></div>
  </div>

  <h2>Patient Analytics</h2>
  <div class="grid">
    <div class="tile"><div class="l">Active patients</div><div class="v">${allPatientsByPhone.size}</div></div>
    <div class="tile"><div class="l">New this range</div><div class="v">${patients.length}</div></div>
    <div class="tile"><div class="l">Retention</div><div class="v">${retention.pct}%</div></div>
    <div class="tile"><div class="l">Overdue for recall</div><div class="v">${overdueForRecall}</div></div>
  </div>

  <h2>Appointment Funnel</h2>
  <div class="grid">
    <div class="tile"><div class="l">Total</div><div class="v">${apptStats.total}</div></div>
    <div class="tile"><div class="l">Completion %</div><div class="v">${apptStats.completion}%</div></div>
    <div class="tile"><div class="l">Cancellation %</div><div class="v">${apptStats.cancellation}%</div></div>
    <div class="tile"><div class="l">No-show %</div><div class="v">${apptStats.noShow}%</div></div>
  </div>

  <h2>Top Treatments by Revenue</h2>
  <table>
    <thead><tr><th>Treatment</th><th style="text-align:right">Revenue</th></tr></thead>
    <tbody>
      ${topTreatmentsByRevenue.map(t => `<tr><td>${(t.name || '').replace(/</g,'&lt;')}</td><td style="text-align:right">${fmtINR(t.revenue)}</td></tr>`).join('')}
    </tbody>
  </table>

  <script>window.onload = () => window.print()</script>
</body></html>`
    w.document.write(html)
    w.document.close()
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading reports…</div>
  }

  return (
    <div>
      {/* Header + date filter + global exports */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Reports &amp; Analytics</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Revenue, treatment mix, retention, and appointment-flow metrics — {bounds.label.toLowerCase()} ({bounds.from} → {bounds.to})
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={downloadPdfSummary} style={primaryBtn}>🖨 PDF summary</button>
        </div>
      </div>

      {/* Range picker */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {([
          { k: 'today', label: 'Today' },
          { k: 'week', label: 'This Week' },
          { k: 'month', label: 'This Month' },
          { k: 'last_month', label: 'Last Month' },
          { k: 'custom', label: 'Custom' },
        ] as const).map(opt => (
          <button key={opt.k} onClick={() => setRange(opt.k)}
            style={{
              padding: '7px 14px', borderRadius: 20,
              background: range === opt.k ? 'var(--blue)' : '#fff',
              color:      range === opt.k ? '#fff' : 'var(--text)',
              border: `1.5px solid ${range === opt.k ? 'var(--blue)' : 'var(--border)'}`,
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer',
            }}>{opt.label}</button>
        ))}
        {range === 'custom' && (
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={custom.from} max={custom.to}
              onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
              style={dateInputStyle} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
            <input type="date" value={custom.to} min={custom.from}
              onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
              style={dateInputStyle} />
          </div>
        )}
      </div>

      {/* 1. DAILY SUMMARY */}
      <SectionHeader title="Daily Summary" subtitle={`Always today (${todayIso}) — independent of the range filter`} onExport={exportDailyCsv} />
      <div style={tileGrid}>
        <Tile label="Today's appointments" value={String(daily.apptCount)} icon="📅" />
        <Tile label="Today's revenue"       value={fmtINR(daily.revenue)} icon="💰" accent="#00A878" />
        <Tile label="New patients today"    value={String(daily.newPatients)} icon="👤" />
        <Tile label="Pending payments"      value={fmtINR(daily.pendingPayments)} icon="⏳" accent="#F59E0B" />
      </div>

      {/* 2. MONTHLY / RANGE REPORT */}
      <SectionHeader title={`Revenue Report · ${bounds.label}`} onExport={exportRevenueCsv} />
      <div style={twoCol}>
        <Card title="Revenue by week">
          {revenueByWeek.length === 0 ? <EmptyHint>No paid invoices in this range.</EmptyHint> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueByWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtINR(Number(v))} />
                <Bar dataKey="revenue" fill="#0057A8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Treatment mix">
          {treatmentMix.length === 0 ? <EmptyHint>No appointments in this range.</EmptyHint> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={treatmentMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {treatmentMix.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="New vs returning appointments">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={newVsReturning} dataKey="value" nameKey="name" outerRadius={80} label>
                <Cell fill="#0057A8" />
                <Cell fill="#00A878" />
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Avg revenue per paying patient">
          <BigStat value={fmtINR(avgRevenuePerPatient)} sub={`across ${invoices.filter(i => i.payment_status === 'paid').length} paid invoices`} />
        </Card>
      </div>

      <SectionHeader title="Top treatments by revenue" onExport={exportTreatmentsCsv} />
      <Card>
        {topTreatmentsByRevenue.length === 0 ? <EmptyHint>No invoiced items in this range.</EmptyHint> : (
          <ResponsiveContainer width="100%" height={Math.max(220, topTreatmentsByRevenue.length * 36)}>
            <BarChart data={topTreatmentsByRevenue} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
              <Tooltip formatter={(v: any) => fmtINR(Number(v))} />
              <Bar dataKey="revenue" fill="#00A878" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* 3. PATIENT ANALYTICS */}
      <SectionHeader title="Patient Analytics" subtitle="Roster size, retention, recall" />
      <div style={tileGrid}>
        <Tile label="Total active patients" value={String(allPatientsByPhone.size)} icon="👥" />
        <Tile label="New patients in range" value={String(patients.length)} icon="🆕" />
        <Tile label="Retention rate"        value={`${retention.pct}%`} icon="🔁"
              sub={`${retention.returning}/${retention.totalDistinct} returning`} />
        <Tile label="Overdue for recall"    value={String(overdueForRecall)} icon="📞"
              sub="no visit in this range" accent="#F59E0B" />
      </div>

      {/* 4. APPOINTMENT ANALYTICS */}
      <SectionHeader title="Appointment Analytics" onExport={exportApptCsv} />
      <div style={tileGrid}>
        <Tile label="Total appointments" value={String(apptStats.total)} icon="📅" />
        <Tile label="Completion rate"    value={`${apptStats.completion}%`} icon="✓" accent="#00A878" />
        <Tile label="Cancellation rate"  value={`${apptStats.cancellation}%`} icon="✕" accent="#DC2626" />
        <Tile label="No-show rate"       value={`${apptStats.noShow}%`} icon="⊘" accent="#6B7280" />
      </div>
      <div style={twoCol}>
        <Card title="Peak hours">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#7C3AED" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Busiest days of week">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dayOfWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0E7490" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* 5. FINANCIAL SUMMARY */}
      <SectionHeader title="Financial Summary" onExport={exportFinanceCsv} />
      <div style={tileGrid}>
        <Tile label="Gross billed"        value={fmtINR(finance.gross)} icon="📄" />
        <Tile label="Collected"           value={fmtINR(finance.paid)} icon="✅" accent="#00A878" />
        <Tile label="Outstanding"         value={fmtINR(finance.outstanding)} icon="⏳" accent="#F59E0B" />
        <Tile label="Collected vs billed" value={`${finance.collectedPct}%`} icon="📊" />
      </div>
      <Card title="Payment method breakdown">
        {paymentMethodPie.length === 0 ? <EmptyHint>No collected payments in this range yet.</EmptyHint> : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={paymentMethodPie} dataKey="value" nameKey="name" outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {paymentMethodPie.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtINR(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}

// ---- Layout primitives -----------------------------------------------------

function SectionHeader({ title, subtitle, onExport }: { title: string; subtitle?: string; onExport?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '24px 0 12px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {onExport && (
        <button onClick={onExport} style={ghostBtn}>⬇ CSV</button>
      )}
    </div>
  )
}

function Tile({ label, value, icon, sub, accent }: { label: string; value: string; icon: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: accent || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      {title && <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{title}</h3>}
      {children}
    </div>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{children}</div>
}

function BigStat({ value, sub }: { value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 200 }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, color: 'var(--blue)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const tileGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16,
}
const twoCol: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 16,
}
const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', background: 'var(--blue)', color: '#fff', border: 'none',
  borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px', background: '#fff', color: 'var(--blue)',
  border: '1px solid var(--blue)', borderRadius: 8, fontWeight: 600, fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--font-body)',
}
const dateInputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none',
}
