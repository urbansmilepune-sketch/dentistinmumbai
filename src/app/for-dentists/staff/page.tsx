// Landing page for invited staff after they accept the magic-link invite.
// Kept deliberately small: we show their role and the clinic they belong to,
// plus a couple of quick links. The full per-role portal experience
// (Reception's appointment booking, Associate Dentist's EMR write surface)
// can be layered on later — for now this proves the invite + auth round-trip
// works end-to-end.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const ROLE_LABEL: Record<string, string> = {
  reception: 'Reception',
  associate_dentist: 'Associate Dentist',
  owner: 'Clinic Owner',
}

export default async function StaffPortalPage() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) redirect('/for-dentists/login')

  // Use service-role for the clinic lookup so we can read the owner dentist's
  // public fields (name, clinic_name, slug) even though the staff member has
  // no policy granting access to that row.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: staff } = await admin
    .from('clinic_staff')
    .select('id, name, role, status, dentist_id')
    .ilike('email', user.email ?? '')
    .neq('status', 'removed')
    .maybeSingle()

  // If the user has a dentists row too (unusual but possible — a dentist
  // who also got invited as staff somewhere else), send them to their own
  // dashboard. The portal is only for invited-only accounts.
  const { data: ownDentist } = await admin
    .from('dentists')
    .select('id')
    .eq('email', user.email ?? '')
    .maybeSingle()
  if (ownDentist) redirect('/for-dentists/dashboard')

  if (!staff) {
    // Authenticated but no staff record found — likely a leftover login
    // attempt. Bounce to /register so they can sign up as their own dentist.
    redirect(`/for-dentists/register?email=${encodeURIComponent(user.email ?? '')}`)
  }

  const { data: clinic } = await admin
    .from('dentists')
    .select('id, name, clinic_name, slug')
    .eq('id', staff.dentist_id)
    .maybeSingle()

  const roleLabel = ROLE_LABEL[staff.role] || staff.role

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>👋</div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, marginBottom: 6 }}>
            Hi {staff.name || user.email?.split('@')[0]}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20 }}>
            You're signed in as <strong>{roleLabel}</strong> at{' '}
            <strong>{clinic?.clinic_name || 'your clinic'}</strong>
            {clinic?.name ? ` (${clinic.name})` : ''}.
          </p>

          <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ fontSize: 14, color: 'var(--blue-dark)', lineHeight: 1.6 }}>
              The staff portal is in early access. Reach out to the clinic owner if you need
              to take actions that aren't available here yet.
            </p>
          </div>

          {clinic?.slug && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={`/dentist/${clinic.slug}`} style={{ padding: '11px 22px', background: 'var(--blue)', color: '#fff', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
                View Clinic Profile →
              </Link>
              <form action="/auth/signout" method="post" style={{ display: 'inline' }}>
                <button type="submit" style={{ padding: '11px 22px', background: '#fff', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
