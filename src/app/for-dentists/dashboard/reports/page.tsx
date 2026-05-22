import { redirect } from 'next/navigation'

// Reports merged into /dashboard/analytics as the "Revenue & Reports"
// sub-tab. This route now 302s so old bookmarks, recent-commits diffs,
// and any UI that still links to /reports continue to land the dentist
// on the same content.

export default function ReportsRedirect(): never {
  redirect('/for-dentists/dashboard/analytics?tab=reports')
}
