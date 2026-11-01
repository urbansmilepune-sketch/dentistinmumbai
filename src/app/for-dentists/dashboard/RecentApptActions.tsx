'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  appointmentId: string
  status: string
  // 'large' = the full-width Decline / Confirm pair on the dashboard home
  // "Needs your reply" cards (thumb-sized on phones).
  variant?: 'compact' | 'large'
}

// Inline confirm/decline for the recent-appointments table on the dentist
// dashboard. Routes through /api/dentist/appointments/[id] (same endpoint
// the appointments page uses) so server-side side-effects — confirmation
// email, status transition guardrails — fire identically here. After
// success we router.refresh() so the dashboard's server data re-fetches.
export default function RecentApptActions({ appointmentId, status, variant = 'compact' }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'pending') return null

  async function patch(next: 'confirmed' | 'cancelled') {
    setError(null)
    setBusy(next === 'confirmed' ? 'confirm' : 'cancel')
    try {
      const res = await fetch(`/api/dentist/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || data.message || 'Status change failed.')
        return
      }
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Network error')
    } finally {
      setBusy(null)
    }
  }

  if (variant === 'large') {
    const btn: React.CSSProperties = {
      height: 42, borderRadius: 10, fontWeight: 700, fontSize: 14,
      fontFamily: 'var(--font-body)', cursor: busy ? 'wait' : 'pointer',
    }
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => patch('cancelled')} disabled={busy !== null}
            style={{ ...btn, background: '#fff', color: 'var(--text)', border: '1.5px solid var(--border)' }}>
            {busy === 'cancel' ? 'Declining…' : 'Decline'}
          </button>
          <button onClick={() => patch('confirmed')} disabled={busy !== null}
            style={{ ...btn, background: '#14B8A6', color: '#fff', border: '1.5px solid #14B8A6' }}>
            {busy === 'confirm' ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
        {error && <span style={{ fontSize: 12, color: '#991B1B' }}>{error}</span>}
      </div>
    )
  }

  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={() => patch('confirmed')} disabled={busy !== null}
        title="Confirm appointment"
        style={{ padding: '5px 10px', background: '#DBEAFE', color: '#1D4ED8', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {busy === 'confirm' ? '…' : '✓ Confirm'}
      </button>
      <button onClick={() => patch('cancelled')} disabled={busy !== null}
        title="Decline appointment"
        style={{ padding: '5px 10px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {busy === 'cancel' ? '…' : '✕ Decline'}
      </button>
      {error && <span style={{ fontSize: 11, color: '#991B1B' }}>{error}</span>}
    </div>
  )
}
