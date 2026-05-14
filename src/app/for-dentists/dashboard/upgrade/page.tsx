import PlanSelector from './PlanSelector'

type Plan = 'monthly' | 'annual'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parsePlan(v: string | string[] | undefined): Plan | null {
  const s = Array.isArray(v) ? v[0] : v
  return s === 'monthly' || s === 'annual' ? s : null
}

export default async function UpgradePage({ searchParams }: Props) {
  const params = await searchParams
  const defaultPlan = parsePlan(params.plan)

  return (
    <div>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, marginBottom: 8 }}>Upgrade Your Plan</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 480, margin: '0 auto' }}>Get more patients with better visibility. Cancel anytime.</p>
      </div>

      <PlanSelector defaultPlan={defaultPlan} />

      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>Questions about plans? Talk to us directly.</p>
        <a href="https://wa.me/917719903232" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: '#25D366', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          💬 WhatsApp Us
        </a>
      </div>
    </div>
  )
}
