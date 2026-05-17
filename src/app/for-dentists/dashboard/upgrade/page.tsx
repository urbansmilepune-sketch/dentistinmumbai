import { Fragment } from 'react'
import PlanSelector from './PlanSelector'
import RoiCalculator from './RoiCalculator'

type Plan = 'monthly' | 'annual'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parsePlan(v: string | string[] | undefined): Plan | null {
  const s = Array.isArray(v) ? v[0] : v
  return s === 'monthly' || s === 'annual' ? s : null
}

// Feature matrix derived directly from the tier gates wired into the
// dashboard (FeatureGate / UpgradeBanner / limit constants in each page).
// When a tier rule changes there, update the matching row here so the
// upgrade-page promise matches the actual product behaviour. A row's value
// is rendered verbatim; '✓' marks "included with no caveat".
type Cell = string | { mark: '✓' } | { mark: '—' }
interface Row { label: string; free: Cell; silver: Cell; gold: Cell; featured: Cell }
interface Group { title: string; rows: Row[] }

const COMPARISON: Group[] = [
  {
    title: 'Listing & profile',
    rows: [
      { label: 'Public clinic profile',         free: { mark: '✓' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'Booking system',                 free: { mark: '✓' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'Patient reviews',                free: { mark: '✓' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'Google Maps embed',              free: { mark: '✓' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'WhatsApp button',                free: { mark: '✓' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'Branded QR card download',       free: { mark: '✓' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'Gallery photos',                 free: '5 photos',    silver: '20 photos',   gold: '20 photos',   featured: '20 photos' },
      { label: 'Clinic locations',               free: '2',           silver: '3',           gold: 'Unlimited',   featured: 'Unlimited' },
      { label: 'Priority placement in search',   free: { mark: '—' }, silver: { mark: '—' }, gold: { mark: '✓' }, featured: 'Top of results' },
      { label: 'Homepage featured slot',         free: { mark: '—' }, silver: { mark: '—' }, gold: { mark: '—' }, featured: { mark: '✓' } },
      { label: 'Featured badge on listing',      free: { mark: '—' }, silver: { mark: '—' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'Custom profile URL',             free: { mark: '—' }, silver: { mark: '—' }, gold: { mark: '—' }, featured: { mark: '✓' } },
    ],
  },
  {
    title: 'Patient communications',
    rows: [
      { label: 'WhatsApp message blasts',         free: 'Individual only', silver: 'Bulk',           gold: 'Bulk',            featured: 'Bulk' },
      { label: 'Email message blasts',            free: { mark: '—' },     silver: 'Bulk',           gold: 'Bulk',            featured: 'Bulk' },
      { label: 'Appointment reminder template',   free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Holiday / closure template',      free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Post-treatment follow-up',        free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Offer / discount template',       free: { mark: '—' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'New service announcement',        free: { mark: '—' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Birthday wishes template',        free: { mark: '—' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Send history & audit log',        free: { mark: '—' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
    ],
  },
  {
    title: 'Team & operations',
    rows: [
      { label: 'Staff accounts',                  free: { mark: '—' },     silver: 'Up to 3',        gold: 'Unlimited',       featured: 'Unlimited' },
      { label: 'Role-based access (reception, associate)', free: { mark: '—' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'EMR templates',                   free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Treatments & pricing manager',    free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Patient timeline',                free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Consent forms',                   free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
    ],
  },
  {
    title: 'Analytics & insights',
    rows: [
      { label: 'Profile views, enquiries, WhatsApp clicks', free: { mark: '✓' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: 'Full stats grid (calls, bookings, reviews)',free: { mark: '—' }, silver: { mark: '✓' }, gold: { mark: '✓' }, featured: { mark: '✓' } },
      { label: '30-day trend chart',              free: { mark: '—' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Daily engagement funnel',         free: { mark: '—' },     silver: { mark: '—' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Leaderboard access',              free: { mark: '—' },     silver: { mark: '—' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
    ],
  },
  {
    title: 'Support',
    rows: [
      { label: 'Email support',                   free: { mark: '✓' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'WhatsApp support',                free: { mark: '—' },     silver: { mark: '✓' },    gold: { mark: '✓' },     featured: { mark: '✓' } },
      { label: 'Dedicated account manager',       free: { mark: '—' },     silver: { mark: '—' },    gold: { mark: '—' },     featured: { mark: '✓' } },
      { label: 'Social media promotion',          free: { mark: '—' },     silver: { mark: '—' },    gold: { mark: '—' },     featured: { mark: '✓' } },
    ],
  },
]

export default async function UpgradePage({ searchParams }: Props) {
  const params = await searchParams
  const defaultPlan = parsePlan(params.plan)

  return (
    <div>
      {/* Founding member urgency band. The "first 250" cohort is the only
          way to lock the listed prices; once it closes, plans reprice. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'linear-gradient(135deg, #003F7A 0%, #0057A8 100%)',
        color: '#fff', borderRadius: 14,
        padding: '14px 18px', marginBottom: 28, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 26, flexShrink: 0 }}>🏅</span>
        <div style={{ flex: 1, minWidth: 240, lineHeight: 1.45 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>
            Founding Member pricing — locked for life
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)' }}>
            First 250 dentists per city pay ₹999/mo for Gold instead of ₹1,999/mo. Your founding number is reserved on signup; renewals stay at this price as long as you don&apos;t cancel.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, marginBottom: 8 }}>Upgrade Your Plan</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 480, margin: '0 auto' }}>Get more patients with better visibility. Cancel anytime.</p>
      </div>

      <PlanSelector defaultPlan={defaultPlan} />

      {/* ROI calculator — interactive, sits between pricing and matrix so
          dentists can do the maths before scrolling further. */}
      <div style={{ marginTop: 40 }}>
        <RoiCalculator />
      </div>

      {/* Feature comparison matrix */}
      <div style={{ marginTop: 48 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 6, textAlign: 'center' }}>Compare plans, feature by feature</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 24 }}>
          Every gate enforced in the dashboard maps to a row below.
        </p>
        <ComparisonTable />
      </div>

      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>Questions about plans? Talk to us directly.</p>
        <a href="https://wa.me/917719903232" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: '#25D366', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          💬 WhatsApp Us
        </a>
      </div>
    </div>
  )
}

function ComparisonTable() {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            <th style={headStyle}>Feature</th>
            <th style={{ ...headStyle, textAlign: 'center' }}>Free</th>
            <th style={{ ...headStyle, textAlign: 'center', color: '#334155' }}>✦ Silver</th>
            <th style={{ ...headStyle, textAlign: 'center', color: '#92400E' }}>⭐ Gold</th>
            <th style={{ ...headStyle, textAlign: 'center', color: '#C2410C' }}>🔥 Featured</th>
          </tr>
        </thead>
        <tbody>
          {COMPARISON.map(group => (
            <Fragment key={group.title}>
              <tr style={{ background: '#FAFBFC' }}>
                <td colSpan={5} style={{ padding: '12px 16px', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  {group.title}
                </td>
              </tr>
              {group.rows.map((row, i) => (
                <tr key={`${group.title}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={cellStyle}>{row.label}</td>
                  <CellTd value={row.free} />
                  <CellTd value={row.silver} />
                  <CellTd value={row.gold} />
                  <CellTd value={row.featured} />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CellTd({ value }: { value: Cell }) {
  if (typeof value === 'string') {
    return <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 600 }}>{value}</td>
  }
  if (value.mark === '✓') {
    return <td style={{ ...cellStyle, textAlign: 'center', color: '#166534', fontSize: 16, fontWeight: 800 }}>✓</td>
  }
  return <td style={{ ...cellStyle, textAlign: 'center', color: '#CBD5E1' }}>—</td>
}

const headStyle: React.CSSProperties = {
  padding: '12px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--muted)',
  borderBottom: '1px solid var(--border)',
}
const cellStyle: React.CSSProperties = {
  padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)',
  verticalAlign: 'middle',
}
