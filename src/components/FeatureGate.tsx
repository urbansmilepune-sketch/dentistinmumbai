'use client'

// Tier-gating disabled for launch phase — every feature is unlocked for
// every dentist regardless of stored tier. The component's props signature
// is preserved verbatim so existing callsites compile without edits; this
// file just hands children straight through. Re-enabling gating later is
// a one-file revert (restore the original blur-overlay implementation).

interface Props {
  children: React.ReactNode
  requiredTier: 'silver' | 'gold'
  featureName: string
  benefitText: string
  dentistTier: unknown
  compact?: boolean
  display?: 'block' | 'inline'
}

export default function FeatureGate({ children }: Props) {
  return <>{children}</>
}
