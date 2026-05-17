'use client'

// Simple "if this brings me N new patients, do I break even?" calculator.
// Two sliders + the Gold annual price baked in — output is the monthly
// revenue and how many months of paid plan that pays for. The intent isn't
// to be precise; it's to translate ₹999/mo from a cost into the smallest
// number of incremental patients that justify it.

import { useMemo, useState } from 'react'

const GOLD_MONTHLY = 999
const GOLD_ANNUAL = 9999

export default function RoiCalculator() {
  const [fee, setFee] = useState(500)
  const [patients, setPatients] = useState(5)

  const monthlyRevenue = fee * patients
  const annualRevenue = monthlyRevenue * 12
  const monthsToPay = useMemo(() => (monthlyRevenue > 0 ? GOLD_MONTHLY / monthlyRevenue : 0), [monthlyRevenue])
  const roiAnnual = useMemo(() => (annualRevenue > 0 ? Math.round((annualRevenue / GOLD_ANNUAL) * 10) / 10 : 0), [annualRevenue])

  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)',
      border: '1px solid #FDE68A',
      borderRadius: 16,
      padding: '24px',
      maxWidth: 720, margin: '0 auto',
    }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#7C2D12', marginBottom: 4 }}>
        ROI in 30 seconds
      </h3>
      <p style={{ fontSize: 13, color: '#92400E', marginBottom: 20 }}>
        How few new patients does Gold need to bring you to pay for itself?
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }} className="roi-grid">
        <Field
          label="Average consultation fee"
          value={`₹${fee.toLocaleString('en-IN')}`}
          input={<input type="range" min={200} max={3000} step={50} value={fee} onChange={e => setFee(parseInt(e.target.value))} style={slider} />}
        />
        <Field
          label="Extra new patients / month"
          value={`${patients}`}
          input={<input type="range" min={1} max={30} step={1} value={patients} onChange={e => setPatients(parseInt(e.target.value))} style={slider} />}
        />
      </div>

      <div style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: 12, padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat label="Extra revenue / month" value={`₹${monthlyRevenue.toLocaleString('en-IN')}`} color="#166534" />
        <Stat label="Pays back Gold in" value={monthsToPay > 0 && monthsToPay <= 30 ? `${monthsToPay.toFixed(1)} days` : '—'} color="#7C2D12" />
        <Stat label="Annual ROI" value={roiAnnual >= 1 ? `${roiAnnual}×` : '—'} color="#003F7A" />
      </div>

      <p style={{ fontSize: 11, color: '#92400E', marginTop: 12, lineHeight: 1.5 }}>
        Indicative only — doesn&apos;t include returning patients, treatment plans, or referrals. Most Gold dentists pay back the plan in the first week of the month.
      </p>

      <style>{`
        @media (max-width: 600px) {
          .roi-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function Field({ label, value, input }: { label: string; value: string; input: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#7C2D12' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#003F7A', fontFamily: 'var(--font-heading)' }}>{value}</span>
      </div>
      {input}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-heading)', fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

const slider: React.CSSProperties = {
  width: '100%',
  accentColor: '#FF6135',
  cursor: 'pointer',
}
