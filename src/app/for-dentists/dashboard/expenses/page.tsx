'use client'

// Expenses + Staff Salaries tracker — feeds the P&L view on
// /dashboard/analytics. Single page with two tabs:
//   1. Expenses        — CRUD against clinic_expenses, plus a category
//                        donut breakdown for the selected month.
//   2. Staff Salaries  — auto-populated from clinic_staff for the selected
//                        period. Each staff member shows their saved record
//                        if it exists, otherwise an "Add Salary" CTA.
//
// Income (paid invoices for the month) is read directly off Supabase via
// the user-bound client so we don't need a thin /income endpoint just for
// this page — RLS on the invoices table restricts to the session dentist's
// rows. Expenses and salaries go through their respective /api/dentist
// routes so the mutation paths share the same ownership checks.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { downloadSalarySlipPdf, type SalarySlip } from '@/lib/salarySlipPdf'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CATEGORIES = [
  { key: 'rent_emi',      label: 'Rent/EMI',      icon: '🏠', color: '#0057A8' },
  { key: 'utilities',     label: 'Utilities',     icon: '💡', color: '#0EA5E9' },
  { key: 'marketing',     label: 'Marketing',     icon: '📣', color: '#F59E0B' },
  { key: 'equipment',     label: 'Equipment',     icon: '🛠️', color: '#92400E' },
  { key: 'lab_work',      label: 'Lab Work',      icon: '🦷', color: '#7C3AED' },
  { key: 'miscellaneous', label: 'Miscellaneous', icon: '📌', color: '#64748B' },
] as const
type CategoryKey = typeof CATEGORIES[number]['key']
type FilterKey = 'all' | CategoryKey

const CATEGORY_META: Record<CategoryKey, { label: string; icon: string; color: string }> = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = { label: c.label, icon: c.icon, color: c.color }
  return acc
}, {} as Record<CategoryKey, { label: string; icon: string; color: string }>)

const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'] as const

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  associate_dentist: 'Associate Dentist',
  reception: 'Reception',
}

interface Expense {
  id: string
  category: CategoryKey
  description: string | null
  amount: number | string
  expense_date: string
  is_recurring: boolean
  payment_mode: string | null
  notes: string | null
  created_at: string
}

interface Salary {
  id: string
  staff_id: string
  month: number
  year: number
  basic_pay: number | string
  allowances: number | string
  bonus: number | string
  deductions: number | string
  net_payable: number | string
  status: 'pending' | 'paid' | string
  payment_mode: string | null
  paid_date: string | null
  notes: string | null
}

interface Staff {
  id: string
  email: string
  name: string
  role: string
  status: string
}

interface InvoiceLite {
  id: string
  total: number | string | null
  items: any[] | null
  payment_status: string | null
  invoice_date: string
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function monthRangeIso(month: number, year: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { start, end }
}

const blankExpenseForm = () => ({
  category: 'miscellaneous' as CategoryKey,
  description: '',
  amount: '',
  expense_date: todayIso(),
  is_recurring: false,
  payment_mode: 'Cash',
  notes: '',
})

const blankSalaryForm = () => ({
  basic_pay: '',
  allowances: '',
  bonus: '',
  deductions: '',
  notes: '',
})

export default function ExpensesPage() {
  const now = new Date()
  const [month, setMonth] = useState<number>(now.getMonth() + 1)
  const [year, setYear] = useState<number>(now.getFullYear())

  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [salaries, setSalaries] = useState<Salary[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [invoices, setInvoices] = useState<InvoiceLite[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const [tab, setTab] = useState<'expenses' | 'salaries'>('expenses')
  const [filter, setFilter] = useState<FilterKey>('all')

  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState(blankExpenseForm())
  const [expenseError, setExpenseError] = useState<string | null>(null)
  const [savingExpense, setSavingExpense] = useState(false)

  const [salaryModalStaff, setSalaryModalStaff] = useState<Staff | null>(null)
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null)
  const [salaryForm, setSalaryForm] = useState(blankSalaryForm())
  const [salaryError, setSalaryError] = useState<string | null>(null)
  const [savingSalary, setSavingSalary] = useState(false)

  const [payingSalary, setPayingSalary] = useState<Salary | null>(null)
  const [payForm, setPayForm] = useState({ payment_mode: 'Cash' as string, paid_date: todayIso() })
  const [payingBusy, setPayingBusy] = useState(false)

  async function loadAll() {
    setLoading(true)
    const { start, end } = monthRangeIso(month, year)
    const supabase = createClient()

    const [expRes, salRes, staffRes, invRes] = await Promise.all([
      fetch(`/api/dentist/expenses?month=${month}&year=${year}`),
      fetch(`/api/dentist/salaries?month=${month}&year=${year}`),
      fetch('/api/dentist/staff'),
      supabase.from('invoices')
        .select('id, total, items, payment_status, invoice_date')
        .gte('invoice_date', start)
        .lt('invoice_date', end),
    ])

    if (expRes.ok) setExpenses((await expRes.json()).expenses || [])
    if (salRes.ok) setSalaries((await salRes.json()).salaries || [])
    if (staffRes.ok) {
      const all = ((await staffRes.json()).staff || []) as Staff[]
      // 'removed' is already filtered server-side; keep invited + active so
      // a dentist can record a salary before the staff member accepts.
      setStaffList(all.filter(s => s.status !== 'removed'))
    }
    if (!invRes.error) setInvoices((invRes.data as InvoiceLite[]) || [])

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── DERIVED TOTALS ───────────────────────────────────────────────
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

  const expensesTotal = useMemo(
    () => expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0),
    [expenses],
  )
  const salariesTotal = useMemo(
    () => salaries.reduce((acc, s) => acc + Number(s.net_payable || 0), 0),
    [salaries],
  )
  const totalExpenses = expensesTotal + salariesTotal
  const netProfit = income.total - totalExpenses
  const profitMargin = income.total > 0 ? (netProfit / income.total) * 100 : 0

  // Category breakdown: row count + sum, plus a conic-gradient stop list
  // for the donut.
  const categoryBreakdown = useMemo(() => {
    const sums: Record<CategoryKey, number> = {
      rent_emi: 0, utilities: 0, marketing: 0, equipment: 0, lab_work: 0, miscellaneous: 0,
    }
    for (const e of expenses) {
      if (sums[e.category] !== undefined) sums[e.category] += Number(e.amount || 0)
    }
    const entries = (Object.keys(sums) as CategoryKey[])
      .map(k => ({ key: k, amount: sums[k], meta: CATEGORY_META[k] }))
      .filter(e => e.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    const total = entries.reduce((acc, e) => acc + e.amount, 0)
    const stops: string[] = []
    if (total > 0) {
      let acc = 0
      for (const e of entries) {
        const startDeg = (acc / total) * 360
        acc += e.amount
        const endDeg = (acc / total) * 360
        stops.push(`${e.meta.color} ${startDeg}deg ${endDeg}deg`)
      }
    }
    return {
      entries,
      total,
      donutBg: stops.length ? `conic-gradient(${stops.join(', ')})` : 'var(--bg)',
    }
  }, [expenses])

  const filteredExpenses = useMemo(
    () => filter === 'all' ? expenses : expenses.filter(e => e.category === filter),
    [expenses, filter],
  )

  const expenseCounts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: expenses.length, rent_emi: 0, utilities: 0, marketing: 0, equipment: 0, lab_work: 0, miscellaneous: 0,
    }
    for (const e of expenses) {
      if (c[e.category] !== undefined) c[e.category]++
    }
    return c
  }, [expenses])

  // Staff joined with their salary record for the selected period (if any).
  const salariesByStaff = useMemo(() => {
    const m = new Map<string, Salary>()
    for (const s of salaries) m.set(s.staff_id, s)
    return m
  }, [salaries])

  // ─── EXPENSE ACTIONS ──────────────────────────────────────────────
  function openAddExpense() {
    setEditingExpenseId(null)
    setExpenseForm(blankExpenseForm())
    setExpenseError(null)
    setShowExpenseModal(true)
  }
  function openEditExpense(e: Expense) {
    setEditingExpenseId(e.id)
    setExpenseError(null)
    setExpenseForm({
      category: e.category,
      description: e.description || '',
      amount: String(e.amount ?? ''),
      expense_date: e.expense_date,
      is_recurring: !!e.is_recurring,
      payment_mode: e.payment_mode || 'Cash',
      notes: e.notes || '',
    })
    setShowExpenseModal(true)
  }
  async function saveExpense() {
    setExpenseError(null)
    const amt = Number(expenseForm.amount)
    if (!Number.isFinite(amt) || amt <= 0) { setExpenseError('Amount must be a positive number.'); return }
    if (!expenseForm.expense_date) { setExpenseError('Date is required.'); return }
    setSavingExpense(true)
    const payload = {
      category: expenseForm.category,
      description: expenseForm.description.trim() || null,
      amount: amt,
      expense_date: expenseForm.expense_date,
      is_recurring: !!expenseForm.is_recurring,
      payment_mode: expenseForm.payment_mode.trim() || null,
      notes: expenseForm.notes.trim() || null,
    }
    const res = editingExpenseId
      ? await fetch(`/api/dentist/expenses/${editingExpenseId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/dentist/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setExpenseError(j?.error || 'Save failed'); setSavingExpense(false); return }
    setShowExpenseModal(false)
    setSavingExpense(false)
    await loadAll()
    setActionNotice(editingExpenseId ? 'Expense updated.' : 'Expense added.')
  }
  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    const res = await fetch(`/api/dentist/expenses/${id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setActionError(j?.error || 'Delete failed'); return }
    await loadAll()
    setActionNotice('Expense deleted.')
  }

  // ─── SALARY ACTIONS ───────────────────────────────────────────────
  function openAddSalary(staff: Staff) {
    setSalaryModalStaff(staff)
    setEditingSalary(null)
    setSalaryForm(blankSalaryForm())
    setSalaryError(null)
  }
  function openEditSalary(staff: Staff, salary: Salary) {
    setSalaryModalStaff(staff)
    setEditingSalary(salary)
    setSalaryError(null)
    setSalaryForm({
      basic_pay: String(salary.basic_pay ?? ''),
      allowances: String(salary.allowances ?? ''),
      bonus: String(salary.bonus ?? ''),
      deductions: String(salary.deductions ?? ''),
      notes: salary.notes || '',
    })
  }
  async function saveSalary() {
    setSalaryError(null)
    if (!salaryModalStaff) return
    const basic = Number(salaryForm.basic_pay || 0)
    const allow = Number(salaryForm.allowances || 0)
    const bonus = Number(salaryForm.bonus || 0)
    const ded = Number(salaryForm.deductions || 0)
    if (!Number.isFinite(basic) || basic < 0) { setSalaryError('Basic pay must be a non-negative number.'); return }
    for (const [n, v] of [['allowances', allow], ['bonus', bonus], ['deductions', ded]] as const) {
      if (!Number.isFinite(v) || v < 0) { setSalaryError(`${n} must be a non-negative number.`); return }
    }
    setSavingSalary(true)
    const payload = {
      basic_pay: basic, allowances: allow, bonus, deductions: ded,
      notes: salaryForm.notes.trim() || null,
    }
    const res = editingSalary
      ? await fetch(`/api/dentist/salaries/${editingSalary.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/dentist/salaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, staff_id: salaryModalStaff.id, month, year }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setSalaryError(j?.error || 'Save failed'); setSavingSalary(false); return }
    setSalaryModalStaff(null)
    setEditingSalary(null)
    setSavingSalary(false)
    await loadAll()
    setActionNotice(editingSalary ? 'Salary updated.' : 'Salary recorded.')
  }
  function openPay(salary: Salary) {
    setPayingSalary(salary)
    setPayForm({ payment_mode: salary.payment_mode || 'Cash', paid_date: todayIso() })
  }
  async function confirmPay() {
    if (!payingSalary) return
    setPayingBusy(true)
    const res = await fetch(`/api/dentist/salaries/${payingSalary.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid', payment_mode: payForm.payment_mode, paid_date: payForm.paid_date }),
    })
    const j = await res.json().catch(() => ({}))
    setPayingBusy(false)
    if (!res.ok) { setActionError(j?.error || 'Mark Paid failed'); return }
    setPayingSalary(null)
    await loadAll()
    setActionNotice('Salary marked as paid.')
  }
  async function downloadSlip(salaryId: string) {
    const res = await fetch(`/api/dentist/salaries/${salaryId}/slip`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setActionError(j?.error || 'Could not fetch slip')
      return
    }
    const j = await res.json()
    if (j?.slip) downloadSalarySlipPdf(j.slip as SalarySlip)
  }

  // ─── RENDER ───────────────────────────────────────────────────────
  const yearChoices = [year - 2, year - 1, year, year + 1]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Expenses & Payroll</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Track spend and staff salaries — feeds the P&amp;L view in Analytics.</p>
      </div>

      {/* Month / Year selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={month} onChange={e => setMonth(parseInt(e.target.value, 10))} style={selectStyle}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} style={selectStyle}>
          {yearChoices.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Showing {MONTHS[month - 1]} {year}
        </span>
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <SummaryCard label="Total Income" value={fmtINR(income.total)} accent="var(--blue)" loading={loading} />
        <SummaryCard label="Total Expenses" value={fmtINR(totalExpenses)} accent="#92400E" loading={loading} />
        <SummaryCard label="Net Profit" value={fmtINR(netProfit)} accent={netProfit >= 0 ? '#00A878' : '#EF4444'} loading={loading} />
        <SummaryCard label="Profit Margin" value={`${profitMargin.toFixed(1)}%`} accent={profitMargin >= 0 ? '#00A878' : '#EF4444'} loading={loading} />
      </div>

      {actionError && (
        <div style={noticeStyle('error')}>
          {actionError} <button onClick={() => setActionError(null)} style={noticeBtnStyle}>Dismiss</button>
        </div>
      )}
      {actionNotice && (
        <div style={noticeStyle('success')}>
          {actionNotice} <button onClick={() => setActionNotice(null)} style={noticeBtnStyle}>Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['expenses', 'salaries'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? 'var(--blue)' : 'var(--muted)',
              borderBottom: `2px solid ${tab === t ? 'var(--blue)' : 'transparent'}`,
            }}>
            {t === 'expenses' ? '💸 Expenses' : '👥 Staff Salaries'}
          </button>
        ))}
      </div>

      {tab === 'expenses' && (
        <>
          {/* Toolbar: Add + category pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <button onClick={openAddExpense} style={primaryBtnStyle}>+ Add Expense</button>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill on={filter === 'all'} onClick={() => setFilter('all')}>All ({expenseCounts.all})</Pill>
              {CATEGORIES.map(c => (
                <Pill key={c.key} on={filter === c.key} onClick={() => setFilter(c.key)}>
                  {c.icon} {c.label} ({expenseCounts[c.key]})
                </Pill>
              ))}
            </div>
          </div>

          {/* Expenses table */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
            {loading ? (
              <p style={{ padding: 24, color: 'var(--muted)' }}>Loading expenses…</p>
            ) : filteredExpenses.length === 0 ? (
              <p style={{ padding: 24, color: 'var(--muted)' }}>
                No expenses {filter === 'all' ? '' : `in ${CATEGORY_META[filter].label}`} for {MONTHS[month - 1]} {year}.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Category</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                      <th style={thStyle}>Payment</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map(e => {
                      const meta = CATEGORY_META[e.category]
                      return (
                        <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={tdStyle}>{fmtDate(e.expense_date)}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{e.description || <span style={{ color: 'var(--muted)' }}>—</span>}</span>
                              {e.is_recurring && <span title="Recurring" style={{ fontSize: 12 }}>🔄</span>}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, background: meta.color + '22', color: meta.color, fontSize: 12, fontWeight: 600 }}>
                              {meta.icon} {meta.label}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmtINR(Number(e.amount))}</td>
                          <td style={tdStyle}>{e.payment_mode || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <button onClick={() => openEditExpense(e)} style={ghostBtnStyle}>Edit</button>
                            <button onClick={() => deleteExpense(e.id)} style={{ ...ghostBtnStyle, color: '#EF4444', marginLeft: 6 }}>Delete</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Category breakdown */}
          {categoryBreakdown.total > 0 && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Category breakdown</h3>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Donut */}
                <div style={{
                  width: 160, height: 160, borderRadius: '50%',
                  background: categoryBreakdown.donutBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 96, height: 96, borderRadius: '50%', background: '#fff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>{fmtINR(categoryBreakdown.total)}</span>
                  </div>
                </div>
                {/* Legend */}
                <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {categoryBreakdown.entries.map(e => {
                    const pct = (e.amount / categoryBreakdown.total) * 100
                    return (
                      <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: e.meta.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13 }}>{e.meta.icon} {e.meta.label}</span>
                        <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 50, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{fmtINR(e.amount)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'salaries' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {loading ? (
            <p style={{ padding: 24, color: 'var(--muted)' }}>Loading salaries…</p>
          ) : staffList.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--muted)' }}>
              No staff yet. <a href="/for-dentists/dashboard/staff" style={{ color: 'var(--blue)' }}>Invite a staff member</a> to record their salary.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Staff</th>
                    <th style={thStyle}>Role</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Basic</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Allowances</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Bonus</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Deductions</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Net Payable</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map(staff => {
                    const sal = salariesByStaff.get(staff.id)
                    return (
                      <tr key={staff.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{staff.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{staff.email}</div>
                        </td>
                        <td style={tdStyle}>{ROLE_LABEL[staff.role] ?? staff.role}</td>
                        {sal ? (
                          <>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtINR(Number(sal.basic_pay))}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtINR(Number(sal.allowances))}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtINR(Number(sal.bonus))}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: Number(sal.deductions) > 0 ? '#991B1B' : 'var(--text)' }}>
                              {fmtINR(Number(sal.deductions))}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--blue)' }}>{fmtINR(Number(sal.net_payable))}</td>
                            <td style={tdStyle}>
                              {sal.status === 'paid' ? (
                                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#DCFCE7', color: '#166534', fontSize: 12, fontWeight: 700 }}>
                                  PAID {sal.paid_date ? `· ${fmtDate(sal.paid_date)}` : ''}
                                </span>
                              ) : (
                                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 700 }}>PENDING</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {sal.status !== 'paid' && (
                                <button onClick={() => openPay(sal)} style={primaryBtnStyle}>Mark Paid</button>
                              )}
                              <button onClick={() => openEditSalary(staff, sal)} style={{ ...ghostBtnStyle, marginLeft: 6 }}>Edit</button>
                              <button onClick={() => downloadSlip(sal.id)} style={{ ...ghostBtnStyle, marginLeft: 6 }}>📄 Slip</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={tdStyle} colSpan={6}>
                              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                                No salary recorded for {MONTHS[month - 1]} {year}.
                              </span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <button onClick={() => openAddSalary(staff)} style={primaryBtnStyle}>+ Add Salary</button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── EXPENSE MODAL ─────────────────────────────────────────── */}
      {showExpenseModal && (
        <Modal onClose={() => !savingExpense && setShowExpenseModal(false)}>
          <h2 style={modalTitleStyle}>{editingExpenseId ? 'Edit expense' : 'Add expense'}</h2>
          {expenseError && <div style={{ ...noticeStyle('error'), marginBottom: 12 }}>{expenseError}</div>}
          <Field label="Category *">
            <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value as CategoryKey }))} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <input value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. May rent, dental chair service" style={inputStyle} />
          </Field>
          <div style={twoColStyle}>
            <Field label="Amount (₹) *">
              <input value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} inputMode="decimal" placeholder="0" style={inputStyle} />
            </Field>
            <Field label="Date *">
              <input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
          <div style={twoColStyle}>
            <Field label="Payment mode">
              <select value={expenseForm.payment_mode} onChange={e => setExpenseForm(f => ({ ...f, payment_mode: e.target.value }))} style={inputStyle}>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Recurring?">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 10 }}>
                <input type="checkbox" checked={expenseForm.is_recurring} onChange={e => setExpenseForm(f => ({ ...f, is_recurring: e.target.checked }))} />
                <span style={{ fontSize: 13 }}>🔄 Repeats monthly</span>
              </label>
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={expenseForm.notes} onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </Field>
          <div style={modalActionsStyle}>
            <button onClick={() => setShowExpenseModal(false)} disabled={savingExpense} style={ghostBtnStyle}>Cancel</button>
            <button onClick={saveExpense} disabled={savingExpense} style={primaryBtnStyle}>{savingExpense ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* ─── SALARY MODAL ──────────────────────────────────────────── */}
      {salaryModalStaff && (
        <Modal onClose={() => !savingSalary && setSalaryModalStaff(null)}>
          <h2 style={modalTitleStyle}>
            {editingSalary ? 'Edit salary' : 'Add salary'} — {salaryModalStaff.name}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            For {MONTHS[month - 1]} {year}
          </p>
          {salaryError && <div style={{ ...noticeStyle('error'), marginBottom: 12 }}>{salaryError}</div>}
          <div style={twoColStyle}>
            <Field label="Basic Pay (₹) *">
              <input value={salaryForm.basic_pay} onChange={e => setSalaryForm(f => ({ ...f, basic_pay: e.target.value }))} inputMode="decimal" placeholder="0" style={inputStyle} />
            </Field>
            <Field label="Allowances (₹)">
              <input value={salaryForm.allowances} onChange={e => setSalaryForm(f => ({ ...f, allowances: e.target.value }))} inputMode="decimal" placeholder="0" style={inputStyle} />
            </Field>
          </div>
          <div style={twoColStyle}>
            <Field label="Bonus (₹)">
              <input value={salaryForm.bonus} onChange={e => setSalaryForm(f => ({ ...f, bonus: e.target.value }))} inputMode="decimal" placeholder="0" style={inputStyle} />
            </Field>
            <Field label="Deductions (₹)">
              <input value={salaryForm.deductions} onChange={e => setSalaryForm(f => ({ ...f, deductions: e.target.value }))} inputMode="decimal" placeholder="0" style={inputStyle} />
            </Field>
          </div>
          {/* Live net-payable preview so the dentist sees the math before saving */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Net payable</span>
            <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 18, color: 'var(--blue)' }}>
              {fmtINR(Number(salaryForm.basic_pay || 0) + Number(salaryForm.allowances || 0) + Number(salaryForm.bonus || 0) - Number(salaryForm.deductions || 0))}
            </strong>
          </div>
          <Field label="Notes">
            <textarea value={salaryForm.notes} onChange={e => setSalaryForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </Field>
          <div style={modalActionsStyle}>
            <button onClick={() => setSalaryModalStaff(null)} disabled={savingSalary} style={ghostBtnStyle}>Cancel</button>
            <button onClick={saveSalary} disabled={savingSalary} style={primaryBtnStyle}>{savingSalary ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* ─── MARK-PAID MODAL ───────────────────────────────────────── */}
      {payingSalary && (
        <Modal onClose={() => !payingBusy && setPayingSalary(null)}>
          <h2 style={modalTitleStyle}>Mark as paid</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            Net payable: <strong>{fmtINR(Number(payingSalary.net_payable))}</strong>
          </p>
          <div style={twoColStyle}>
            <Field label="Payment mode">
              <select value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value }))} style={inputStyle}>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Paid date">
              <input type="date" value={payForm.paid_date} onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
          <div style={modalActionsStyle}>
            <button onClick={() => setPayingSalary(null)} disabled={payingBusy} style={ghostBtnStyle}>Cancel</button>
            <button onClick={confirmPay} disabled={payingBusy} style={primaryBtnStyle}>{payingBusy ? 'Saving…' : 'Confirm Paid'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── SHARED BITS ──────────────────────────────────────────────────
function SummaryCard({ label, value, accent, loading }: { label: string; value: string; accent: string; loading: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: accent }}>
        {loading ? '…' : value}
      </div>
    </div>
  )
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 12px',
      border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
      background: on ? 'var(--blue-light)' : '#fff',
      color: on ? 'var(--blue)' : 'var(--text-secondary)',
      borderRadius: 999,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      fontFamily: 'var(--font-body)',
    }}>
      {children}
    </button>
  )
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '10px 12px',
  borderRadius: 10, border: '1.5px solid var(--border)',
  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
  boxSizing: 'border-box', background: '#fff',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, width: 'auto', minWidth: 130, appearance: 'auto' as const,
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--blue)', color: '#fff', border: 'none',
  borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
  fontFamily: 'var(--font-body)',
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '7px 12px',
  background: '#fff', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
  fontFamily: 'var(--font-body)',
}

const noticeBtnStyle: React.CSSProperties = {
  marginLeft: 12,
  background: 'transparent', border: 'none', textDecoration: 'underline',
  fontSize: 12, cursor: 'pointer', color: 'inherit', fontFamily: 'var(--font-body)',
}

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px',
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', color: 'var(--muted)',
  background: 'var(--bg)', borderBottom: '1px solid var(--border)',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  color: 'var(--text)',
  verticalAlign: 'middle',
}

const twoColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
}

const modalTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18,
  marginBottom: 16,
}

const modalActionsStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
}

function noticeStyle(kind: 'error' | 'success'): React.CSSProperties {
  const map = {
    error:   { bg: '#FEE2E2', border: '#FECACA', text: '#991B1B' },
    success: { bg: '#DCFCE7', border: '#BBF7D0', text: '#166534' },
  }
  const c = map[kind]
  return {
    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13,
  }
}
