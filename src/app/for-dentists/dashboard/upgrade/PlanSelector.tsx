'use client'

import { useState, useEffect } from 'react'
import GoldCheckoutButton from './GoldCheckoutButton'
import { getCityByDomain, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

type Period = 'monthly' | 'annual'

const MONTHLY_PRICE = 999
const ANNUAL_PRICE = 9999
const ANNUAL_SAVINGS = MONTHLY_PRICE * 12 - ANNUAL_PRICE // ₹1,989

interface Props {
  defaultPlan?: Period | null
}

export default function PlanSelector({ defaultPlan }: Props = {}) {
  const [period, setPeriod] = useState<Period>(defaultPlan ?? 'annual')
  const [cityConfig, setCityConfig] = useState<CityConfig>(CITY_CONFIGS[DEFAULT_CITY])
  useEffect(() => { setCityConfig(getCityByDomain(window.location.hostname)) }, [])

  const goldPrice = period === 'annual' ? `₹${ANNUAL_PRICE.toLocaleString('en-IN')}` : `₹${MONTHLY_PRICE.toLocaleString('en-IN')}`
  const goldPeriodLabel = period === 'annual' ? '/year' : '/month'

  return (
    <>
      {/* Period toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <div role="tablist" aria-label="Billing period"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999,
          }}>
          <ToggleButton active={period === 'monthly'} onClick={() => setPeriod('monthly')} label="Monthly" />
          <ToggleButton active={period === 'annual'} onClick={() => setPeriod('annual')}
            label="Annual"
            badge={`Save ₹${ANNUAL_SAVINGS.toLocaleString('en-IN')}`} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, maxWidth: 1100, margin: '0 auto' }}>
        {/* Free */}
        <PlanCard
          name="Free" color="#6B7280" price="₹0" periodLabel="forever"
          features={['Full clinic profile', 'Booking system', 'Patient reviews', 'Google Maps', 'WhatsApp button', 'Basic analytics']}
          footer={<CurrentPill />}
        />

        {/* Silver — pricing is set via WhatsApp negotiation until we publish a
            self-serve flow. Footer mirrors the Featured pattern. */}
        <PlanCard
          name="✦ Silver" color="#475569" price="On request" periodLabel=""
          features={[
            'Everything in Free',
            'Up to 3 staff accounts',
            '3 clinic locations',
            'Bulk email blasts',
            'All message templates',
            'Send history & audit log',
            '30-day analytics trends',
          ]}
          footer={
            <a href={`https://wa.me/917719903232?text=${encodeURIComponent(`Hi, I want to upgrade my ${cityConfig.domain} listing to Silver. Please share pricing.`)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', width: '100%', padding: '12px', background: '#475569', color: '#fff', borderRadius: 10, textAlign: 'center', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Get Silver →
            </a>
          }
        />

        {/* Gold (price + cta react to toggle) */}
        <PlanCard
          name="Gold" color="#92400E" price={goldPrice} periodLabel={goldPeriodLabel}
          badge="⭐ Most Popular"
          subPrice={period === 'annual' ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '4px 10px', background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              ✓ 2 months FREE · Save ₹{ANNUAL_SAVINGS.toLocaleString('en-IN')}
            </div>
          ) : null}
          features={[
            'Everything in Free',
            'Priority placement in search',
            'Full analytics dashboard',
            'Profile views tracking',
            'WhatsApp click tracking',
            'Call tracking',
            'Leaderboard access',
            'Featured badge on listing',
          ]}
          footer={<GoldCheckoutButton color="#92400E" plan={period} />}
        />

        {/* Featured (stays monthly — handled via WhatsApp negotiation) */}
        <PlanCard
          name="Featured" color="#C2410C" price="₹2,499" periodLabel="/month"
          badge="🔥 Maximum Visibility"
          subPrice={period === 'annual' ? (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
              Annual pricing on request — message us.
            </div>
          ) : null}
          features={[
            'Everything in Gold',
            'Top of search results',
            'Homepage featured slot',
            'Dedicated account manager',
            'Custom profile URL',
            'Social media promotion',
            'Priority support',
          ]}
          footer={
            <a href={`https://wa.me/917719903232?text=${encodeURIComponent(`Hi, I want to upgrade my ${cityConfig.domain} listing to the Featured plan. My clinic is listed on the platform.`)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', width: '100%', padding: '12px', background: '#C2410C', color: '#fff', borderRadius: 10, textAlign: 'center', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Get Featured →
            </a>
          }
        />
      </div>
    </>
  )
}

function ToggleButton({ active, onClick, label, badge }: { active: boolean; onClick: () => void; label: string; badge?: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', minHeight: 44,
        background: active ? '#fff' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
        border: 'none', borderRadius: 999,
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
        cursor: 'pointer',
      }}>
      {label}
      {badge && (
        <span style={{
          fontSize: 11, fontWeight: 700,
          padding: '2px 8px', borderRadius: 20,
          background: active ? '#DCFCE7' : '#E5E7EB',
          color: active ? '#166534' : '#6B7280',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

function PlanCard({ name, color, price, periodLabel, badge, subPrice, features, footer }: {
  name: string
  color: string
  price: string
  periodLabel: string
  badge?: string
  subPrice?: React.ReactNode
  features: string[]
  footer: React.ReactNode
}) {
  return (
    <div style={{ background: '#fff', border: `2px solid ${color}20`, borderRadius: 20, padding: '28px', position: 'relative', overflow: 'hidden' }}>
      {badge && (
        <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 11, fontWeight: 700, padding: '3px 10px', background: '#FEF3C7', color, borderRadius: 20 }}>{badge}</div>
      )}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color, marginBottom: 4 }}>{name}</h2>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32 }}>{price}</span>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>{periodLabel}</span>
        </div>
        {subPrice}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {features.map(f => (
          <div key={f} style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>✓</span>
            {f}
          </div>
        ))}
      </div>
      {footer}
    </div>
  )
}

function CurrentPill() {
  return (
    <div style={{ width: '100%', padding: '12px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
      Current Plan
    </div>
  )
}
