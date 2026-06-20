import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCityBySlug } from '@/config/cities'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function fetchPrescription(id: string) {
  const supabase = admin()
  const { data } = await supabase
    .from('prescriptions')
    .select('*, patients(name, age, phone, gender, allergies), dentists(name, degree, clinic_name, phone, mci_number, address, city, areas(name), clinic_logo_url, signature_url)')
    .eq('id', id)
    .single()
  return data
}

// GET /api/prescriptions/pdf?id=<uuid> — returns a print-ready HTML page so the
// dentist (and patient via shared link) can open it in a new tab and trigger
// the native print dialog. Kept as HTML rather than a PDF binary because the
// repo's only PDF generator (jsPDF in the billing page) is client-only and
// puppeteer is intentionally not a dependency. Browsers print this layout
// cleanly via the autoPrint script at the end of the body.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const rx = await fetchPrescription(id)
  if (!rx) return NextResponse.json({ error: 'Prescription not found' }, { status: 404 })

  return new Response(generatePrescriptionHTML(rx, { autoPrint: true }), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const { prescription_id } = await request.json()
    const rx = await fetchPrescription(prescription_id)
    if (!rx) return NextResponse.json({ error: 'Prescription not found' }, { status: 404 })
    const html = generatePrescriptionHTML(rx)
    return NextResponse.json({ success: true, html, prescription: rx })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Prescriptions only capture a single dosage/frequency value per medicine (the
// form's "1-0-1" field), so the PDF used to print it in both a Dosage and a
// Frequency column — the same text twice. Collapse them into one column,
// de-duping so a med that carries both a distinct dosage and frequency still
// reads cleanly ("500mg · 1-0-1").
function dosageFrequency(m: any): string {
  const parts = [m?.dosage, m?.frequency].map(x => String(x ?? '').trim()).filter(Boolean)
  return Array.from(new Set(parts)).join(' · ')
}

function generatePrescriptionHTML(rx: any, opts: { autoPrint?: boolean } = {}) {
  const patient = rx.patients
  const dentist = rx.dentists
  const issuedAt = new Date(rx.created_at)
  const date = issuedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = issuedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  const city = getCityBySlug(dentist?.city)

  const doctorName = dentist?.name ? (/^dr\.?\s/i.test(dentist.name) ? dentist.name : `Dr. ${dentist.name}`) : 'Dr.'
  const degree = dentist?.degree || ''
  const mci = dentist?.mci_number || ''
  const clinicName = dentist?.clinic_name || ''
  // Prefer the typed address; fall back to "area, city" so the prescription
  // never ships blank.
  const clinicAddress = dentist?.address
    ? dentist.address
    : (dentist?.areas?.name ? `${dentist.areas.name}, ${city.cityName}` : city.cityName)
  const clinicPhone = dentist?.phone || ''
  const logoUrl = dentist?.clinic_logo_url || ''
  const signatureUrl = dentist?.signature_url || ''

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Prescription — ${escapeHtml(patient?.name || '')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; }
  .header { background: #0057A8; color: white; padding: 20px 28px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .header h1 { font-size: 22px; font-weight: 800; line-height: 1.2; }
  .header .degree { font-size: 12px; opacity: 0.9; margin-top: 2px; font-weight: 600; }
  .header .clinic { font-size: 13px; opacity: 0.95; margin-top: 6px; font-weight: 700; }
  .header .addr { font-size: 11px; opacity: 0.85; margin-top: 2px; line-height: 1.5; }
  .header .reg { font-size: 11px; opacity: 0.85; margin-top: 4px; }
  .header-right { text-align: right; font-size: 12px; opacity: 0.95; flex-shrink: 0; }
  .body { padding: 24px 28px; }
  .rx-symbol { font-size: 36px; color: #0057A8; font-weight: 900; margin-bottom: 4px; }
  .patient-box { background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }
  .patient-box .field label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; }
  .patient-box .field p { font-size: 13px; font-weight: 600; margin-top: 1px; }
  .allergy-box { background: #FEE2E2; border: 2px solid #DC2626; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #991B1B; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table th { background: #0057A8; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
  table td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; vertical-align: top; }
  table tr:nth-child(even) td { background: #f8faff; }
  .instructions { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; font-size: 13px; margin-bottom: 20px; }
  .footer { margin-top: 36px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
  .signature { text-align: center; min-width: 200px; }
  .signature .line { border-top: 1px solid #1a1a1a; width: 200px; margin-bottom: 6px; }
  .signature p.name { font-size: 13px; font-weight: 700; color: #1a1a1a; }
  .signature p.role { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .stamp-box { width: 180px; height: 90px; border: 1.5px dashed #94a3b8; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #94a3b8; text-align: center; padding: 8px; }
  .watermark { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${escapeHtml(doctorName)}</h1>
    ${degree ? `<div class="degree">${escapeHtml(degree)}</div>` : ''}
    ${clinicName ? `<div class="clinic">${escapeHtml(clinicName)}</div>` : ''}
    <div class="addr">${escapeHtml(clinicAddress)}${clinicPhone ? ' · ' + escapeHtml(clinicPhone) : ''}</div>
    ${mci ? `<div class="reg">MCI / DCI Reg. No: ${escapeHtml(mci)}</div>` : ''}
  </div>
  <div class="header-right">
    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Clinic logo" style="max-height:60px;max-width:120px;width:auto;height:auto;background:#fff;border-radius:6px;padding:4px;margin-bottom:8px;display:inline-block" />` : ''}
    <p style="font-size:10px;opacity:0.7;text-transform:uppercase;letter-spacing:0.05em">Date</p>
    <p style="font-size:14px;font-weight:700">${escapeHtml(date)}</p>
    <p style="font-size:11px;opacity:0.85;margin-top:6px">${escapeHtml(time)}</p>
  </div>
</div>
<div class="body">
  <div class="rx-symbol">℞</div>
  <div class="patient-box">
    <div class="field"><label>Patient Name</label><p>${escapeHtml(patient?.name || '—')}</p></div>
    <div class="field"><label>Age</label><p>${patient?.age ? escapeHtml(patient.age + ' yrs') : '—'}</p></div>
    <div class="field"><label>Gender</label><p>${escapeHtml(patient?.gender || '—')}</p></div>
    <div class="field"><label>Phone</label><p>${escapeHtml(patient?.phone || '—')}</p></div>
  </div>
  ${patient?.allergies ? `<div class="allergy-box">⚠ KNOWN ALLERGIES: ${escapeHtml(patient.allergies)}</div>` : ''}
  ${rx.medicines?.length > 0 ? `
  <table>
    <thead><tr><th style="width:4%">#</th><th style="width:26%">Medicine</th><th style="width:20%">Dosage &amp; Frequency</th><th style="width:14%">Duration</th><th>Instructions</th></tr></thead>
    <tbody>
      ${rx.medicines.map((m: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(m.name || '')}</strong></td>
        <td>${escapeHtml(dosageFrequency(m))}</td>
        <td>${escapeHtml(m.duration || '')}</td>
        <td>${escapeHtml(m.instructions || '')}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}
  ${rx.instructions ? `<div class="instructions">📝 <strong>Special Instructions:</strong> ${escapeHtml(rx.instructions)}</div>` : ''}
  <div class="footer">
    <div class="stamp-box">Clinic Stamp</div>
    <div class="signature">
      ${signatureUrl
        ? `<img src="${escapeHtml(signatureUrl)}" alt="Doctor's signature" style="max-width:160px;max-height:50px;width:auto;height:auto;object-fit:contain;background:#fff;margin:0 auto 4px;display:block" />`
        : `<div class="line"></div>`}
      <p class="role" style="margin-bottom:4px">Doctor's Signature</p>
      <p class="name">${escapeHtml(doctorName)}${degree ? ', ' + escapeHtml(degree) : ''}</p>
      ${mci ? `<p class="role">Reg. No: ${escapeHtml(mci)}</p>` : ''}
    </div>
  </div>
  <div style="font-size:11px;color:#64748b;margin-top:24px;">
    <p>This prescription is valid for 30 days from the date of issue.</p>
  </div>
  <div class="watermark">Generated by ${escapeHtml(city.domain)}</div>
</div>
${opts.autoPrint ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 250))</script>' : ''}
</body>
</html>`
}
