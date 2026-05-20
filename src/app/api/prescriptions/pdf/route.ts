import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCityBySlug } from '@/config/cities'

export async function POST(request: NextRequest) {
  try {
    const { prescription_id } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: rx } = await supabase
      .from('prescriptions')
      .select('*, patients(name, age, phone, gender, allergies), dentists(name, clinic_name, phone, mci_number, address, city, areas(name))')
      .eq('id', prescription_id)
      .single()

    if (!rx) return NextResponse.json({ error: 'Prescription not found' }, { status: 404 })

    // Generate HTML for PDF
    const html = generatePrescriptionHTML(rx)

    return NextResponse.json({ success: true, html, prescription: rx })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generatePrescriptionHTML(rx: any) {
  const patient = rx.patients
  const dentist = rx.dentists
  const date = new Date(rx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const city = getCityBySlug(dentist?.city)

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; }
  .header { background: #0057A8; color: white; padding: 20px 28px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 22px; font-weight: 800; }
  .header p { font-size: 12px; opacity: 0.85; margin-top: 2px; }
  .header-right { text-align: right; font-size: 12px; opacity: 0.9; }
  .body { padding: 24px 28px; }
  .rx-symbol { font-size: 36px; color: #0057A8; font-weight: 900; margin-bottom: 4px; }
  .patient-box { background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .patient-box .field label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; }
  .patient-box .field p { font-size: 13px; font-weight: 600; margin-top: 1px; }
  .allergy-box { background: #FEE2E2; border: 1px solid #FECACA; border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #991B1B; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table th { background: #0057A8; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
  table td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  table tr:nth-child(even) td { background: #f8faff; }
  .instructions { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; font-size: 13px; margin-bottom: 20px; }
  .footer { margin-top: 32px; display: flex; justify-content: space-between; align-items: flex-end; }
  .signature { text-align: right; }
  .signature .line { border-top: 1px solid #1a1a1a; width: 160px; margin-bottom: 4px; }
  .signature p { font-size: 12px; color: #374151; }
  .watermark { text-align: center; margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${dentist?.name || 'Dr.'}</h1>
    <p>${dentist?.clinic_name || ''}</p>
    <p>${dentist?.areas?.name ? dentist.areas.name + ', ' + city.cityName : ''} ${dentist?.phone ? '· ' + dentist.phone : ''}</p>
    ${dentist?.mci_number ? `<p>MCI Reg: ${dentist.mci_number}</p>` : ''}
  </div>
  <div class="header-right">
    <p style="font-size:11px;opacity:0.7">Date</p>
    <p style="font-size:15px;font-weight:700">${date}</p>
  </div>
</div>
<div class="body">
  <div class="rx-symbol">℞</div>
  <div class="patient-box">
    <div class="field"><label>Patient Name</label><p>${patient?.name || ''}</p></div>
    <div class="field"><label>Age / Gender</label><p>${patient?.age ? patient.age + ' yrs' : ''}${patient?.gender ? ' / ' + patient.gender : ''}</p></div>
    <div class="field"><label>Phone</label><p>${patient?.phone || ''}</p></div>
  </div>
  ${patient?.allergies ? `<div class="allergy-box">⚠️ KNOWN ALLERGIES: ${patient.allergies}</div>` : ''}
  ${rx.medicines?.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Medicine</th><th>Dosage</th><th>Duration</th><th>Instructions</th></tr></thead>
    <tbody>
      ${rx.medicines.map((m: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.dosage || ''}</td>
        <td>${m.duration || ''}</td>
        <td>${m.instructions || ''}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}
  ${rx.instructions ? `<div class="instructions">📝 <strong>Special Instructions:</strong> ${rx.instructions}</div>` : ''}
  <div class="footer">
    <div style="font-size:12px;color:#64748b;">
      <p>This prescription is valid for 30 days from date of issue.</p>
      <p style="margin-top:4px;">Issued via ${city.domain}</p>
    </div>
    <div class="signature">
      <div class="line"></div>
      <p><strong>${dentist?.name || ''}</strong></p>
      <p>${dentist?.clinic_name || ''}</p>
    </div>
  </div>
  <div class="watermark">Generated by ${city.domain}</div>
</div>
</body>
</html>`
}
