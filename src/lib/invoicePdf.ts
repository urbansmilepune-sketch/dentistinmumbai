// Client-only invoice PDF builder. Originally lived inside
// dashboard/billing/page.tsx — extracted so the per-patient Invoices tab can
// produce identical PDFs without duplicating ~150 lines of jsPDF layout. The
// generator is intentionally NOT a server route (the rest of the app's PDFs
// are HTML-print; only invoices use jsPDF) and stays client-side because
// jsPDF is bundled with the billing page already.
//
// Layout uses fixed coordinates (A4 at 595×842 points) for predictable
// alignment. Earlier proportional-width versions overlapped on long values;
// pinning every column to absolute x keeps Qty / Unit / Total in their own
// lanes regardless of treatment-name length.
import jsPDF from 'jspdf'
import { getCityBySlug } from '@/config/cities'

// jsPDF's built-in Helvetica is WinAnsi/Latin-1 only — it has no glyph for
// ₹ (U+20B9) and renders it as '¹'. Using "Rs." sidesteps font embedding.
function formatCurrency(amount: number): string {
  return 'Rs.' + amount.toLocaleString('en-IN')
}

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
  clinic_logo_url?: string | null
}

// Load a (Cloudinary) image URL into a PNG data URL plus its natural size so
// jsPDF can embed it with a known format and a correct aspect ratio.
// crossOrigin='anonymous' keeps the canvas untainted — Cloudinary delivery
// sends Access-Control-Allow-Origin, so toDataURL won't throw. Resolves null
// on any failure so a flaky logo never blocks the invoice download.
function loadImageData(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0)
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight })
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
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

export async function downloadInvoicePdf(inv: Invoice, dentist: InvoiceDentist) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  // A4 in points: 595 × 842. Hardcoded so the column x-coordinates below stay
  // self-documenting — jsPDF returns the same numbers but reading them via
  // doc.internal.* makes the layout harder to reason about.
  const PAGE_W = 595
  const PAGE_H = 842
  const MARGIN = 40
  const RIGHT_X = PAGE_W - MARGIN  // 555

  // Fixed column lanes. RIGHT_X (555) is the right-aligned anchor for totals.
  const COL_TREAT_X = 48
  const COL_QTY_X = 360
  const COL_PRICE_X = 415
  const COL_TOTAL_X = RIGHT_X
  const TREAT_MAX_WIDTH = COL_QTY_X - COL_TREAT_X - 8  // room before Qty column

  // -------- precomputed fields --------
  const cityName = getCityBySlug(dentist.city).cityName
  const domain = getCityBySlug(dentist.city).domain
  const clinicAddress = dentist.address
    ? dentist.address
    : (dentist.areas?.name ? `${dentist.areas.name}, ${cityName}` : cityName)
  const doctorName = dentist.name
    ? (/^dr\.?\s/i.test(dentist.name) ? dentist.name : `Dr. ${dentist.name}`)
    : ''
  const degree = dentist.degree || ''
  const mci = dentist.mci_number || ''
  const phone = dentist.phone || dentist.whatsapp || ''

  // ============================================================
  // HEADER (y: 40-120)
  // ============================================================
  // Optional clinic logo, top-left. We cap the rendered height at 56pt so the
  // mark sits alongside the clinic-name/address block (which runs y≈48-122)
  // without colliding with the address lines; the text block shifts right by
  // the logo's width + a gutter. textX/addrWidth fall back to the original
  // full-width layout when there's no logo.
  let textX = MARGIN
  let addrWidth = 280
  if (dentist.clinic_logo_url) {
    const logo = await loadImageData(dentist.clinic_logo_url)
    if (logo && logo.width > 0 && logo.height > 0) {
      const LOGO_MAX_H = 56
      const LOGO_MAX_W = 90
      let h = LOGO_MAX_H
      let w = (logo.width / logo.height) * h
      if (w > LOGO_MAX_W) { w = LOGO_MAX_W; h = (logo.height / logo.width) * w }
      doc.addImage(logo.dataUrl, 'PNG', MARGIN, 44, w, h)
      textX = MARGIN + w + 14
      addrWidth = 280 - (textX - MARGIN)
    }
  }

  // Clinic name — bold 18pt blue at y=60
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 87, 168)
  doc.text(dentist.clinic_name || dentist.name || 'Clinic', textX, 60)

  // Doctor name + degree — 10pt dark at y=76
  if (doctorName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    doc.text(degree ? `${doctorName}, ${degree}` : doctorName, textX, 76)
  }

  // Address — 9pt grey, up to 2 lines (long addresses were being truncated to
  // one line; ~280pt wraps before the right-side INVOICE block at x=315+).
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  const addrLines = doc.splitTextToSize(clinicAddress, addrWidth) as string[]
  if (addrLines[0]) doc.text(addrLines[0], textX, 89)
  if (addrLines[1]) doc.text(addrLines[1], textX, 100)

  // Phone — 9pt grey at y=111 (pushed down to make room for 2-line address)
  if (phone) doc.text(`Phone: ${phone}`, textX, 111)
  // MCI — 9pt grey at y=122
  if (mci) doc.text(`Reg No: ${mci}`, textX, 122)

  // Right side: INVOICE label + meta
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(15, 25, 35)
  doc.text('INVOICE', RIGHT_X, 60, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`No: ${inv.invoice_no}`, RIGHT_X, 76, { align: 'right' })
  const dateStr = new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  doc.text(`Date: ${dateStr}`, RIGHT_X, 89, { align: 'right' })

  // ============================================================
  // DIVIDER at y=136 (pushed down to clear the 2-line address block above)
  // ============================================================
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(1)
  doc.line(MARGIN, 136, RIGHT_X, 136)

  // ============================================================
  // BILL TO (y: 160-187)
  // ============================================================
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('BILL TO', MARGIN, 160)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 25, 35)
  doc.text(inv.patients?.name || 'Patient', MARGIN, 174)

  if (inv.patients?.phone) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Phone: ${inv.patients.phone}`, MARGIN, 187)
  }

  // ============================================================
  // ITEMS TABLE — header row at y=210
  // ============================================================
  const TABLE_HEADER_Y = 210
  doc.setFillColor(245, 247, 252)
  doc.rect(MARGIN, TABLE_HEADER_Y, RIGHT_X - MARGIN, 22, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  const HEADER_TEXT_Y = TABLE_HEADER_Y + 15  // y=225
  doc.text('TREATMENT', COL_TREAT_X, HEADER_TEXT_Y)
  doc.text('QTY', COL_QTY_X, HEADER_TEXT_Y)
  doc.text('UNIT PRICE', COL_PRICE_X, HEADER_TEXT_Y)
  doc.text('TOTAL', COL_TOTAL_X, HEADER_TEXT_Y, { align: 'right' })

  // ============================================================
  // ITEMS — rows starting at y=240, baseline +14pt per extra wrap line
  // ============================================================
  let cursorY = 240
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(30, 41, 59)
  const items: InvoiceItem[] = Array.isArray(inv.items) ? inv.items : []

  for (const item of items) {
    const name = String(item.treatment_name ?? item.description ?? '')
    const qty = Number(item.quantity ?? 1)
    const unit = Number(item.unit_price ?? item.amount ?? 0)
    const lineTotal = Number(item.amount ?? unit * qty)
    const wrapped = doc.splitTextToSize(name, TREAT_MAX_WIDTH) as string[]

    // Print treatment name (possibly multi-line) starting at cursorY. Numeric
    // columns sit on the first line so they line up with the visual top of
    // the cell.
    wrapped.forEach((line, idx) => {
      doc.text(line, COL_TREAT_X, cursorY + (idx * 14))
    })
    doc.text(String(qty), COL_QTY_X, cursorY)
    doc.text(formatCurrency(unit), COL_PRICE_X, cursorY)
    doc.text(formatCurrency(lineTotal), COL_TOTAL_X, cursorY, { align: 'right' })

    // Row height = base 22 + 14 per extra wrap line.
    const rowHeight = 22 + Math.max(0, (wrapped.length - 1) * 14)
    cursorY += rowHeight - 8  // leave 8pt for divider gap
    doc.setDrawColor(238, 240, 244)
    doc.line(MARGIN, cursorY, RIGHT_X, cursorY)
    cursorY += 14  // padding to next row baseline
  }

  // ============================================================
  // TOTALS (right-aligned block from x=380)
  // ============================================================
  cursorY += 20
  const TOTALS_LABEL_X = 380
  const TOTALS_VALUE_X = RIGHT_X

  function totalRow(label: string, value: string, opts: { bold?: boolean; color?: [number, number, number]; size?: number } = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.size ?? 11)
    const c = opts.color ?? [30, 41, 59]
    doc.setTextColor(c[0], c[1], c[2])
    doc.text(label, TOTALS_LABEL_X, cursorY)
    doc.text(value, TOTALS_VALUE_X, cursorY, { align: 'right' })
    cursorY += opts.bold ? 22 : 16
  }

  totalRow('Subtotal', formatCurrency(Number(inv.subtotal || 0)))
  if (Number(inv.discount) > 0) {
    totalRow('Discount', `- ${formatCurrency(Number(inv.discount))}`, { color: [22, 101, 52] })
  }
  if (Number(inv.gst_amount) > 0) {
    totalRow('GST (18%)', formatCurrency(Number(inv.gst_amount)))
  }

  // Divider above grand total
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(1)
  doc.line(TOTALS_LABEL_X, cursorY - 4, TOTALS_VALUE_X, cursorY - 4)
  cursorY += 4

  totalRow('Grand Total', formatCurrency(Number(inv.total || 0)), { bold: true, size: 13, color: [0, 87, 168] })

  // ============================================================
  // STATUS STAMP (left side, below items)
  // ============================================================
  cursorY += 12
  const stampPalette: Record<string, { fill: [number, number, number]; text: [number, number, number]; label: string }> = {
    paid:    { fill: [220, 252, 231], text: [22, 101, 52],  label: 'PAID'    },
    pending: { fill: [254, 243, 199], text: [146, 64, 14],  label: 'PENDING' },
    overdue: { fill: [254, 226, 226], text: [153, 27, 27],  label: 'OVERDUE' },
  }
  const status = (inv.payment_status || 'pending') as 'pending' | 'paid' | 'overdue'
  const s = stampPalette[status] ?? stampPalette.pending
  const STAMP_W = 100
  const STAMP_H = 32
  const stampX = MARGIN
  const stampY = cursorY

  doc.setFillColor(s.fill[0], s.fill[1], s.fill[2])
  doc.setDrawColor(s.text[0], s.text[1], s.text[2])
  doc.setLineWidth(1.5)
  doc.roundedRect(stampX, stampY, STAMP_W, STAMP_H, 6, 6, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(s.text[0], s.text[1], s.text[2])
  doc.text(s.label, stampX + STAMP_W / 2, stampY + STAMP_H / 2 + 5, { align: 'center' })

  cursorY = stampY + STAMP_H + 14
  if (inv.payment_method) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(60, 60, 60)
    doc.text(`Payment: ${inv.payment_method}`, MARGIN, cursorY)
    cursorY += 14
  }

  // ============================================================
  // NOTES (full width, optional)
  // ============================================================
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
    const wrapped = doc.splitTextToSize(String(inv.notes), RIGHT_X - MARGIN) as string[]
    wrapped.forEach(line => { doc.text(line, MARGIN, cursorY); cursorY += 14 })
  }

  // ============================================================
  // SIGNATURE SECTION — anchored to bottom but never overlaps content above
  // ============================================================
  const SIG_Y = Math.max(cursorY + 60, PAGE_H - 120)

  // Left: clinic stamp box (dashed) w=140 h=60
  const STAMP_BOX_X = MARGIN
  const STAMP_BOX_Y = SIG_Y - 60
  const STAMP_BOX_W = 140
  const STAMP_BOX_H = 60
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(1)
  doc.setLineDashPattern([3, 3], 0)
  doc.rect(STAMP_BOX_X, STAMP_BOX_Y, STAMP_BOX_W, STAMP_BOX_H)
  doc.setLineDashPattern([], 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text('Clinic Stamp', STAMP_BOX_X + STAMP_BOX_W / 2, STAMP_BOX_Y + STAMP_BOX_H / 2 + 3, { align: 'center' })

  // Right: signature line from x=400 to x=555
  const SIG_LINE_X1 = 400
  const SIG_LINE_X2 = RIGHT_X
  doc.setDrawColor(40, 40, 40)
  doc.setLineWidth(1)
  doc.line(SIG_LINE_X1, SIG_Y, SIG_LINE_X2, SIG_Y)

  // Doctor name + degree below the line, right aligned
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 25, 35)
  const sigName = doctorName ? (degree ? `${doctorName}, ${degree}` : doctorName) : 'Authorized Signature'
  doc.text(sigName, SIG_LINE_X2, SIG_Y + 14, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text('Signature', SIG_LINE_X2, SIG_Y + 26, { align: 'right' })

  // ============================================================
  // FOOTER at y = PAGE_H - 30
  // ============================================================
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(140, 140, 140)
  doc.text(`Powered by ${domain}`, PAGE_W / 2, PAGE_H - 30, { align: 'center' })

  doc.save(`Invoice-${inv.invoice_no}.pdf`)
}
