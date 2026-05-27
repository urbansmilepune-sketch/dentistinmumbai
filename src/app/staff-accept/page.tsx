// Public landing page for the token-based staff invite flow. The token
// in the URL gates the lookup; service role bypasses RLS so an
// unauthenticated visitor can render their own invite row but nothing
// else. The actual password set + activation goes through
// POST /api/staff/accept, which re-verifies the token server-side.

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { getCityByDomain } from '@/config/cities'
import { INVITE_TTL_MS } from '@/app/api/staff/accept/route'
import AcceptForm from './AcceptForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Clinic Owner',
  associate_dentist: 'Associate Dentist',
  reception: 'Reception',
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function StaffAcceptPage({ searchParams }: PageProps) {
  const { token } = await searchParams
  const h = await headers()
  const city = getCityByDomain(h.get('host'))

  if (!token) return <Shell><Message kind="error" title="Missing invite token" body="The link you clicked is missing the token. Ask your clinic owner to send a fresh invite." /></Shell>

  const db = admin()
  const { data: row } = await db
    .from('clinic_staff')
    .select('id, email, role, status, dentist_id, invited_at, dentists(clinic_name, name)')
    .eq('invite_token', token)
    .maybeSingle()

  if (!row) {
    return <Shell><Message kind="error" title="Invite link is no longer valid" body="This invite has either already been accepted or been replaced by a newer one. Ask your clinic owner to send a fresh invite." /></Shell>
  }
  if (row.status !== 'pending') {
    return <Shell><Message kind="info" title="Invite already accepted" body="You've already set up your account. Use the regular sign-in page to log in." cta={{ href: '/for-dentists/login', label: 'Go to sign in' }} /></Shell>
  }

  // Mirror the 30-day expiry from /api/staff/accept so the staff
  // member sees the friendly block here instead of typing a password
  // and getting rejected at submit.
  const invitedAtMs = row.invited_at ? new Date(row.invited_at).getTime() : 0
  if (!invitedAtMs || Date.now() - invitedAtMs > INVITE_TTL_MS) {
    return <Shell><Message kind="error" title="Invite link expired" body="Please ask your dentist to send a new invite. Invite links are valid for 30 days." /></Shell>
  }

  const dentistRow = row.dentists as any
  const clinicName = dentistRow?.clinic_name || 'your clinic'
  const ownerName = dentistRow?.name || 'The clinic owner'
  const roleLabel = ROLE_LABEL[row.role] || row.role

  return (
    <Shell>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 6 }}>You're invited 👋</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          <strong>{ownerName}</strong> has invited you to join <strong>{clinicName}</strong> on {city.domain} as <strong>{roleLabel}</strong>. Set a password below to access the clinic dashboard.
        </p>
      </div>

      <div style={{ background: '#F8FAFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>Signing in as</span>{' '}
        <strong style={{ color: 'var(--text)' }}>{row.email}</strong>
      </div>

      <AcceptForm token={token} email={row.email} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, border: '1px solid var(--border)', padding: '32px 28px', boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </div>
  )
}

function Message({ kind, title, body, cta }: { kind: 'error' | 'info'; title: string; body: string; cta?: { href: string; label: string } }) {
  const accent = kind === 'error' ? { bg: '#FEE2E2', border: '#FECACA', text: '#991B1B' } : { bg: '#DBEAFE', border: '#BFDBFE', text: '#1E3A8A' }
  return (
    <div>
      <div style={{ background: accent.bg, border: `1px solid ${accent.border}`, color: accent.text, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{body}</div>
      </div>
      {cta && (
        <a href={cta.href} style={{ display: 'inline-block', padding: '11px 22px', background: 'var(--blue)', color: '#fff', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>{cta.label}</a>
      )}
    </div>
  )
}
