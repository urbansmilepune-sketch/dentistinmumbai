'use client'

// Monthly Profit & Loss statement. Sits alongside Engagement and Revenue
// & Reports as the third sub-tab of /dashboard/analytics. Pulls three
// data sources for the selected month:
//   - Paid invoices (from `invoices`)         → Income
//   - clinic_expenses                          → Expense lines by category
//   - staff_salaries                           → Staff Salaries line
//
// Income is split into Treatment vs Consultation by inspecting each
// invoice item's treatment_name (case-insensitive /consult/ matches the
// consultation bucket; everything else falls to treatment). Invoices with
// no items have their full total counted as treatment revenue.
//
// Mounted lazily by AnalyticsTabs — the data fetch fires only when the
// dentist clicks the P&L tab, so engagement-only visitors don't pay for
// the multi-table join.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const EXPENSE_LINES = [
  { key: 'rent_emi',      label: 'Rent / EMI' },
  { key: 'lab_work',      label: 'Lab Work'    },
  { key: 'equipment',     label: 'Equipment'   },
  { key: 'marketing',     label: 'Marketing'   },
  { key: 'utilities',     label: 'Utilities'   },
  { key: 'miscellaneous', label: 'Miscellaneous' },
] as const
type ExpenseKey = typeof EXPENSE_LINES[number]['key']

interface Expense { id: string; category: ExpenseKey; amount: number | string; expense_date: string }
interface Salary { id: string; net_payable: number | string; month: number; year: number }
interface InvoiceLite { id: string; total: number | string | null; items: any[] | null; payment_status: string | null; invoice_date: string }

function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function monthRangeIso(month: number, year: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { start, end }
}

export default function PLView() {
  const now = new Date()
  const [month, setMonth] = useState<number>(now.getMonth() + 1)
  const [year, setYear] = useState<number>(now.getFullYear())

  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [salaries, setSalaries] = useState<Salary[]>([])
  const [invoices, setInvoices] = useState<InvoiceLite[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { start, end } = monthRangeIso(month, year)
      const supabase = createClient()
      const [expRes, salRes, invRes] = await Promise.all([
        fetch(`/api/dentist/expenses?month=${month}&year=${year}`),
        fetch(`/api/dentist/salaries?month=${month}&year=${year}`),
        supabase.from('invoices')
          .select('id, total, items, payment_status, invoice_date')
          .gte('invoice_date', start)
          .lt('invoice_date', end),
      ])
      if (cancelled) return
      if (expRes.ok) setExpenses((await expRes.json()).expenses || [])
      if (salRes.ok) setSalaries((await salRes.json()).salaries || [])
      if (!invRes.error) setInvoices((invRes.data as InvoiceLite[]) || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [month, year])

  const income = useMemo(() => {
    let treatment = 0
    let consultation = 0
    for (const inv of invoices) {
      if ((inv.payment_status || '').toLowerCase() !== 'paid') continue
      const items = Array.isArray(inv.items) ? inv.items : []
      if (items.length === 0) {
        treatment += Number(inv.total || 0)
        continue
      }
      for (const it of items) {
        const name = String(it?.treatment_name ?? it?.description ?? '').toLowerCase()
        const amt = Number(it?.amount ?? 0)
        if (/consult/.test(name)) consultation += amt
        else treatment += amt
      }
    }
    return { treatment, consultation, total: treatment + consultation }
  }, [invoices])

  const expenseByCategory = useMemo(() => {
    const sums: Record<ExpenseKey, number> = {
      rent_emi: 0, lab_work: 0, equipment: 0, marketing: 0, utilities: 0, miscellaneous: 0,
    }
    for (const e of expenses) {
      if (sums[e.category] !== undefined) sums[e.category] += Number(e.amount || 0)
    }
    return sums
  }, [expenses])

  const salariesTotal = useMemo(
    () => salaries.reduce((acc, s) => acc + Number(s.net_payable || 0), 0),
    [salaries],
  )

  const totalCategoryExpenses = EXPENSE_LINES.reduce((acc, l) => acc + expenseByCategory[l.key], 0)
  const totalExpenses = salariesTotal + totalCategoryExpenses
  const netProfit = income.total - totalExpenses
  const margin = income.total > 0 ? (netProfit / income.total) * 100 : 0

  const yearChoices = [year - 2, year - 1, year, year + 1]

  return (
    <div>
      {/* Period picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <select value={month} onChange={e => setMonth(parseInt(e.target.value, 10))} style={selectStyle}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} style={selectStyle}>
          {yearChoices.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Profit &amp; Loss — {MONTHS[month - 1]} {year}
        </span>
      </div>

      {/* P&L Statement */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', maxWidth: 720 }}>
        <div style={{ padding: '20px 24px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20 }}>P&amp;L Statement</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{MONTHS[month - 1]} {year}</p>
        </div>

        {loading ? (
          <p style={{ padding: 24, color: 'var(--muted)' }}>Loading P&amp;L…</p>
        ) : (
          <>
            {/* INCOME */}
            <SectionHeader label="INCOME" />
            <Row label="Treatment Revenue"     value={income.treatment} />
            <Row label="Consultation Revenue"  value={income.consultation} />
            <Row label="Total Income" value={income.total} subtotal />

            {/* EXPENSES */}
            <SectionHeader label="EXPENSES" />
            <Row label="Staff Salaries" value={salariesTotal} />
            {EXPENSE_LINES.map(l => (
              <Row key={l.key} label={l.label} value={expenseByCategory[l.key]} />
            ))}
            <Row label="Total Expenses" value={totalExpenses} subtotal />

            {/* NET PROFIT */}
            <div style={{ borderTop: '2px solid var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '18px 24px' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>Net Profit</span>
              <span style={{
                fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22,
                color: netProfit >= 0 ? '#00A878' : '#EF4444',
              }}>
                {fmtINR(netProfit)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 24px 22px' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Profit Margin</span>
              <span style={{
                fontWeight: 700, fontSize: 14,
                color: margin >= 0 ? '#00A878' : '#EF4444',
              }}>
                {margin.toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>

      {!loading && income.total === 0 && totalExpenses === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14, maxWidth: 720 }}>
          No income or expenses recorded for {MONTHS[month - 1]} {year}. Add expenses on the{' '}
          <a href="/for-dentists/dashboard/expenses" style={{ color: 'var(--blue)' }}>Expenses page</a> or
          record paid invoices in <a href="/for-dentists/dashboard/billing" style={{ color: 'var(--blue)' }}>Billing</a>.
        </p>
      )}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '14px 24px 6px',
      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
      letterSpacing: '0.08em',
    }}>
      {label}
    </div>
  )
}

function Row({ label, value, subtotal }: { label: string; value: number; subtotal?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '10px 24px',
      borderTop: subtotal ? '1px solid var(--border)' : 'none',
      background: subtotal ? 'var(--bg)' : 'transparent',
    }}>
      <span style={{
        fontSize: subtotal ? 14 : 13,
        fontWeight: subtotal ? 700 : 500,
        color: subtotal ? 'var(--text)' : 'var(--text-secondary)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: subtotal ? 'var(--font-heading)' : 'var(--font-body)',
        fontWeight: subtotal ? 800 : 600,
        fontSize: subtotal ? 16 : 14,
        color: subtotal ? 'var(--text)' : 'var(--text)',
      }}>
        ₹{Math.round(value).toLocaleString('en-IN')}
      </span>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  minHeight: 40, padding: '8px 12px',
  borderRadius: 10, border: '1.5px solid var(--border)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
  background: '#fff',
}
