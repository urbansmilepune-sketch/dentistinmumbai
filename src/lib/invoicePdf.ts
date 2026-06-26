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
// jsPDF 4.x ships the constructor as a NAMED export from its ESM build (which
// is what Next/webpack bundles); the old default export is no longer the
// constructor, so `import jsPDF from 'jspdf'` yields a non-constructor and
// `new jsPDF()` throws "jsPDF is not a constructor" at runtime.
import { jsPDF } from 'jspdf'
import { getCityBySlug } from '@/config/cities'

// Currency is rendered as an ASCII "Rs." prefix on jsPDF's built-in Helvetica.
// We previously embedded a Noto Sans subset to print the ₹ glyph (U+20B9, which
// Helvetica's Latin-1 set lacks), but that TrueType subset fails to parse in
// jsPDF 4.x — addFont errors during parse, the font's width table is never
// built, and every currency draw then throws in pdfEscape16
// ("Cannot read properties of undefined (reading 'widths')"), which is exactly
// what made invoice downloads fail. "Rs." needs no custom font and is standard
// on Indian invoices, so it sidesteps the parser bug entirely.
const RUPEE = 'Rs. '
function formatCurrency(amount: number): string {
  const n = Number(amount)
  return RUPEE + (Number.isFinite(n) ? n : 0).toLocaleString('en-IN')
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
  signature_url?: string | null
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

// Public entry point. Thin wrapper so any failure inside the renderer is
// logged with the exact invoice + dentist payload that triggered it, then
// re-thrown for the caller to surface to the dentist. Before this, a throw
// here was an unhandled rejection — the download button just did nothing.
export async function downloadInvoicePdf(inv: Invoice, dentist: InvoiceDentist) {
  try {
    await renderInvoicePdf(inv, dentist)
  } catch (err) {
    console.error('Invoice PDF error:', err)
    try { console.error('Invoice data:', JSON.stringify(inv)) } catch { /* circular / non-serialisable */ }
    try { console.error('Dentist data:', JSON.stringify(dentist)) } catch { /* circular / non-serialisable */ }
    throw err
  }
}

async function renderInvoicePdf(inv: Invoice, dentist: InvoiceDentist) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  // Draw a pre-formatted currency string at the current font size + colour.
  // Currency stays on Helvetica (see formatCurrency / RUPEE above) — opts.bold
  // just toggles the weight to match the surrounding label.
  function drawCurrency(text: string, x: number, y: number, opts: { align?: 'left' | 'center' | 'right'; bold?: boolean } = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.text(text, x, y, opts.align ? { align: opts.align } : undefined)
    doc.setFont('helvetica', 'normal')
  }

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
  if (dentist.clinic_logo_url) {
    // Whole block guarded: loadImageData resolves null on fetch/CORS failure,
    // but addImage itself can still throw on a malformed data URL. A logo must
    // never be the reason an invoice won't download — fall back to the
    // no-logo layout on any error.
    try {
      const logo = await loadImageData(dentist.clinic_logo_url)
      if (logo && logo.width > 0 && logo.height > 0) {
        const LOGO_MAX_H = 56
        const LOGO_MAX_W = 90
        let h = LOGO_MAX_H
        let w = (logo.width / logo.height) * h
        if (w > LOGO_MAX_W) { w = LOGO_MAX_W; h = (logo.height / logo.width) * w }
        doc.addImage(logo.dataUrl, 'PNG', MARGIN, 44, w, h)
        textX = MARGIN + w + 14
      }
    } catch (e) {
      console.warn('Invoice logo skipped:', e)
    }
  }

  // ---- Right meta block: INVOICE title + No + Date, right-aligned at RIGHT_X.
  // Drawn first so we know how far left it reaches, then keep the clinic
  // name/address clear of it (this is what fixes the title/clinic-name overlap).
  // invoice_date may be null/blank/malformed — fall back to today rather than
  // rendering "Invalid Date".
  const parsedDate = inv.invoice_date ? new Date(inv.invoice_date) : null
  const dateForDisplay = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date()
  const dateStr = dateForDisplay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const metaNo = `No: ${inv.invoice_no}`
  const metaDate = `Date: ${dateStr}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  const invoiceTitleW = doc.getTextWidth('INVOICE')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const rightBlockW = Math.max(invoiceTitleW, doc.getTextWidth(metaNo), doc.getTextWidth(metaDate))
  const rightBlockLeft = RIGHT_X - rightBlockW

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(15, 25, 35)
  doc.text('INVOICE', RIGHT_X, 58, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(metaNo, RIGHT_X, 78, { align: 'right' })
  doc.text(metaDate, RIGHT_X, 92, { align: 'right' })

  // ---- Left block: clinic name + details, constrained to the space left of
  // the meta block (minus an 18pt gutter). Shrink the name to fit rather than
  // let it overflow under "INVOICE".
  const leftColW = Math.max(120, rightBlockLeft - 18 - textX)

  const clinicName = dentist.clinic_name || dentist.name || 'Clinic'
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 87, 168)
  let nameSize = 18
  doc.setFontSize(nameSize)
  while (doc.getTextWidth(clinicName) > leftColW && nameSize > 11) {
    nameSize -= 1
    doc.setFontSize(nameSize)
  }
  doc.text(clinicName, textX, 60)

  // Doctor name + degree — 10pt dark at y=76
  if (doctorName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    doc.text(degree ? `${doctorName}, ${degree}` : doctorName, textX, 76)
  }

  // Address — 9pt grey, up to 2 lines, wrapped within the left column so it
  // stays clear of the meta block.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  const addrLines = doc.splitTextToSize(clinicAddress, leftColW) as string[]
  if (addrLines[0]) doc.text(addrLines[0], textX, 89)
  if (addrLines[1]) doc.text(addrLines[1], textX, 100)

  // Phone — 9pt grey at y=111 (pushed down to make room for 2-line address)
  if (phone) doc.text(`Phone: ${phone}`, textX, 111)
  // State Dental Council — 9pt grey at y=122
  if (mci) doc.text(`Reg No: ${mci}`, textX, 122)

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
  // items is JSONB. Supabase normally hands it back already parsed as an array,
  // but a legacy row (or a re-serialised payload) can arrive as a JSON string —
  // parse that defensively so a string never reaches the render loop and breaks
  // it. Anything that isn't ultimately an array degrades to an empty table.
  const items: InvoiceItem[] = (() => {
    const raw: unknown = inv.items
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch { return [] }
    }
    return []
  })()

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
    drawCurrency(formatCurrency(unit), COL_PRICE_X, cursorY)
    drawCurrency(formatCurrency(lineTotal), COL_TOTAL_X, cursorY, { align: 'right' })

    // Row height = base 22 + 14 per extra wrap line.
    const rowHeight = 22 + Math.max(0, (wrapped.length - 1) * 14)
    cursorY += rowHeight - 8  // leave 8pt for divider gap
    doc.setDrawColor(238, 240, 244)
    doc.line(MARGIN, cursorY, RIGHT_X, cursorY)
    cursorY += 14  // padding to next row baseline
  }

  // ============================================================
  // TOTALS (right) + PAYMENT / NOTES (left) — one band kept tight under the
  // items table, so there's no large empty gap before the signature.
  // ============================================================
  const blockTop = cursorY + 24
  const TOTALS_LABEL_X = 380
  const TOTALS_VALUE_X = RIGHT_X
  let rightY = blockTop

  function totalRow(label: string, value: string, opts: { bold?: boolean; color?: [number, number, number]; size?: number } = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.size ?? 11)
    const c = opts.color ?? [30, 41, 59]
    doc.setTextColor(c[0], c[1], c[2])
    doc.text(label, TOTALS_LABEL_X, rightY)
    drawCurrency(value, TOTALS_VALUE_X, rightY, { align: 'right', bold: opts.bold })
    rightY += opts.bold ? 22 : 16
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
  doc.line(TOTALS_LABEL_X, rightY - 4, TOTALS_VALUE_X, rightY - 4)
  rightY += 4

  totalRow('Grand Total', formatCurrency(Number(inv.total || 0)), { bold: true, size: 13, color: [0, 87, 168] })

  // Status stamp (PAID / PENDING / OVERDUE) at bottom-right, directly under
  // the grand total — not floating on the left.
  const stampPalette: Record<string, { fill: [number, number, number]; text: [number, number, number]; label: string }> = {
    paid:    { fill: [220, 252, 231], text: [22, 101, 52],  label: 'PAID'    },
    pending: { fill: [254, 243, 199], text: [146, 64, 14],  label: 'PENDING' },
    overdue: { fill: [254, 226, 226], text: [153, 27, 27],  label: 'OVERDUE' },
  }
  const status = (inv.payment_status || 'pending') as 'pending' | 'paid' | 'overdue'
  const s = stampPalette[status] ?? stampPalette.pending
  const STAMP_W = 100
  const STAMP_H = 30
  const stampX = RIGHT_X - STAMP_W
  rightY += 10
  doc.setFillColor(s.fill[0], s.fill[1], s.fill[2])
  doc.setDrawColor(s.text[0], s.text[1], s.text[2])
  doc.setLineWidth(1.5)
  doc.roundedRect(stampX, rightY, STAMP_W, STAMP_H, 6, 6, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(s.text[0], s.text[1], s.text[2])
  doc.text(s.label, stampX + STAMP_W / 2, rightY + STAMP_H / 2 + 5, { align: 'center' })
  rightY += STAMP_H

  // Left column (parallel to the totals): payment method + notes.
  let leftY = blockTop
  const leftColMaxW = TOTALS_LABEL_X - MARGIN - 20

  if (inv.payment_method) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('PAYMENT METHOD', MARGIN, leftY)
    leftY += 15
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(40, 40, 40)
    doc.text(String(inv.payment_method), MARGIN, leftY)
    leftY += 20
  }

  if (inv.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('NOTES', MARGIN, leftY)
    leftY += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(50, 50, 50)
    const wrapped = doc.splitTextToSize(String(inv.notes), leftColMaxW) as string[]
    wrapped.forEach(line => { doc.text(line, MARGIN, leftY); leftY += 14 })
  }

  cursorY = Math.max(leftY, rightY)

  // ============================================================
  // SIGNATURE SECTION — clinic stamp (left) + signature (right), placed just
  // below the content with a sensible gap and clamped so it never collides
  // with the footer. (Previously pinned to PAGE_H-120, leaving a big gap on
  // short invoices.)
  // ============================================================
  const SIG_Y = Math.min(cursorY + 70, PAGE_H - 80)

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

  // Optional uploaded signature image (dentists.signature_url) sitting just
  // above the line, right-aligned so it lands over the doctor-name block —
  // mirrors the prescription PDF footer. Loaded the same way as the clinic
  // logo; on any failure we fall back silently to the plain line so a flaky
  // image never blocks the download.
  if (dentist.signature_url) {
    try {
      const sig = await loadImageData(dentist.signature_url)
      if (sig && sig.width > 0 && sig.height > 0) {
        const SIG_MAX_H = 38
        const SIG_MAX_W = 150
        let h = SIG_MAX_H
        let w = (sig.width / sig.height) * h
        if (w > SIG_MAX_W) { w = SIG_MAX_W; h = (sig.height / sig.width) * w }
        // Bottom edge rests 2pt above the signature line, right edge at SIG_LINE_X2.
        doc.addImage(sig.dataUrl, 'PNG', SIG_LINE_X2 - w, SIG_Y - h - 2, w, h)
      }
    } catch (e) {
      console.warn('Invoice signature skipped:', e)
    }
  }

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
