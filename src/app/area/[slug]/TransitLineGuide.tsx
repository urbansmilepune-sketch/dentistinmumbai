import Link from 'next/link'
import { NAVY, TEAL } from '@/app/dentist/[slug]/profileTheme'
import { dentistCountLabel } from '@/lib/dentistCount'

// Transit context for Mumbai areas. `zone` doubles as the Mumbai suburban
// railway line (Western / Central / Harbour…), the same convention the filter
// sidebar renders as "<zone> Line". Surfacing the line plus the other stations'
// areas that actually have dentists gives each Mumbai area page a genuinely
// local, unique block — and a useful commuter cross-link. Rendered only when
// the area has a real line and at least one same-line area with dentists;
// otherwise the caller omits it (no fake transit for non-Mumbai cities).
interface LineArea {
  name: string
  slug: string
  count: number
}

export default function TransitLineGuide({ areaName, zone, lineAreas }: { areaName: string; zone: string; lineAreas: LineArea[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: NAVY, marginBottom: 6 }}>
        🚉 Getting to {areaName}
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 18 }}>
        {areaName} is served by Mumbai&apos;s <strong>{zone} Line</strong>. If you commute by local train,
        these other {zone} Line areas also have verified dentists you can book:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {lineAreas.map(a => (
          <Link key={a.slug} href={`/area/${a.slug}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: '#F0FDFA', color: TEAL,
            border: '1px solid #99F6E4', borderRadius: 20, fontSize: 13, fontWeight: 600,
          }}>
            📍 {a.name}
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {dentistCountLabel(a.count)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
