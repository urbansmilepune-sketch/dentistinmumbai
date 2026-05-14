'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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

interface Props {
  color: string
  plan?: 'monthly' | 'annual'
  label?: string
}

export default function GoldCheckoutButton({ color, plan = 'monthly', label }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      body: JSON.stringify({ plan }),
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
      name: 'DentistInMumbai.in',
      description: order.plan_label || (plan === 'annual' ? 'Gold Plan — Annual (365 days)' : 'Gold Plan — Monthly (30 days)'),
      order_id: order.order_id,
      prefill: { name: order.dentist_name, email: order.dentist_email },
      theme: { color: '#92400E' },
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
        alert('Welcome to Gold! Your account is upgraded.')
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
        {loading ? 'Opening Razorpay…' : (label ?? (plan === 'annual' ? 'Upgrade to Gold (Annual) →' : 'Upgrade to Gold (Monthly) →'))}
      </button>
      {error && (
        <p style={{ marginTop: 10, fontSize: 12, color: '#991B1B', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px' }}>
          {error}
        </p>
      )}
    </>
  )
}
