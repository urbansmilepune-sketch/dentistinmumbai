'use client'

// Wraps a chunk of UI that is only available at a certain tier. When the
// dentist's tier meets the requirement, children render unchanged. Otherwise
// the same children render BLURRED (so the dentist sees a preview of what
// they're missing) under an absolute overlay with a lock icon, the feature
// name, and an upgrade CTA. `pointer-events: none` on the blurred layer
// prevents interaction with the locked content.
//
// `compact` mode shrinks the overlay for inline use (single buttons,
// individual list items) where the surrounding layout doesn't have room
// for the larger card-style overlay.

import Link from 'next/link'
import { tierMeets, type Tier } from '@/lib/tier'

interface Props {
  children: React.ReactNode
  requiredTier: 'silver' | 'gold'
  featureName: string
  benefitText: string
  dentistTier: unknown
  compact?: boolean
  /** Visual style of the wrapper. Defaults to 'block'; 'inline' keeps the
   *  gate sized to its children (useful for inline buttons / pills). */
  display?: 'block' | 'inline'
}

const TIER_COPY: Record<Props['requiredTier'], { cta: string; pill: string; pillBg: string; pillBorder: string }> = {
  silver: {
    cta: 'Upgrade to Silver →',
    pill: '✦ Silver',
    pillBg: '#E2E8F0',
    pillBorder: '#CBD5E1',
  },
  gold: {
    cta: 'Upgrade to Gold →',
    pill: '⭐ Gold',
    pillBg: '#FEF3C7',
    pillBorder: '#FDE68A',
  },
}

export default function FeatureGate({
  children,
  requiredTier,
  featureName,
  benefitText,
  dentistTier,
  compact = false,
  display = 'block',
}: Props) {
  if (tierMeets(dentistTier, requiredTier as Tier)) {
    return <>{children}</>
  }

  const copy = TIER_COPY[requiredTier]

  return (
    <div style={{ position: 'relative', display: display === 'inline' ? 'inline-block' : 'block' }}>
      {/* The actual content — blurred, non-interactive, unselectable. */}
      <div
        aria-hidden
        style={{
          filter: 'blur(3px)',
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.7,
        }}
      >
        {children}
      </div>

      {/* Lock overlay sitting above the blurred content. */}
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: compact ? 8 : 16,
          zIndex: 5,
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.96)',
            border: '1px solid var(--border)',
            borderRadius: compact ? 10 : 14,
            boxShadow: '0 6px 24px rgba(15, 25, 35, 0.12)',
            padding: compact ? '10px 14px' : '20px 22px',
            maxWidth: compact ? 280 : 380,
            textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: compact ? 6 : 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: compact ? 16 : 22 }}>🔒</span>
            <span style={{
              fontSize: 11, fontWeight: 700,
              padding: '2px 8px', borderRadius: 20,
              background: copy.pillBg, color: '#475569',
              border: `1px solid ${copy.pillBorder}`,
            }}>{copy.pill}</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: compact ? 13 : 15,
            color: 'var(--text)',
            lineHeight: 1.3,
          }}>{featureName}</div>
          {!compact && (
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              {benefitText}
            </div>
          )}
          <Link
            href="/for-dentists/dashboard/upgrade"
            style={{
              display: 'inline-block',
              padding: compact ? '7px 12px' : '9px 16px',
              background: 'var(--blue)', color: '#fff',
              borderRadius: 8,
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: compact ? 12 : 13,
              textDecoration: 'none',
              marginTop: compact ? 2 : 4,
            }}
          >{copy.cta}</Link>
        </div>
      </div>
    </div>
  )
}
