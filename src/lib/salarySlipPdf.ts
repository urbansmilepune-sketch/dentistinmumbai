// Client-only salary slip PDF builder. Mirrors src/lib/invoicePdf.ts:
// fixed A4 (595×842pt) coordinates, "Rs." instead of ₹ (Helvetica has no
// glyph for U+20B9 and renders it as '¹'), and one-shot doc.save().
// Caller fetches /api/dentist/salaries/[id]/slip to get the JSON payload,
// then hands it here.
import { jsPDF } from 'jspdf' // v4: named export (see invoicePdf.ts)
import { getCityBySlug } from '@/config/cities'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  associate_dentist: 'Associate Dentist',
  reception: 'Reception',
}

function formatCurrency(amount: number): string {
  return 'Rs.' + Number(amount || 0).toLocaleString('en-IN')
}

export type SalarySlip = {
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
  dentist: {
    name: string | null
    clinic_name: string | null
    address: string | null
    phone: string | null
    city: string | null
    areas?: { name: string | null } | null
  } | null
  staff: {
    name: string | null
    email: string | null
    role: string | null
  } | null
}

export function downloadSalarySlipPdf(slip: SalarySlip) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const PAGE_W = 595
  const PAGE_H = 842
  const MARGIN = 40
  const RIGHT_X = PAGE_W - MARGIN

  const dentist = slip.dentist
  const staff = slip.staff
  const cityCfg = getCityBySlug(dentist?.city ?? null)
  const clinicAddress = dentist?.address
    ? dentist.address
    : (dentist?.areas?.name ? `${dentist.areas.name}, ${cityCfg.cityName}` : cityCfg.cityName)
  const periodLabel = `${MONTHS[slip.month - 1] ?? slip.month} ${slip.year}`

  // HEADER — clinic on the left, slip metadata on the right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 87, 168)
  doc.text(dentist?.clinic_name || dentist?.name || 'Clinic', MARGIN, 60)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  const addrLines = doc.splitTextToSize(clinicAddress, 280) as string[]
  if (addrLines[0]) doc.text(addrLines[0], MARGIN, 78)
  if (addrLines[1]) doc.text(addrLines[1], MARGIN, 89)
  if (dentist?.phone) doc.text(`Phone: ${dentist.phone}`, MARGIN, 100)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(15, 25, 35)
  doc.text('SALARY SLIP', RIGHT_X, 60, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(periodLabel, RIGHT_X, 78, { align: 'right' })
  doc.text(`Status: ${String(slip.status || 'pending').toUpperCase()}`, RIGHT_X, 92, { align: 'right' })

  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(1)
  doc.line(MARGIN, 120, RIGHT_X, 120)

  // EMPLOYEE block (left) and PAY PERIOD block (right)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('EMPLOYEE', MARGIN, 144)
  doc.text('PAY PERIOD', RIGHT_X, 144, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 25, 35)
  doc.text(staff?.name || 'Staff member', MARGIN, 162)
  doc.text(periodLabel, RIGHT_X, 162, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  let leftY = 178
  if (staff?.role) {
    doc.text(`Role: ${ROLE_LABEL[staff.role] ?? staff.role}`, MARGIN, leftY)
    leftY += 13
  }
  if (staff?.email) doc.text(`Email: ${staff.email}`, MARGIN, leftY)

  let rightY = 178
  if (slip.paid_date) {
    const paidLabel = new Date(slip.paid_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    doc.text(`Paid on: ${paidLabel}`, RIGHT_X, rightY, { align: 'right' })
    rightY += 13
  }
  if (slip.payment_mode) doc.text(`Mode: ${slip.payment_mode}`, RIGHT_X, rightY, { align: 'right' })

  // BREAKDOWN TABLE — header row, then one row per non-zero component.
  // We hide rows that are zero so a single-component slip stays readable.
  const TABLE_Y = 222
  doc.setFillColor(245, 247, 252)
  doc.rect(MARGIN, TABLE_Y, RIGHT_X - MARGIN, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('COMPONENT', MARGIN + 12, TABLE_Y + 15)
  doc.text('AMOUNT', RIGHT_X - 12, TABLE_Y + 15, { align: 'right' })

  let y = TABLE_Y + 38

  function row(label: string, value: number, opts: { negative?: boolean } = {}) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    if (opts.negative) doc.setTextColor(153, 27, 27)
    else doc.setTextColor(30, 41, 59)
    doc.text(label, MARGIN + 12, y)
    const formatted = opts.negative ? `- ${formatCurrency(value)}` : formatCurrency(value)
    doc.text(formatted, RIGHT_X - 12, y, { align: 'right' })
    doc.setDrawColor(238, 240, 244)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y + 6, RIGHT_X, y + 6)
    y += 22
  }

  row('Basic Pay', Number(slip.basic_pay))
  if (Number(slip.allowances) > 0) row('Allowances', Number(slip.allowances))
  if (Number(slip.bonus) > 0) row('Bonus', Number(slip.bonus))
  if (Number(slip.deductions) > 0) row('Deductions', Number(slip.deductions), { negative: true })

  // NET PAYABLE — divider above, bold blue total
  y += 6
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(1)
  doc.line(MARGIN, y - 4, RIGHT_X, y - 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(0, 87, 168)
  doc.text('NET PAYABLE', MARGIN + 12, y + 14)
  doc.text(formatCurrency(Number(slip.net_payable)), RIGHT_X - 12, y + 14, { align: 'right' })
  y += 34

  if (slip.notes) {
    y += 16
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('NOTES', MARGIN, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(50, 50, 50)
    const wrapped = doc.splitTextToSize(slip.notes, RIGHT_X - MARGIN) as string[]
    wrapped.forEach(line => { doc.text(line, MARGIN, y); y += 14 })
  }

  // SIGNATURE — anchored to bottom so a short slip doesn't leave the line floating
  const SIG_Y = Math.max(y + 80, PAGE_H - 120)
  doc.setDrawColor(40, 40, 40)
  doc.setLineWidth(1)
  doc.line(380, SIG_Y, RIGHT_X, SIG_Y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 25, 35)
  doc.text('Authorized Signature', RIGHT_X, SIG_Y + 14, { align: 'right' })
  if (dentist?.name) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    const sigName = /^dr\.?\s/i.test(dentist.name) ? dentist.name : `Dr. ${dentist.name}`
    doc.text(sigName, RIGHT_X, SIG_Y + 26, { align: 'right' })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(140, 140, 140)
  doc.text(`Powered by ${cityCfg.domain}`, PAGE_W / 2, PAGE_H - 30, { align: 'center' })

  const safeName = (staff?.name || 'staff').replace(/[^A-Za-z0-9]+/g, '_')
  doc.save(`SalarySlip-${safeName}-${MONTHS[slip.month - 1] ?? slip.month}-${slip.year}.pdf`)
}
