// Client-only invoice PDF builder. Originally lived inside
// dashboard/billing/page.tsx — extracted so the per-patient Invoices tab can
// produce identical PDFs without duplicating ~150 lines of jsPDF layout. The
// generator is intentionally NOT a server route (the rest of the app's PDFs
// are HTML-print; only invoices use jsPDF) and stays client-side because
// jsPDF is bundled with the billing page already.
import jsPDF from 'jspdf'
import { getCityBySlug } from '@/config/cities'

export type InvoiceDentist = {
  name: string | null
  degree?: string | null
  clinic_name: string | null
  phone: string | null
  whatsapp: string | null
  address?: string | null
  mci_number?: string | null
  city: string | null
  areas?: { name: string | null } | null
}

export type InvoiceItem = {
  description?: string
  treatment_name?: string
  quantity?: number
  unit_price?: number
  amount?: number
}

export type Invoice = {
  id: string
  invoice_no: string
  invoice_date: string
  items?: InvoiceItem[] | null
  subtotal?: number | null
  discount?: number | null
  gst_amount?: number | null
  total?: number | null
  payment_method?: string | null
  notes?: string | null
  payment_status?: string | null
  patients?: { name?: string | null; phone?: string | null } | null
}

export function downloadInvoicePdf(inv: Invoice, dentist: InvoiceDentist) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const PAGE_W = doc.internal.pageSize.getWidth()
  const PAGE_H = doc.internal.pageSize.getHeight()
  const MARGIN = 42

  const cityName = getCityBySlug(dentist.city).cityName
  const clinicAddress = dentist.address
    ? dentist.address
    : (dentist.areas?.name ? `${dentist.areas.name}, ${cityName}` : cityName)
  const doctorName = dentist.name
    ? (/^dr\.?\s/i.test(dentist.name) ? dentist.name : `Dr. ${dentist.name}`)
    : ''
  const degree = dentist.degree || ''
  const mci = dentist.mci_number || ''

  // -------- CLINIC HEADER --------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(0, 87, 168)
  doc.text(dentist.clinic_name || dentist.name || 'Clinic', MARGIN, MARGIN + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  const subtitleLines: string[] = []
  if (doctorName) {
    subtitleLines.push(degree ? `${doctorName}, ${degree}` : doctorName)
  }
  // Wrap a long address onto multiple lines so it doesn't overflow toward the
  // INVOICE label on the right.
  const wrappedAddr = doc.splitTextToSize(clinicAddress, PAGE_W / 2 - MARGIN) as string[]
  subtitleLines.push(...wrappedAddr)
  const contact = dentist.phone || dentist.whatsapp
  if (contact) subtitleLines.push(`Phone: ${contact}`)
  if (mci) subtitleLines.push(`Reg No: ${mci}`)
  subtitleLines.forEach((line, i) => {
    doc.text(line, MARGIN, MARGIN + 26 + (i * 13))
  })

  // -------- INVOICE LABEL --------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(15, 25, 35)
  doc.text('INVOICE', PAGE_W - MARGIN, MARGIN + 4, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`No: ${inv.invoice_no}`, PAGE_W - MARGIN, MARGIN + 22, { align: 'right' })
  const date = new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  doc.text(`Date: ${date}`, PAGE_W - MARGIN, MARGIN + 36, { align: 'right' })

  // -------- DIVIDER --------
  // Push the divider below whichever block is taller — header subtitle stack
  // or the invoice-no/date stack — so it never cuts through text.
  const headerHeight = Math.max(26 + subtitleLines.length * 13, 36 + 14)
  let cursorY = MARGIN + headerHeight + 16
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(1)
  doc.line(MARGIN, cursorY, PAGE_W - MARGIN, cursorY)
  cursorY += 20

  // -------- BILL TO --------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('BILL TO', MARGIN, cursorY)
  cursorY += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 25, 35)
  doc.text(inv.patients?.name || 'Patient', MARGIN, cursorY)
  cursorY += 14
  if (inv.patients?.phone) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.text(`Phone: ${inv.patients.phone}`, MARGIN, cursorY)
    cursorY += 14
  }

  cursorY += 14

  // -------- ITEMS TABLE HEADER --------
  // Column layout: Treatment | Qty | Unit Price | Total
  const TBL_W = PAGE_W - MARGIN * 2
  const COL_TREAT_X = MARGIN + 8
  const COL_QTY_X = MARGIN + TBL_W * 0.58
  const COL_PRICE_X = MARGIN + TBL_W * 0.74
  const COL_TOTAL_X = PAGE_W - MARGIN - 8

  doc.setFillColor(245, 247, 252)
  doc.rect(MARGIN, cursorY - 14, TBL_W, 24, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('TREATMENT', COL_TREAT_X, cursorY + 2)
  doc.text('QTY', COL_QTY_X, cursorY + 2)
  doc.text('UNIT PRICE', COL_PRICE_X, cursorY + 2)
  doc.text('TOTAL', COL_TOTAL_X, cursorY + 2, { align: 'right' })
  cursorY += 22

  // -------- ITEMS --------
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(30, 41, 59)
  const items: InvoiceItem[] = Array.isArray(inv.items) ? inv.items : []
  for (const item of items) {
    const name = String(item.treatment_name ?? item.description ?? '')
    const qty = Number(item.quantity ?? 1)
    const unit = Number(item.unit_price ?? item.amount ?? 0)
    const lineTotal = Number(item.amount ?? unit * qty)
    const wrapped = doc.splitTextToSize(name, TBL_W * 0.55) as string[]
    wrapped.forEach((line, idx) => {
      doc.text(line, COL_TREAT_X, cursorY)
      if (idx === 0) {
        doc.text(String(qty), COL_QTY_X, cursorY)
        doc.text(`₹${unit.toLocaleString('en-IN')}`, COL_PRICE_X, cursorY)
        doc.text(`₹${lineTotal.toLocaleString('en-IN')}`, COL_TOTAL_X, cursorY, { align: 'right' })
      }
      cursorY += 15
    })
    doc.setDrawColor(238, 240, 244)
    doc.line(MARGIN, cursorY - 4, PAGE_W - MARGIN, cursorY - 4)
    cursorY += 6
  }

  cursorY += 8

  // -------- TOTALS COLUMN --------
  const totalLabelX = PAGE_W - MARGIN - 160
  const totalValueX = PAGE_W - MARGIN
  function row(label: string, value: string, bold = false, color: [number, number, number] = [30, 41, 59]) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 14 : 11)
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(label, totalLabelX, cursorY)
    doc.text(value, totalValueX, cursorY, { align: 'right' })
    cursorY += bold ? 22 : 16
  }
  row('Subtotal', `₹${Number(inv.subtotal || 0).toLocaleString('en-IN')}`)
  if (Number(inv.discount) > 0) {
    row('Discount', `- ₹${Number(inv.discount).toLocaleString('en-IN')}`, false, [22, 101, 52])
  }
  if (Number(inv.gst_amount) > 0) {
    row('GST (18%)', `₹${Number(inv.gst_amount).toLocaleString('en-IN')}`)
  }
  doc.setDrawColor(200, 200, 200)
  doc.line(totalLabelX, cursorY - 2, totalValueX, cursorY - 2)
  cursorY += 6
  row('Grand Total', `₹${Number(inv.total || 0).toLocaleString('en-IN')}`, true, [0, 87, 168])

  // -------- STATUS STAMP + PAYMENT METHOD --------
  cursorY += 8
  const status = (inv.payment_status || 'pending') as 'pending' | 'paid' | 'overdue'
  const stamp: Record<string, { fill: [number, number, number]; text: [number, number, number]; label: string }> = {
    paid:    { fill: [220, 252, 231], text: [22, 101, 52],  label: 'PAID'    },
    pending: { fill: [254, 243, 199], text: [146, 64, 14],  label: 'PENDING' },
    overdue: { fill: [254, 226, 226], text: [153, 27, 27],  label: 'OVERDUE' },
  }
  const b = stamp[status] ?? stamp.pending
  const stampW = 110
  const stampH = 36
  const stampX = MARGIN
  const stampY = cursorY - 4
  doc.setFillColor(b.fill[0], b.fill[1], b.fill[2])
  doc.setDrawColor(b.text[0], b.text[1], b.text[2])
  doc.setLineWidth(2)
  doc.roundedRect(stampX, stampY, stampW, stampH, 6, 6, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(b.text[0], b.text[1], b.text[2])
  doc.text(b.label, stampX + stampW / 2, stampY + stampH / 2 + 5, { align: 'center' })
  if (inv.payment_method) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(60, 60, 60)
    doc.text(`Payment Method: ${inv.payment_method}`, stampX, stampY + stampH + 16)
  }
  cursorY = stampY + stampH + (inv.payment_method ? 28 : 14)

  // -------- NOTES --------
  if (inv.notes) {
    cursorY += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('NOTES', MARGIN, cursorY)
    cursorY += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(50, 50, 50)
    const wrapped = doc.splitTextToSize(String(inv.notes), PAGE_W - MARGIN * 2) as string[]
    wrapped.forEach(line => { doc.text(line, MARGIN, cursorY); cursorY += 14 })
  }

  // -------- SIGNATURE + STAMP AREA --------
  const sigY = Math.max(cursorY + 30, PAGE_H - 130)
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(1)
  // Left: clinic stamp box (dashed)
  const stampBoxX = MARGIN
  const stampBoxY = sigY - 50
  doc.setLineDashPattern([3, 3], 0)
  doc.rect(stampBoxX, stampBoxY, 140, 70)
  doc.setLineDashPattern([], 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text('Clinic Stamp', stampBoxX + 70, stampBoxY + 38, { align: 'center' })

  // Right: signature line
  const sigLineX1 = PAGE_W - MARGIN - 180
  const sigLineX2 = PAGE_W - MARGIN
  doc.setDrawColor(40, 40, 40)
  doc.line(sigLineX1, sigY, sigLineX2, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 25, 35)
  const sigName = doctorName ? (degree ? `${doctorName}, ${degree}` : doctorName) : 'Signature'
  doc.text(sigName, sigLineX2, sigY + 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(mci ? `Signature · MCI ${mci}` : 'Signature', sigLineX2, sigY + 26, { align: 'right' })

  // -------- FOOTER --------
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(140, 140, 140)
  doc.text(`Powered by ${getCityBySlug(dentist.city).domain}`, PAGE_W / 2, PAGE_H - MARGIN / 2, { align: 'center' })

  doc.save(`Invoice-${inv.invoice_no}.pdf`)
}
