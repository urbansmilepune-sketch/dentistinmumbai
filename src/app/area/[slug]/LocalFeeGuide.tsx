import { NAVY, TEAL } from '@/app/dentist/[slug]/profileTheme'

// Live, per-area consultation-fee guide. Every number here is computed from the
// area's *active* dentists that publish a real fee (0/NULL is the "unset"
// sentinel and is excluded upstream), so no two areas render the same figures —
// this is the unique, data-backed content that keeps the page off Google's
// doorway-page radar. When no clinic in the area publishes a fee we show an
// honest fallback instead of fabricating a range.
interface Props {
  areaName: string
  totalCount: number
  pricedCount: number
  avgFee: number | null
  minFee: number | null
  maxFee: number | null
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default function LocalFeeGuide({ areaName, totalCount, pricedCount, avgFee, minFee, maxFee }: Props) {
  const hasData = pricedCount > 0 && avgFee !== null && minFee !== null && maxFee !== null

  const tiles = hasData
    ? [
        { value: money(avgFee!), label: 'average consultation' },
        { value: money(minFee!), label: 'lowest listed' },
        { value: money(maxFee!), label: 'highest listed' },
      ]
    : []

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: NAVY, marginBottom: 6 }}>
        Consultation fees in {areaName}
      </h2>

      {hasData ? (
        <>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 18 }}>
            Based on {pricedCount} of {totalCount} verified clinic{totalCount === 1 ? '' : 's'} in {areaName} that publish their consultation fee.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {tiles.map(t => (
              <div key={t.label} style={{
                flex: '1 1 140px', padding: '16px 18px', background: '#F0FDFA',
                border: '1px solid #99F6E4', borderRadius: 12,
              }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: TEAL }}>{t.value}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 4 }}>
          Verified clinics in {areaName} haven&apos;t published their consultation fees yet. Most dentists here
          offer a paid first consultation — tap any clinic below to see its current fee, or message the clinic
          directly for a quote.
        </p>
      )}
    </div>
  )
}
