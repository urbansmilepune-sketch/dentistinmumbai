import Link from 'next/link'

export default function UpgradePage() {
  const PLANS = [
    {
      name: 'Free', price: '₹0', period: 'forever', color: '#6B7280', bg: '#F9FAFB',
      features: ['Full clinic profile', 'Booking system', 'Patient reviews', 'Google Maps', 'WhatsApp button', 'Basic analytics'],
      cta: 'Current Plan', disabled: true,
    },
    {
      name: 'Gold', price: '₹999', period: '/month', color: '#92400E', bg: '#FEF3C7',
      badge: '⭐ Most Popular',
      features: ['Everything in Free', 'Priority placement in search', 'Full analytics dashboard', 'Profile views tracking', 'WhatsApp click tracking', 'Call tracking', 'Leaderboard access', 'Featured badge on listing'],
      cta: 'Upgrade to Gold', disabled: false,
    },
    {
      name: 'Featured', price: '₹2,499', period: '/month', color: '#C2410C', bg: '#FFF7ED',
      badge: '🔥 Maximum Visibility',
      features: ['Everything in Gold', 'Top of search results', 'Homepage featured slot', 'Dedicated account manager', 'Custom profile URL', 'Social media promotion', 'Priority support'],
      cta: 'Get Featured', disabled: false,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, marginBottom: 8 }}>Upgrade Your Plan</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 480, margin: '0 auto' }}>Get more patients with better visibility. Cancel anytime.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, maxWidth: 900, margin: '0 auto' }}>
        {PLANS.map(plan => (
          <div key={plan.name} style={{ background: '#fff', border: `2px solid ${plan.color}20`, borderRadius: 20, padding: '28px', position: 'relative', overflow: 'hidden' }}>
            {plan.badge && (
              <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 11, fontWeight: 700, padding: '3px 10px', background: plan.bg, color: plan.color, borderRadius: 20 }}>{plan.badge}</div>
            )}
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: plan.color, marginBottom: 4 }}>{plan.name}</h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32 }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>{plan.period}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                  <span style={{ color: plan.color, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </div>
              ))}
            </div>
            {plan.disabled ? (
              <div style={{ width: '100%', padding: '12px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>Current Plan</div>
            ) : (
              <a href={`https://wa.me/917719903232?text=Hi, I want to upgrade my dentistinmumbai.in listing to the ${plan.name} plan. My clinic is listed on the platform.`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', width: '100%', padding: '12px', background: plan.color, color: '#fff', borderRadius: 10, textAlign: 'center', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                {plan.cta} →
              </a>
            )}
          </div>
        ))}
      </div>

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
