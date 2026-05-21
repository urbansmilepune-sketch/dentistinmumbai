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
  clinic_name: string | null
  phone: string | null
  whatsapp: string | null
  city: string | null
  areas?: { name: string | null } | null
}

export type Invoice = {
  id: string
  invoice_no: string
  invoice_date: string
  items?: Array<{ description?: string; amount?: number }> | null
  subtotal?: number | null
  discount?: number | null
  total?: number | null
  notes?: string | null
  payment_status?: string | null
  patients?: { name?: string | null; phone?: string | null } | null
}

export function downloadInvoicePdf(inv: Invoice, dentist: InvoiceDentist) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const PAGE_W = doc.internal.pageSize.getWidth()
  const PAGE_H = doc.internal.pageSize.getHeight()
  const MARGIN = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(0, 87, 168)
  doc.text(dentist.clinic_name || dentist.name || 'Clinic', MARGIN, MARGIN + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(60, 60, 60)
  const subtitleLines: string[] = []
  if (dentist.name && dentist.clinic_name) subtitleLines.push(dentist.name)
  const cityName = getCityBySlug(dentist.city).cityName
  const locale = dentist.areas?.name ? `${dentist.areas.name}, ${cityName}` : cityName
  subtitleLines.push(locale)
  const contact = dentist.phone || dentist.whatsapp
  if (contact) subtitleLines.push(`Phone: ${contact}`)
  subtitleLines.forEach((line, i) => {
    doc.text(line, MARGIN, MARGIN + 28 + (i * 14))
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(15, 25, 35)
  doc.text('INVOICE', PAGE_W - MARGIN, MARGIN + 4, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(80, 80, 80)
  doc.text(`# ${inv.invoice_no}`, PAGE_W - MARGIN, MARGIN + 22, { align: 'right' })
  const date = new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  doc.text(`Date: ${date}`, PAGE_W - MARGIN, MARGIN + 38, { align: 'right' })

  let cursorY = MARGIN + 90
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(1)
  doc.line(MARGIN, cursorY, PAGE_W - MARGIN, cursorY)
  cursorY += 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text('BILL TO', MARGIN, cursorY)
  cursorY += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 25, 35)
  doc.text(inv.patients?.name || 'Patient', MARGIN, cursorY)
  cursorY += 16
  if (inv.patients?.phone) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(`Phone: ${inv.patients.phone}`, MARGIN, cursorY)
    cursorY += 14
  }

  cursorY += 18
  const COL_AMT_X = PAGE_W - MARGIN
  doc.setFillColor(245, 247, 252)
  doc.rect(MARGIN, cursorY - 14, PAGE_W - MARGIN * 2, 24, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text('DESCRIPTION', MARGIN + 8, cursorY + 2)
  doc.text('AMOUNT', COL_AMT_X - 8, cursorY + 2, { align: 'right' })
  cursorY += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(30, 41, 59)
  const items: { description?: string; amount?: number }[] = Array.isArray(inv.items) ? inv.items : []
  for (const item of items) {
    const desc = String(item.description ?? '')
    const wrapped = doc.splitTextToSize(desc, PAGE_W - MARGIN * 2 - 110) as string[]
    wrapped.forEach((line, idx) => {
      doc.text(line, MARGIN + 8, cursorY)
      if (idx === 0) {
        doc.text(`₹${Number(item.amount || 0).toLocaleString('en-IN')}`, COL_AMT_X - 8, cursorY, { align: 'right' })
      }
      cursorY += 16
    })
    doc.setDrawColor(238, 240, 244)
    doc.line(MARGIN, cursorY - 4, PAGE_W - MARGIN, cursorY - 4)
    cursorY += 6
  }

  cursorY += 12
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
  doc.setDrawColor(200, 200, 200)
  doc.line(totalLabelX, cursorY - 2, totalValueX, cursorY - 2)
  cursorY += 6
  row('Total', `₹${Number(inv.total || 0).toLocaleString('en-IN')}`, true, [0, 87, 168])

  cursorY += 6
  const status = (inv.payment_status || 'pending') as 'pending' | 'paid' | 'overdue'
  const badge: Record<string, { fill: [number, number, number]; text: [number, number, number]; label: string }> = {
    paid:    { fill: [220, 252, 231], text: [22, 101, 52],  label: 'PAID'    },
    pending: { fill: [254, 243, 199], text: [146, 64, 14],  label: 'PENDING' },
    overdue: { fill: [254, 226, 226], text: [153, 27, 27],  label: 'OVERDUE' },
  }
  const b = badge[status] ?? badge.pending
  const badgeW = 90
  const badgeX = PAGE_W - MARGIN - badgeW
  doc.setFillColor(b.fill[0], b.fill[1], b.fill[2])
  doc.roundedRect(badgeX, cursorY - 14, badgeW, 22, 11, 11, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(b.text[0], b.text[1], b.text[2])
  doc.text(b.label, badgeX + badgeW / 2, cursorY, { align: 'center' })
  cursorY += 16

  if (inv.notes) {
    cursorY += 16
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('NOTES', MARGIN, cursorY)
    cursorY += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(50, 50, 50)
    const wrapped = doc.splitTextToSize(String(inv.notes), PAGE_W - MARGIN * 2) as string[]
    wrapped.forEach(line => { doc.text(line, MARGIN, cursorY); cursorY += 14 })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(140, 140, 140)
  doc.text(`Powered by ${getCityBySlug(dentist.city).domain}`, PAGE_W / 2, PAGE_H - MARGIN / 2, { align: 'center' })

  doc.save(`Invoice-${inv.invoice_no}.pdf`)
}
