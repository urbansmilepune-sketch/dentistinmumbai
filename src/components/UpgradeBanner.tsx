'use client'

// Inline upgrade nudge — sits at the top of a page or section to call out
// that a feature is locked at the current tier. Compact horizontal layout
// so it doesn't take over the page; the FeatureGate overlay handles the
// emphatic "locked + blurred" treatment for the content itself.

import Link from 'next/link'
import { tierMeets, type Tier } from '@/lib/tier'

interface Props {
  requiredTier: 'silver' | 'gold'
  featureName: string
  benefitText: string
  dentistTier: unknown
}

const COPY: Record<Props['requiredTier'], { cta: string; bg: string; border: string; text: string; accent: string }> = {
  silver: {
    cta: 'Upgrade to Silver →',
    bg: '#F1F5F9', border: '#CBD5E1',
    text: '#334155', accent: '#475569',
  },
  gold: {
    cta: 'Upgrade to Gold →',
    bg: 'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)',
    border: '#FDE68A',
    text: '#7C2D12', accent: '#92400E',
  },
}

export default function UpgradeBanner({ requiredTier, featureName, benefitText, dentistTier }: Props) {
  if (tierMeets(dentistTier, requiredTier as Tier)) return null

  const c = COPY[requiredTier]

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>🔒</span>
      <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: c.text, lineHeight: 1.5 }}>
        <strong style={{ color: c.accent }}>{featureName}</strong>
        <span style={{ margin: '0 8px', color: c.accent }}>·</span>
        {benefitText}
      </div>
      <Link
        href="/for-dentists/dashboard/upgrade"
        style={{
          padding: '9px 16px', minHeight: 40,
          background: 'var(--blue)', color: '#fff',
          borderRadius: 8,
          fontFamily: 'var(--font-body)',
          fontWeight: 700, fontSize: 13,
          textDecoration: 'none', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center',
        }}
      >{c.cta}</Link>
    </div>
  )
}
