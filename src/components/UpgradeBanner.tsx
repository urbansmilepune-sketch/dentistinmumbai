'use client'

// Upgrade-nudge banner — disabled for launch phase. The component's prop
// signature is preserved so callsites compile without churn; the body
// just returns null. Re-enabling the banner later is a one-file revert
// (restore the original Link + copy block).

interface Props {
  requiredTier: 'silver' | 'gold'
  featureName: string
  benefitText: string
  dentistTier: unknown
}

export default function UpgradeBanner(_props: Props) {
  return null
}
