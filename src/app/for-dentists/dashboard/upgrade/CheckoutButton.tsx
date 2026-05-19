'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCityByDomain, CITY_CONFIGS, DEFAULT_CITY, type CityConfig } from '@/config/cities'

declare global {
  interface Window {
    Razorpay: any
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') return resolve(false)
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

type Tier = 'silver' | 'gold'
type Billing = 'monthly' | 'annual'

const TIER_LABEL: Record<Tier, string> = { silver: 'Silver', gold: 'Gold' }
const TIER_THEME: Record<Tier, string> = { silver: '#475569', gold: '#92400E' }

interface Props {
  plan: Tier
  billing: Billing
  color: string
  label?: string
}

export default function CheckoutButton({ plan, billing, color, label }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cityConfig, setCityConfig] = useState<CityConfig>(CITY_CONFIGS[DEFAULT_CITY])
  useEffect(() => { setCityConfig(getCityByDomain(window.location.hostname)) }, [])

  async function handlePay() {
    setError('')
    setLoading(true)

    const ok = await loadRazorpay()
    if (!ok) {
      setError('Could not load payment provider. Check your connection and try again.')
      setLoading(false)
      return
    }

    const orderRes = await fetch('/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, billing }),
    })
    if (!orderRes.ok) {
      const body = await orderRes.json().catch(() => ({}))
      setError(body.error || 'Could not start payment. Please try again.')
      setLoading(false)
      return
    }
    const order = await orderRes.json()

    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: cityConfig.domain,
      description: order.plan_label || `${TIER_LABEL[plan]} Plan — ${billing === 'annual' ? 'Annual (365 days)' : 'Monthly (30 days)'}`,
      order_id: order.order_id,
      prefill: { name: order.dentist_name, email: order.dentist_email },
      theme: { color: TIER_THEME[plan] },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verifyRes = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        })
        const verifyBody = await verifyRes.json().catch(() => ({}))
        if (!verifyRes.ok) {
          setError(verifyBody.error || 'Payment received but upgrade failed. Contact support.')
          setLoading(false)
          return
        }
        router.refresh()
        alert(`Welcome to ${TIER_LABEL[plan]}! Your account is upgraded.`)
        setLoading(false)
      },
      modal: {
        ondismiss: () => setLoading(false),
      },
    })

    rzp.on('payment.failed', (resp: any) => {
      setError(resp?.error?.description || 'Payment failed.')
      setLoading(false)
    })

    rzp.open()
  }

  return (
    <>
      <button
        onClick={handlePay}
        disabled={loading}
        style={{ display: 'block', width: '100%', padding: '12px', background: color, color: '#fff', borderRadius: 10, textAlign: 'center', fontSize: 14, fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'var(--font-body)' }}
      >
        {loading ? 'Opening Razorpay…' : (label ?? `Upgrade to ${TIER_LABEL[plan]} (${billing === 'annual' ? 'Annual' : 'Monthly'}) →`)}
      </button>
      {error && (
        <p style={{ marginTop: 10, fontSize: 12, color: '#991B1B', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px' }}>
          {error}
        </p>
      )}
    </>
  )
}
