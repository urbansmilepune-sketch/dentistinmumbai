import { redirect } from 'next/navigation'

// Upgrade flow is hidden for the launch phase. Any direct visit, deep
// link from FeatureGate/UpgradeBanner, or old bookmark lands back on
// the dashboard so the dentist never sees a pricing surface. The
// underlying PlanSelector / CheckoutButton / RoiCalculator files in
// this directory are kept on disk so re-enabling the flow is a one-
// file revert (replace the redirect with the original page body).

export default function UpgradePage(): never {
  redirect('/for-dentists/dashboard')
}
