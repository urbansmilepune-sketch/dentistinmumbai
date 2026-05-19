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
  // Post-verify success state: when set, the button slot is replaced by an
  // in-page green confirmation card showing the new expiry and a 3-second
  // countdown to /for-dentists/dashboard. Replaces the previous alert() flow
  // so the dentist gets a real receipt-style confirmation, not a native
  // dialog they have to dismiss.
  const [succeeded, setSucceeded] = useState<{ tierExpiresAt: string } | null>(null)

  useEffect(() => { setCityConfig(getCityByDomain(window.location.hostname)) }, [])

  // 3-second redirect once the success card mounts. Separate effect from the
  // verify handler so React reliably tears the timer down if the component
  // unmounts before the timeout fires.
  useEffect(() => {
    if (!succeeded) return
    const t = setTimeout(() => router.push('/for-dentists/dashboard'), 3000)
    return () => clearTimeout(t)
  }, [succeeded, router])

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
        // router.refresh() so the dashboard layout re-fetches the dentists
        // row before the 3s redirect lands — the new tier pill shows up the
        // moment the user arrives at /for-dentists/dashboard.
        router.refresh()
        setSucceeded({ tierExpiresAt: verifyBody.tier_expires_at })
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

  if (succeeded) {
    // en-IN: "18 June 2026" — same format the email uses, kept consistent
    // so the dentist sees one canonical "valid until" string across surfaces.
    const validUntil = new Date(succeeded.tierExpiresAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    return (
      <div
        role="status"
        style={{
          padding: 16, borderRadius: 12,
          background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46',
          textAlign: 'center', fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>🎉</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: '#064E3B', marginBottom: 4 }}>
          Welcome to {TIER_LABEL[plan]}!
        </div>
        <div style={{ fontSize: 13, color: '#047857', lineHeight: 1.5 }}>
          Your plan is active until <strong>{validUntil}</strong>.
        </div>
        <div style={{ fontSize: 12, color: '#059669', marginTop: 8 }}>
          Redirecting to dashboard in 3 seconds…
        </div>
      </div>
    )
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
