const COST_DATA = [
  { treatment: 'Dental Consultation', range: '₹200 – ₹500' },
  { treatment: 'Teeth Cleaning (Scaling)', range: '₹800 – ₹2,000' },
  { treatment: 'Tooth Filling (Composite)', range: '₹600 – ₹2,500' },
  { treatment: 'Root Canal Treatment', range: '₹3,000 – ₹8,000' },
  { treatment: 'Dental Implants', range: '₹25,000 – ₹80,000' },
  { treatment: 'Teeth Whitening', range: '₹5,000 – ₹15,000' },
  { treatment: 'Braces / Aligners', range: '₹20,000 – ₹80,000' },
  { treatment: 'Dental Crowns', range: '₹4,000 – ₹18,000' },
]

export default function CostGuide({ areaName }: { areaName: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>
          💰 Dental Treatment Cost in {areaName} ({new Date().getFullYear()})
        </h2>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--blue-light)' }}>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--blue-dark)', whiteSpace: 'nowrap' }}>Treatment</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--blue-dark)', whiteSpace: 'nowrap' }}>Approximate Fee Range</th>
            </tr>
          </thead>
          <tbody>
            {COST_DATA.map((row, i) => (
              <tr key={row.treatment} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : 'var(--bg)' }}>
                <td style={{ padding: '13px 24px', fontSize: 14, fontWeight: 500 }}>{row.treatment}</td>
                <td style={{ padding: '13px 24px', fontSize: 14, fontWeight: 700, color: 'var(--blue)', textAlign: 'right' }}>{row.range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '12px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
          * Prices are indicative. Actual costs depend on clinic tier, doctor experience, and case complexity. Always consult for a personalised quote.
        </p>
      </div>
    </div>
  )
}
