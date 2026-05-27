// Staff used to land on a minimal placeholder portal here. The dashboard
// layout now handles staff sessions (looking up the owner dentist via
// clinic_staff.dentist_id and filtering the sidebar by role), so this
// route just bounces to /dashboard. Kept rather than deleted so any
// in-flight invite link / bookmark still resolves to a working surface.

import { redirect } from 'next/navigation'

export default function StaffPortalRedirect() {
  redirect('/for-dentists/dashboard')
}
